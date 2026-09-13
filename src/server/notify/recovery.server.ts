/**
 * Post-migration credential recovery.
 *
 * When the project moved, `DULMS_CRED_SECRET` changed, so every password
 * stored with the previous key can no longer be decrypted. Those students are
 * not "lost" — their row, their Telegram link and their history are all
 * intact; the server just can't log in to DULMS on their behalf until they
 * type their password once more.
 *
 * Silence is what actually loses them: the account keeps failing checks in the
 * background and the student never hears why. This module finds the affected
 * rows, tells each one over the bot exactly what to do, and parks their
 * scheduling so they stop burning the shared DULMS rate budget on checks that
 * can never succeed. The next successful sign-in re-encrypts with the current
 * key and un-parks the account (see `dulms-auth.functions.ts`).
 */

/** How long a stale account is parked before the scheduler retries it. */
const PARK_DAYS = 7;

export interface RecoveryScan {
  total: number;
  broken: number;
  reachable: number;
  unreachable: number;
  brokenIds: string[];
}

interface BrokenRow {
  user_id: string;
  dulms_id: string;
  telegram_chat_id: string | null;
}

/** Returns every account whose stored password can no longer be decrypted. */
async function findBroken(): Promise<BrokenRow[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { decryptSecret, ensureKeyring } = await import("@/server/crypto.server");
  await ensureKeyring();

  const { fetchAllRows } = await import("@/server/db/paginate");
  const data = await fetchAllRows<{
    user_id: string;
    dulms_id: string;
    telegram_chat_id: string | null;
    password_ciphertext: string;
    key_version: number;
  }>((from, to) =>
    supabaseAdmin
      .from("dulms_accounts")
      .select("user_id, dulms_id, telegram_chat_id, password_ciphertext, key_version")
      .order("user_id", { ascending: true })
      .range(from, to),
  );

  const broken: BrokenRow[] = [];
  for (const row of data ?? []) {
    try {
      decryptSecret(row.password_ciphertext, row.key_version);
    } catch {
      broken.push({
        user_id: row.user_id,
        dulms_id: row.dulms_id,
        telegram_chat_id: row.telegram_chat_id,
      });
    }
  }
  return broken;
}

/** Read-only count of affected students, for the admin dashboard. */
export async function scanBrokenCredentials(): Promise<RecoveryScan> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ count }, broken] = await Promise.all([
    supabaseAdmin.from("dulms_accounts").select("user_id", { count: "exact", head: true }),
    findBroken(),
  ]);
  const reachable = broken.filter((row) => row.telegram_chat_id).length;
  return {
    total: count ?? 0,
    broken: broken.length,
    reachable,
    unreachable: broken.length - reachable,
    brokenIds: broken.slice(0, 200).map((row) => row.dulms_id),
  };
}

function inviteBody(loginUrl: string): string {
  return [
    "⚠️ محتاجين تسجيل دخول مرة واحدة",
    "",
    "اتنقل السيرفر لمكان جديد ولأسباب أمنية اتغيّر مفتاح تشفير كلمات المرور، فمش قادرين نفتح حسابك على دالمز عشان نجيب لك الإشعارات.",
    "",
    "كل اللي مطلوب: افتح اللينك وسجّل دخول بكود الطالب وكلمة المرور مرة واحدة، وهيرجع كل شيء زي ما كان فورًا — بياناتك وإشعاراتك القديمة كلها موجودة.",
    "",
    loginUrl,
  ].join("\n");
}

export interface RecoveryCampaign extends RecoveryScan {
  queued: number;
  parked: number;
}

/**
 * Notifies every affected student over the bot and parks their scheduling.
 *
 * Safe to run repeatedly: the outbox `dedupe_key` is scoped to the day, so a
 * second run on the same day re-parks accounts without spamming anyone.
 */
export async function runCredentialRecovery(): Promise<RecoveryCampaign> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { enqueuePushes, drainOutbox } = await import("@/server/notify/outbox.server");
  const { appOrigin } = await import("@/server/telegram.server");

  const broken = await findBroken();
  const scan: RecoveryScan = {
    total: 0,
    broken: broken.length,
    reachable: broken.filter((row) => row.telegram_chat_id).length,
    unreachable: broken.filter((row) => !row.telegram_chat_id).length,
    brokenIds: broken.slice(0, 200).map((row) => row.dulms_id),
  };
  const { count } = await supabaseAdmin
    .from("dulms_accounts")
    .select("user_id", { count: "exact", head: true });
  scan.total = count ?? 0;

  if (broken.length === 0) return { ...scan, queued: 0, parked: 0 };

  const day = new Date().toISOString().slice(0, 10);
  const body = inviteBody(`${appOrigin()}/auth`);
  const queued = await enqueuePushes(
    broken
      .filter((row) => row.telegram_chat_id)
      .map((row) => ({
        userId: row.user_id,
        body,
        dedupeKey: `relogin:${row.user_id}:${day}`,
      })),
  );

  // Park the failing accounts so the scheduler spends its budget on students
  // it can actually check. A successful sign-in clears this immediately.
  const parkUntil = new Date(Date.now() + PARK_DAYS * 864e5).toISOString();
  let parked = 0;
  // Small chunks: a wide `IN (...)` update on a hot table (the scheduler is
  // claiming rows on the same table every minute) can hit the statement
  // timeout. A timed-out chunk is retried once and then skipped — the next
  // daily run parks whatever is left instead of failing the whole campaign.
  const CHUNK = 25;
  const ids = broken.map((row) => row.user_id);
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    for (let attempt = 0; attempt < 2; attempt++) {
      const { error } = await supabaseAdmin
        .from("dulms_accounts")
        .update({
          next_check_at: parkUntil,
          check_claimed_at: null,
          last_sync_status: "error",
          last_sync_error: "بيانات الدخول محتاجة تحديث — سجّل الدخول مرة أخرى",
        })
        .in("user_id", slice);
      if (!error) {
        parked += slice.length;
        break;
      }
      if (attempt === 1 || error.code !== "57014") {
        console.error("[recover] park chunk failed", error.code, error.message);
        break;
      }
    }
  }

  if (queued.length > 0) await drainOutbox(Math.min(queued.length, 200));
  return { ...scan, queued: queued.length, parked };
}
