/** Refreshes one student's DULMS data and records what changed. */
import { readAccountPassword } from "../credentials.server";
import { ensureKeyring } from "../crypto.server";
import { DulmsAuthError, scrapeDulms, type DulmsProfile, type ScrapedItem } from "../dulms.server";
import { canonicalJson, sameInstant } from "./diff";

import { notificationBody, notificationTitle } from "./labels";
import { MAX_NOTIFICATIONS_PER_SYNC, UPSERT_CHUNK, chunk, type SyncResult } from "./shared";

export async function syncUser(
  userId: string,
  options: { suppressRegistrationNotifications?: boolean } = {},
): Promise<SyncResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await ensureKeyring();

  const { data: account, error } = await supabaseAdmin
    .from("dulms_accounts")
    .select("dulms_id, password_ciphertext, key_version, sync_enabled, profile")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!account) {
    return { status: "error", message: "لا يوجد حساب DULMS مربوط", itemsFound: 0, newItems: 0 };
  }

  // The photo lives in its own table: it is ~800 KB of base64 and keeping it in
  // `dulms_accounts.profile` meant every sync tick detoasted and rewrote it,
  // which was the single largest source of database write I/O on this project.
  const { data: photoRow } = await supabaseAdmin
    .from("student_photos")
    .select("data_url")
    .eq("user_id", userId)
    .maybeSingle();
  const cachedPhoto = photoRow?.data_url ?? null;

  let scraped: ScrapedItem[] = [];
  let profile: DulmsProfile | null = null;
  try {
    const result = await scrapeDulms(
      account.dulms_id,
      readAccountPassword(account.password_ciphertext, account.key_version),
      cachedPhoto,
    );
    scraped = result.items;
    profile = result.profile;
  } catch (cause) {
    const isAuth = cause instanceof DulmsAuthError;
    const message = cause instanceof Error ? cause.message : "خطأ غير متوقع";
    await Promise.all([
      supabaseAdmin
        .from("dulms_accounts")
        .update({
          last_sync_at: new Date().toISOString(),
          last_sync_status: isAuth ? "auth_error" : "error",
          last_sync_error: message,
          sync_claimed_at: null,
        })
        .eq("user_id", userId),
      supabaseAdmin.from("sync_logs").insert({ user_id: userId, status: "error", message }),
    ]);
    return { status: isAuth ? "auth_error" : "error", message, itemsFound: 0, newItems: 0 };
  }

  const { data: existing } = await supabaseAdmin
    .from("dulms_items")
    .select("id, kind, external_key, title, status, score, due_at, extra, archived_at")
    .eq("user_id", userId);
  const byKey = new Map((existing ?? []).map((row) => [`${row.kind}:${row.external_key}`, row]));
  const known = new Set(byKey.keys());
  const isFirstSync = known.size === 0;
  const fresh = scraped.filter((item) => !known.has(`${item.kind}:${item.externalKey}`));
  const isRegistrationKind = (kind: string) => kind === "registration" || kind === "courseOffer";
  const notifiableFresh = options.suppressRegistrationNotifications
    ? fresh.filter((item) => !isRegistrationKind(item.kind))
    : fresh;

  // Only write rows whose meaningful fields actually changed. Unchanged rows are
  // skipped entirely (no updated_at / last_seen_at churn) to keep disk IO low.
  //
  // Two representation differences used to make *every* comparison fail and
  // produce phantom updates on every tick:
  //  - `due_at` comes back from Postgres as "2026-07-22T00:00:00+00:00" while the
  //    scraper produces "2026-07-22T00:00:00.000Z" — same instant, different text.
  //  - `extra` is stored as jsonb, which normalises key order, so a plain
  //    JSON.stringify of the scraped object rarely matched the stored one.
  // Both are normalised here; the freshest raw value is still written whenever a
  // real change exists.
  const changed = scraped.filter((item) => {
    const row = byKey.get(`${item.kind}:${item.externalKey}`);
    if (!row) return true;
    if (row.archived_at) return true; // it came back to life
    return (
      row.title !== item.title ||
      (row.status ?? null) !== (item.status ?? null) ||
      (row.score ?? null) !== (item.score ?? null) ||
      sameInstant(row.due_at, item.dueAt) === false ||
      canonicalJson(row.extra) !== canonicalJson(item.extra)
    );
  });

  const now = new Date().toISOString();
  for (const slice of chunk(changed, UPSERT_CHUNK)) {
    const { error: upsertError } = await supabaseAdmin.from("dulms_items").upsert(
      slice.map((item) => ({
        user_id: userId,
        kind: item.kind,
        external_key: item.externalKey,
        course: item.course,
        title: item.title,
        due_at: item.dueAt,
        status: item.status,
        score: item.score,
        extra: item.extra,
        updated_at: now,
        last_seen_at: now,
        // A returning item is live again.
        archived_at: null,
      })),
      { onConflict: "user_id,kind,external_key" },
    );
    if (upsertError) throw upsertError;
  }

  // Anything DULMS stopped showing (closed quiz, expired assignment) is kept
  // and flagged as archived instead of silently disappearing. "Still seen" is
  // derived in memory from `scraped`, so unchanged rows need no write.
  const seen = new Set(scraped.map((item) => `${item.kind}:${item.externalKey}`));
  const vanished = (existing ?? []).filter(
    (row) => !seen.has(`${row.kind}:${row.external_key}`) && !row.archived_at,
  );
  for (const slice of chunk(vanished, UPSERT_CHUNK)) {
    await supabaseAdmin
      .from("dulms_items")
      .update({ archived_at: now })
      .in(
        "id",
        slice.map((row) => row.id),
      );
  }

  // Skip notifications on the very first sync so the student isn't flooded.
  if (!isFirstSync) {
    if (notifiableFresh.length > 0) await notifyFresh(userId, notifiableFresh);

    // Items the student already knows about whose meaningful fields moved
    // (edited grade, absence counter, deadline...). These used to be written
    // silently — see change-rules.ts for the per-kind rules.
    const { notifiableChange } = await import("./change-rules");
    const updates = changed
      .filter(
        (item) =>
          known.has(`${item.kind}:${item.externalKey}`) &&
          (!options.suppressRegistrationNotifications || !isRegistrationKind(item.kind)),
      )
      .map((item) => {
        const row = byKey.get(`${item.kind}:${item.externalKey}`);
        return row && !row.archived_at ? notifiableChange(row, item) : null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((a, b) => a.priority - b.priority);

    if (updates.length > 0) await notifyChanged(userId, updates);
  }

  // The profile is not an item, so its diff has no other place to live: a CGPA
  // or SGPA move used to overwrite silently even though it is the single most
  // important number on the account.
  if (profile) {
    try {
      await notifyProfileChange(
        userId,
        (account.profile ?? null) as Record<string, unknown> | null,
        profile,
        isFirstSync,
      );
    } catch (cause) {
      console.error("[sync] profile change notify failed", userId, cause);
    }
  }

  // Only persist the photo when we actually learned a new one; it is immutable
  // in practice, so this normally writes zero bytes after the first sync.
  if (profile?.photo && profile.photo !== cachedPhoto) {
    await supabaseAdmin
      .from("student_photos")
      .upsert({ user_id: userId, data_url: profile.photo, updated_at: now });
  }

  const { photo: _photo, ...profileWithoutPhoto } = profile ?? ({} as DulmsProfile);

  await supabaseAdmin
    .from("dulms_accounts")
    .update({
      last_sync_at: now,
      last_sync_status: "ok",
      last_sync_error: null,
      sync_claimed_at: null,
      ...(profile ? { profile: profileWithoutPhoto as unknown as Record<string, string> } : {}),
    })
    .eq("user_id", userId);

  // Only log ticks that actually changed something — a no-op tick writes nothing.
  if (changed.length > 0 || vanished.length > 0) {
    await supabaseAdmin.from("sync_logs").insert({
      user_id: userId,
      status: "ok",
      message: `تم قراءة ${scraped.length} عنصر`,
      items_found: scraped.length,
      new_items: fresh.length,
    });
  }

  return {
    status: "ok",
    message: "تم التحديث بنجاح",
    itemsFound: scraped.length,
    newItems: isFirstSync ? 0 : fresh.length,
  };
}

/** Profile fields worth a push, in message order. */
const PROFILE_WATCH: { key: keyof DulmsProfile; label: string }[] = [
  { key: "cgpa", label: "المعدل التراكمي (CGPA)" },
  { key: "sgpa", label: "معدل الفصل (SGPA)" },
];

/**
 * Compares the stored profile card with the freshly scraped one and pushes a
 * notification when CGPA/SGPA moved. Silent on the very first sync (nothing to
 * compare against) and when the old value was empty.
 */
async function notifyProfileChange(
  userId: string,
  previous: Record<string, unknown> | null,
  next: DulmsProfile,
  isFirstSync: boolean,
) {
  if (!previous || isFirstSync) return;

  const moved = PROFILE_WATCH.map(({ key, label }) => {
    const before = previous[key];
    const after = next[key];
    const beforeText = typeof before === "string" ? before.trim() : "";
    const afterText = typeof after === "string" ? after.trim() : "";
    if (!afterText || beforeText === afterText) return null;
    return { label, before: beforeText, after: afterText };
  }).filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  if (moved.length === 0) return;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const detail = moved
    .map((entry) =>
      entry.before
        ? `${entry.label}: ${entry.before} ← ${entry.after}`
        : `${entry.label}: ${entry.after}`,
    )
    .join(" • ");

  const dedupeKey = `dulms:${userId}:profile:${fnv1a(detail)}`;
  const { data: seen } = await supabaseAdmin
    .from("notification_events")
    .select("dedupe_key")
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();
  if (seen) return;

  await supabaseAdmin.from("notifications").insert({
    user_id: userId,
    kind: "gpa",
    title: "تحديث في المعدل",
    body: detail,
  });

  try {
    const { getBotConfig } = await import("../admin/settings.server");
    const config = await getBotConfig();
    if (!config.enabled) return;
    const { formatMessage, categoryLabel, nowLine, isMuted } = await import("./message-format");
    if (isMuted("gpa", config)) return;
    const queued = await queueTelegram(userId, [
      {
        body: formatMessage(
          {
            category: categoryLabel("gpa", config),
            context: next.name ?? "تحديث في المعدل",
            detail,
            time: nowLine(),
          },
          config,
        ),
        dedupeKey: dedupeKey,
      },
    ]);
    // Only mark the event as handled once the message is durably queued;
    // otherwise a failure here would silence this change forever.
    if (queued >= 0) {
      await supabaseAdmin
        .from("notification_events")
        .upsert(
          { user_id: userId, dedupe_key: dedupeKey, section: "profile" },
          { onConflict: "dedupe_key", ignoreDuplicates: true },
        );
    }
  } catch (cause) {
    console.error("[sync] telegram (profile) failed", userId, cause);
  }
}

/**
 * Durable Telegram delivery for the full-pull path.
 *
 * Everything goes through `notification_outbox`: a failed send is retried by
 * the drain worker and its error is visible in `last_error`, instead of being
 * swallowed by a console.error inside a worker request that then dies.
 */
async function queueTelegram(
  userId: string,
  messages: readonly { body: string; dedupeKey: string }[],
): Promise<number> {
  if (messages.length === 0) return 0;
  const { enqueuePushes, flushNow } = await import("../notify/outbox.server");
  const ids = await enqueuePushes(messages.map((m) => ({ userId, ...m })));
  if (ids.length > 0) await flushNow(ids).catch(() => 0);
  return ids.length;
}

async function notifyFresh(userId: string, fresh: ScrapedItem[]) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const capped = fresh.slice(0, MAX_NOTIFICATIONS_PER_SYNC);

  await supabaseAdmin.from("notifications").insert(
    capped.map((item) => ({
      user_id: userId,
      kind: item.kind,
      title: notificationTitle(item.kind, item.title),
      body: notificationBody(item),
    })),
  );

  try {
    const { getBotConfig } = await import("../admin/settings.server");
    const config = await getBotConfig();
    if (!config.enabled) return;

    const { formatMessage, formatBatch, categoryLabel, contextLine, detailLine, nowLine, isMuted } =
      await import("./message-format");
    const sendable = capped.filter((item) => !isMuted(item.kind, config));
    if (sendable.length === 0) return;
    // The outbox dedupe key makes a sentinel echo harmless: the same item can
    // only ever produce one Telegram message, so the detailed full-pull text
    // is no longer suppressed by a generic sentinel push.
    if (sendable.length <= config.batchThreshold) {
      await queueTelegram(
        userId,
        sendable.map((item) => ({
          body: formatMessage(
            {
              category: categoryLabel(item.kind, config),
              context: contextLine(item.course, item.title),
              detail: detailLine(item),
              time: nowLine(),
            },
            config,
          ),
          dedupeKey: `dulms:${userId}:fresh:${item.kind}:${item.externalKey}`,
        })),
      );
    } else {
      await queueTelegram(userId, [
        {
          body: formatBatch(
            sendable.map((item) => item.kind),
            "تحديثات جديدة",
            config,
          ),
          dedupeKey: `dulms:${userId}:fresh-batch:${fnv1a(
            sendable.map((item) => `${item.kind}:${item.externalKey}`).join("|"),
          )}`,
        },
      ]);
    }
  } catch (cause) {
    console.error("[sync] telegram notification failed", userId, cause);
  }
}

/**
 * Notifies about *updates* to items the student already had. Same batching,
 * cap and Telegram machinery as `notifyFresh`, plus a `notification_events`
 * dedup so a reprocessed sync can't send the same change twice.
 */
async function notifyChanged(
  userId: string,
  updates: { item: ScrapedItem; fields: readonly string[]; priority: number }[],
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { updateTitle } = await import("./labels");

  const signature = (entry: (typeof updates)[number]) =>
    `dulms:${userId}:change:${entry.item.kind}:${entry.item.externalKey}:${fnv1a(
      [
        entry.item.title,
        entry.item.status,
        entry.item.score,
        entry.item.dueAt,
        canonicalJson(entry.item.extra),
      ].join("|"),
    )}`;

  const keys = updates.map(signature);
  const { data: seen } = await supabaseAdmin
    .from("notification_events")
    .select("dedupe_key")
    .in("dedupe_key", keys);
  const already = new Set((seen ?? []).map((row) => row.dedupe_key));

  const pending = updates.filter((entry) => !already.has(signature(entry)));
  if (pending.length === 0) return;

  const capped = pending.slice(0, MAX_NOTIFICATIONS_PER_SYNC);

  await supabaseAdmin.from("notifications").insert(
    capped.map((entry) => ({
      user_id: userId,
      kind: entry.item.kind,
      title: updateTitle(entry.item.kind, entry.item.title, entry.fields),
      body: notificationBody(entry.item),
    })),
  );

  try {
    const { getBotConfig } = await import("../admin/settings.server");
    const config = await getBotConfig();
    const { formatMessage, formatBatch, categoryLabel, contextLine, detailLine, nowLine, isMuted } =
      await import("./message-format");
    const sendable = config.enabled
      ? capped.filter((entry) => !isMuted(entry.item.kind, config))
      : [];
    if (sendable.length > 0) {
      if (sendable.length <= config.batchThreshold) {
        await queueTelegram(
          userId,
          sendable.map((entry) => ({
            body: formatMessage(
              {
                category: categoryLabel(entry.item.kind, config),
                context: contextLine(entry.item.course, entry.item.title),
                detail: detailLine(entry.item),
                time: nowLine(),
              },
              config,
            ),
            dedupeKey: signature(entry),
          })),
        );
      } else {
        await queueTelegram(userId, [
          {
            body: formatBatch(
              sendable.map((entry) => entry.item.kind),
              "تحديثات على عناصر موجودة",
              config,
            ),
            dedupeKey: `dulms:${userId}:change-batch:${fnv1a(
              sendable.map((entry) => signature(entry)).join("|"),
            )}`,
          },
        ]);
      }
    }
    // Mark handled only after the queue write succeeded.
    await supabaseAdmin.from("notification_events").upsert(
      capped.map((entry) => ({
        user_id: userId,
        dedupe_key: signature(entry),
        section: entry.item.kind,
      })),
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    );
  } catch (cause) {
    console.error("[sync] telegram (changed) failed", userId, cause);
  }
}

function fnv1a(payload: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
