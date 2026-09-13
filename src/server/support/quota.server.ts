/**
 * Spend guard for the AI support assistant.
 *
 * Two independent daily allowances per student, both AI-backed:
 *
 *   - normal chat  → 5 questions / 24h (site widget + Telegram bot combined)
 *   - support tickets → 2 tickets / 24h (never touches the chat allowance)
 *
 * The window is rolling: it opens with the first use and closes 24 hours
 * later, so the student can be told the exact renewal time. Counting happens
 * in the tables the flows already write to (`support_messages` for chat,
 * `support_tickets` for tickets), so the limit holds across workers with no
 * extra state to keep in sync.
 *
 * Identity: a Telegram chat that belongs to a linked account is resolved to
 * that account's user id, so five questions in the bot also exhaust the five
 * questions on the site (and the other way round).
 */

const DAY_MS = 86_400_000;

/**
 * Limits are opt-in now: the service runs for a single operator, so both
 * allowances default to unlimited. Setting the env var to a positive number
 * restores a rolling 24h cap. `0` (the default) means no cap at all.
 */
export const CHAT_DAILY_LIMIT = Math.max(0, Number(process.env["SUPPORT_DAILY_LIMIT"]) || 0);
/** Support tickets per student per rolling 24h (0 = unlimited). */
export const TICKET_DAILY_LIMIT = Math.max(0, Number(process.env["SUPPORT_TICKET_LIMIT"]) || 0);

/** Sentinel state used whenever a limit is disabled. */
const UNLIMITED: QuotaState = {
  allowed: true,
  used: 0,
  limit: 0,
  remaining: Number.MAX_SAFE_INTEGER,
  resetAt: null,
};

export interface SupportIdentity {
  userId: string | null;
  chatId: string | null;
}

export interface QuotaState {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  /** When the allowance renews (only set once at least one use is recorded). */
  resetAt: string | null;
}

/** Human time in Cairo, the students' timezone. */
export function formatResetTime(resetAt: string | null): string {
  if (!resetAt) return "بعد ٢٤ ساعة";
  return new Intl.DateTimeFormat("ar-EG", {
    timeZone: "Africa/Cairo",
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "long",
  }).format(new Date(resetAt));
}

export function throttledChatMessage(state: QuotaState): string {
  return [
    `خلصت أسئلتك المتاحة لليوم (${state.limit} أسئلة لكل مستخدم كل ٢٤ ساعة).`,
    `الأسئلة بترجع تاني الساعة ${formatResetTime(state.resetAt)}.`,
    "لو عندك مشكلة أو اقتراح مستعجل، افتح تذكرة دعم — التذاكر ليها رصيد مستقل.",
  ].join("\n");
}

export function throttledTicketMessage(state: QuotaState): string {
  return [
    `خلصت تذاكر الدعم المتاحة لليوم (${state.limit} تذكرتين كل ٢٤ ساعة).`,
    `رصيد التذاكر بيتجدد الساعة ${formatResetTime(state.resetAt)}.`,
  ].join("\n");
}

/** Resolves a Telegram chat to its linked account so limits are per student. */
export async function resolveIdentity(identity: SupportIdentity): Promise<SupportIdentity> {
  if (identity.userId || !identity.chatId) return identity;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("dulms_accounts")
      .select("user_id")
      .eq("telegram_chat_id", identity.chatId)
      .maybeSingle();
    return { userId: data?.user_id ?? null, chatId: identity.chatId };
  } catch {
    return identity;
  }
}

/** Timestamps of this caller's uses inside the last 24h, oldest first. */
async function usesSince(
  table: "support_messages" | "support_tickets",
  identity: SupportIdentity,
): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const since = new Date(Date.now() - DAY_MS).toISOString();

  const base =
    table === "support_messages"
      ? supabaseAdmin
          .from("support_messages")
          .select("created_at")
          .eq("role", "user")
          .gte("created_at", since)
      : supabaseAdmin.from("support_tickets").select("created_at").gte("created_at", since);

  let query = base.order("created_at", { ascending: true });
  if (identity.userId) query = query.eq("user_id", identity.userId);
  else if (identity.chatId) query = query.eq("chat_id", identity.chatId);
  else return [];

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => row.created_at as string);
}

function toState(uses: string[], limit: number): QuotaState {
  const used = uses.length;
  const oldest = uses[0] ?? null;
  return {
    allowed: used < limit,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetAt: oldest ? new Date(new Date(oldest).getTime() + DAY_MS).toISOString() : null,
  };
}

async function state(
  table: "support_messages" | "support_tickets",
  identity: SupportIdentity,
  limit: number,
): Promise<QuotaState> {
  if (limit <= 0) return UNLIMITED;
  if (!identity.userId && !identity.chatId) return toState([], limit);
  try {
    return toState(await usesSince(table, identity), limit);
  } catch (cause) {
    // Failing closed would silence support on a logging blip; fail open, loud.
    console.error("[support-quota] check failed", cause);
    return toState([], limit);
  }
}

/** Remaining AI chat allowance for this student. */
export function chatQuota(identity: SupportIdentity): Promise<QuotaState> {
  return state("support_messages", identity, CHAT_DAILY_LIMIT);
}

/** Remaining support-ticket allowance for this student. */
export function ticketQuota(identity: SupportIdentity): Promise<QuotaState> {
  return state("support_tickets", identity, TICKET_DAILY_LIMIT);
}
