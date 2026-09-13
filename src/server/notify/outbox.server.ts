/**
 * Delivery outbox.
 *
 * Detection and delivery used to be the same synchronous loop: a cycle that
 * produced 500 pushes made 500 sequential Telegram calls inside one worker
 * request, which blows the worker's time budget and drops notifications on the
 * floor when the request is cut off. Nothing was retried, and a single 429
 * silently lost the message.
 *
 * Now detection only *enqueues* (one INSERT, microseconds) and delivery is a
 * separate, restartable, rate-aware worker:
 *
 *   detect → notification_outbox → drainOutbox() → Telegram
 *
 * The detection path still tries an immediate flush of its own rows so a
 * single-student push stays real time; the cron drain is the safety net that
 * makes delivery durable and lets throughput scale with worker count instead
 * of with one request's lifetime.
 */

/** Telegram allows ~30 messages/second globally; stay well inside it. */
const SEND_CONCURRENCY = 10;
/** Attempts before a message is declared dead. */
const MAX_ATTEMPTS = 5;
/** Backoff base in seconds: 30s, 60s, 120s, 240s. */
const BACKOFF_BASE = 30;

export interface OutboxRow {
  id: string;
  user_id: string | null;
  chat_id: string;
  body: string;
  attempts: number;
}

export interface DrainSummary {
  claimed: number;
  sent: number;
  retried: number;
  dead: number;
}

/**
 * Queues one message per user. Users with no linked chat are skipped.
 * Returns the ids that were queued, so the caller can flush them immediately.
 *
 * Idempotency: a message may carry a `dedupeKey`. The database holds a unique
 * index on it, so the *same* event can be enqueued from the student's own
 * sentinel and from a cluster fan-out (or from a retried cron tick) and the
 * student still receives exactly one Telegram message.
 */
export async function enqueuePushes(
  messages: readonly { userId: string; body: string; dedupeKey?: string }[],
): Promise<string[]> {
  if (messages.length === 0) return [];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // A cluster fan-out can enqueue for thousands of students at once, so both
  // the lookup and the insert are chunked: one 10 000-element `IN (...)` is a
  // statement Postgres has to plan as a giant array, and a single 10 000-row
  // insert can exceed the request body limit.
  const CHUNK = 500;
  const userIds = [...new Set(messages.map((m) => m.userId))];
  const chatOf = new Map<string, string>();
  for (let i = 0; i < userIds.length; i += CHUNK) {
    const { data } = await supabaseAdmin
      .from("dulms_accounts")
      .select("user_id, telegram_chat_id")
      .in("user_id", userIds.slice(i, i + CHUNK))
      .not("telegram_chat_id", "is", null);
    for (const row of data ?? []) {
      if (row.telegram_chat_id) chatOf.set(row.user_id, row.telegram_chat_id);
    }
  }

  type Row = { user_id: string; chat_id: string; body: string; dedupe_key: string | null };
  const rows = messages
    .map((message) => ({
      user_id: message.userId,
      chat_id: chatOf.get(message.userId) ?? null,
      body: message.body,
      dedupe_key: message.dedupeKey ?? null,
    }))
    .filter((row): row is Row => !!row.chat_id);

  if (rows.length === 0) return [];
  const keyed = rows.filter((row) => row.dedupe_key !== null);
  const plain = rows.filter((row) => row.dedupe_key === null);
  const ids: string[] = [];

  for (let i = 0; i < plain.length; i += CHUNK) {
    const { data, error } = await supabaseAdmin
      .from("notification_outbox")
      .insert(plain.slice(i, i + CHUNK))
      .select("id");
    if (error) {
      console.error("[outbox] enqueue failed", error);
      continue;
    }
    ids.push(...(data ?? []).map((row) => row.id));
  }

  for (let i = 0; i < keyed.length; i += CHUNK) {
    // ignoreDuplicates → an already-queued/sent event is silently dropped and
    // only genuinely new rows come back, so nothing is delivered twice.
    const { data, error } = await supabaseAdmin
      .from("notification_outbox")
      .upsert(keyed.slice(i, i + CHUNK), { onConflict: "dedupe_key", ignoreDuplicates: true })
      .select("id");
    if (error) {
      console.error("[outbox] idempotent enqueue failed", error);
      continue;
    }
    ids.push(...(data ?? []).map((row) => row.id));
  }
  return ids;
}

/** Sends a claimed batch, recording success, retry, or death per row. */
async function deliver(rows: readonly OutboxRow[]): Promise<DrainSummary> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendTelegramMessage } = await import("../telegram.server");
  const { mapWithConcurrency } = await import("../sync/shared");

  const summary: DrainSummary = { claimed: rows.length, sent: 0, retried: 0, dead: 0 };

  await mapWithConcurrency(rows, SEND_CONCURRENCY, async (row) => {
    const res = await sendTelegramMessage(row.chat_id, row.body);
    const now = new Date().toISOString();

    if (res.ok) {
      summary.sent += 1;
      await supabaseAdmin
        .from("notification_outbox")
        .update({ status: "sent", sent_at: now, claimed_at: null, attempts: row.attempts + 1 })
        .eq("id", row.id);
      return;
    }

    // Chat blocked / deleted: the subscription is gone, unlink and stop trying.
    if (res.dead) {
      summary.dead += 1;
      await supabaseAdmin
        .from("notification_outbox")
        .update({
          status: "dead",
          claimed_at: null,
          attempts: row.attempts + 1,
          last_error: res.error ?? "chat unavailable",
        })
        .eq("id", row.id);
      if (row.user_id) {
        await supabaseAdmin
          .from("dulms_accounts")
          .update({ telegram_chat_id: null })
          .eq("user_id", row.user_id);
      }
      return;
    }

    const attempts = row.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      summary.dead += 1;
      await supabaseAdmin
        .from("notification_outbox")
        .update({
          status: "dead",
          claimed_at: null,
          attempts,
          last_error: res.error ?? "delivery failed",
        })
        .eq("id", row.id);
      return;
    }

    // Transient (429 / 5xx / network): exponential backoff, honouring
    // Telegram's own "retry after N" when it tells us one.
    const retryAfter = Number(/retry after (\d+)/i.exec(res.error ?? "")?.[1]);
    const delay = Number.isFinite(retryAfter)
      ? retryAfter
      : BACKOFF_BASE * Math.pow(2, attempts - 1);
    summary.retried += 1;
    await supabaseAdmin
      .from("notification_outbox")
      .update({
        status: "pending",
        claimed_at: null,
        attempts,
        last_error: res.error ?? "delivery failed",
        next_attempt_at: new Date(Date.now() + delay * 1000).toISOString(),
      })
      .eq("id", row.id);
  });

  return summary;
}

/** Cron entry point: claims and delivers whatever is due. */
export async function drainOutbox(limit = 200, budgetMs = 40_000): Promise<DrainSummary> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const deadline = Date.now() + budgetMs;
  const total: DrainSummary = { claimed: 0, sent: 0, retried: 0, dead: 0 };

  // Keep draining within this request's time budget instead of one batch per
  // cron tick: a 10k-student fan-out queues far more than one batch, and
  // waiting a whole minute per 200 messages would turn "instant" into an hour.
  // Concurrent workers are safe — claim_outbox_batch locks rows with
  // FOR UPDATE SKIP LOCKED.
  while (Date.now() < deadline) {
    const { data, error } = await supabaseAdmin.rpc("claim_outbox_batch", {
      p_limit: limit,
      p_lock_seconds: 120,
    });
    if (error) {
      console.error("[outbox] claim failed", error);
      break;
    }
    const rows = (data ?? []) as unknown as OutboxRow[];
    if (rows.length === 0) break;

    const batch = await deliver(rows);
    total.claimed += batch.claimed;
    total.sent += batch.sent;
    total.retried += batch.retried;
    total.dead += batch.dead;

    if (rows.length < limit) break;
  }
  return total;
}

/**
 * Best-effort immediate flush of rows this request just queued, so a normal
 * single-student push keeps its sub-second latency. Anything not delivered
 * here stays pending and the cron drain picks it up.
 */
export async function flushNow(ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("notification_outbox")
    .update({ claimed_at: new Date().toISOString() })
    .in("id", ids as string[])
    .eq("status", "pending")
    .select("id, user_id, chat_id, body, attempts");
  const rows = (data ?? []) as unknown as OutboxRow[];
  if (rows.length === 0) return 0;
  return (await deliver(rows)).sent;
}
