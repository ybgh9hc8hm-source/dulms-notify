import { LANDING_DEFAULT, type LandingConfig } from "@/features/landing/fields";

/**
 * Operator-tunable settings, stored as JSON blobs in `app_settings`.
 *
 * Two documents:
 *  - `bot_config`      → how Telegram messages look / which categories notify
 *  - `registration`    → whether new students may join and how many seats exist
 *
 * Both are read on every notification path, so they are memo-cached for a
 * short window (workers are stateless; the cache only survives one isolate).
 */

export type BotConfig = {
  /** Master Telegram switch. When false, no bot message is sent at all. */
  enabled: boolean;
  /** Trailing italic timestamp line. */
  showTime: boolean;
  /** Optional bold heading line above the category. */
  header: string | null;
  /** Optional italic closing line. */
  footer: string | null;
  /** More than this many items in one cycle → one summary message. */
  batchThreshold: number;
  /** Per-kind (and per sentinel-section) Arabic label overrides. */
  labels: Record<string, string>;
  /** Kinds / sections that must never produce a Telegram message. */
  mutedKinds: string[];
};

export type RegistrationConfig = {
  /** Whether a brand-new student may create an account by signing in. */
  open: boolean;
  /** Hard cap on total linked accounts. 0 = unlimited. */
  seats: number;
  /** Message shown when registration is closed or full. */
  closedMessage: string;
  /**
   * Explicit per-student allowlist of DULMS ids. Anyone listed here is treated
   * exactly like the currently working account: they may sign in even while
   * lockdown/focus mode is on, registration is closed, or the seat cap is full,
   * and their Telegram chat keeps bot access while the bots are locked.
   */
  allowedIds: string[];
  /** When true, ONLY the ids in `allowedIds` may use the site at all. */
  allowlistOnly: boolean;
};

export type MaintenanceConfig = {
  /** When true, every public page shows the maintenance screen. */
  enabled: boolean;
  /** Headline shown on the maintenance screen. */
  title: string;
  /** Body text shown under the headline. */
  message: string;
  /** Optional expected-return note (free text, e.g. "خلال ساعة"). */
  eta: string | null;
};

export type SupportConfig = {
  /** Master switch for the AI assistant (site widget + support bot). */
  enabled: boolean;
  /** Floating chat widget inside the dashboard. */
  webEnabled: boolean;
  /** Standalone Telegram support bot. */
  telegramEnabled: boolean;
  /** "auto" walks the free-model fallback chain; otherwise a fixed model id. */
  model: string;
  /** Sampling temperature (0 = deterministic). */
  temperature: number;
  /** Max answer tokens. */
  maxTokens: number;
  /** Turns/messages of memory the assistant keeps per conversation. */
  historyTurns: number;
  /** Whether the assistant may read the student's DULMS snapshot. */
  accountAccess: boolean;
  /** Auto-file suggestions/bug reports as tickets. */
  ticketsEnabled: boolean;
  /** Extra operator knowledge injected into the system prompt. */
  knowledge: string;
  /** Greeting shown in the widget and by the bot on /start. */
  welcome: string;
  /** Shown when the assistant is switched off. */
  offlineMessage: string;
};

const DEFAULT_SUPPORT: SupportConfig = {
  enabled: true,
  webEnabled: true,
  telegramEnabled: true,
  model: "auto",
  temperature: 0.3,
  maxTokens: 2500,
  historyTurns: 24,
  accountAccess: true,
  ticketsEnabled: true,
  knowledge: "",
  welcome:
    "أهلًا 👋 أنا مساعد DULMS Notify. اسألني عن درجاتك أو غيابك أو الإشعارات، أو ابعت اقتراح/مشكلة وهسجّلها للفريق.",
  offlineMessage:
    "المساعد الذكي متوقف مؤقتًا للصيانة. جرّب بعد شوية أو ابعت اقتراحك وهيوصل للفريق.",
};

const DEFAULT_MAINTENANCE: MaintenanceConfig = {
  enabled: false,
  title: "الموقع تحت الصيانة",
  message: "نقوم بتحديث النظام حاليًا لتحسين التنبيهات. سنعود خلال وقت قصير.",
  eta: null,
};

const DEFAULT_BOT_CONFIG: BotConfig = {
  enabled: true,
  showTime: true,
  header: null,
  footer: null,
  batchThreshold: 3,
  labels: {},
  mutedKinds: [],
};

const DEFAULT_REGISTRATION: RegistrationConfig = {
  open: false,
  seats: 0,
  closedMessage:
    "الخدمة متاحة حاليًا لمجموعة محددة من الطلاب. لو حابب تنضم ليهم، تواصل مع المطور من قسم التواصل في الصفحة الرئيسية وسيتم تفعيل حسابك.",
  allowedIds: [],
  allowlistOnly: false,
};

/** Trim / dedupe an operator-typed id list. */
export function normalizeIds(ids: readonly string[] | undefined | null): string[] {
  return Array.from(new Set((ids ?? []).map((id) => String(id).trim()).filter(Boolean)));
}

const CACHE_MS = 20_000;
const cache = new Map<string, { at: number; value: unknown }>();

async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    const parsed = data?.value ? { ...fallback, ...(JSON.parse(data.value) as object) } : fallback;
    cache.set(key, { at: Date.now(), value: parsed });
    return parsed as T;
  } catch {
    return fallback;
  }
}

async function writeSetting(key: string, value: unknown): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("app_settings")
    .upsert({ key, value: JSON.stringify(value) }, { onConflict: "key" });
  if (error) throw error;
  cache.delete(key);
}

export function getBotConfig(): Promise<BotConfig> {
  return readSetting<BotConfig>("bot_config", DEFAULT_BOT_CONFIG);
}

export function saveBotConfig(config: BotConfig): Promise<void> {
  return writeSetting("bot_config", config);
}

export function getRegistrationConfig(): Promise<RegistrationConfig> {
  return readSetting<RegistrationConfig>("registration", DEFAULT_REGISTRATION);
}

export function saveRegistrationConfig(config: RegistrationConfig): Promise<void> {
  return writeSetting("registration", { ...config, allowedIds: normalizeIds(config.allowedIds) });
}

/** Is this DULMS id explicitly allowlisted by the operator? */
export async function isAllowlistedId(dulmsId: string): Promise<boolean> {
  const registration = await getRegistrationConfig();
  return normalizeIds(registration.allowedIds).includes(dulmsId.trim());
}

/**
 * May this Telegram chat keep using the bots while lockdown is on?
 * Either the chat is an explicit operator chat, or it belongs to an
 * allowlisted student account.
 */
export async function botAccessAllowedDuringLock(
  chatId: string,
  linkToken?: string | null,
): Promise<boolean> {
  const chat = String(chatId).trim();
  const focus = await getFocusConfig();
  if (normalizeIds(focus.allowChatIds).includes(chat)) return true;

  const registration = await getRegistrationConfig();
  const allowed = normalizeIds(registration.allowedIds);
  const focusIds = normalizeIds(focus.dulmsIds);
  if (!allowed.length && !focusIds.length) return false;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("dulms_accounts")
    .select("dulms_id")
    .eq("telegram_chat_id", chat)
    .maybeSingle();
  const linkedId = data?.dulms_id ? String(data.dulms_id).trim() : null;
  if (linkedId && (allowed.includes(linkedId) || focusIds.includes(linkedId))) return true;

  // A brand-new allowlisted student has no linked chat yet: accept the fresh
  // `/start <token>` link so they can finish connecting the bot during lockdown.
  const token = linkToken?.trim();
  if (!token) return false;
  const { data: row } = await supabaseAdmin
    .from("telegram_link_tokens")
    .select("user_id, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();
  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) return false;
  const { data: owner } = await supabaseAdmin
    .from("dulms_accounts")
    .select("dulms_id")
    .eq("user_id", row.user_id)
    .maybeSingle();
  const ownerId = owner?.dulms_id ? String(owner.dulms_id).trim() : null;
  return Boolean(ownerId && (allowed.includes(ownerId) || focusIds.includes(ownerId)));
}

/** Seat accounting: how many accounts exist vs how many are allowed. */
export async function seatUsage(): Promise<{ used: number; seats: number; open: boolean }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const registration = await getRegistrationConfig();
  const { count } = await supabaseAdmin
    .from("dulms_accounts")
    .select("user_id", { count: "exact", head: true });
  return { used: count ?? 0, seats: registration.seats, open: registration.open };
}

export function getMaintenanceConfig(): Promise<MaintenanceConfig> {
  return readSetting<MaintenanceConfig>("maintenance", DEFAULT_MAINTENANCE);
}

export function saveMaintenanceConfig(config: MaintenanceConfig): Promise<void> {
  return writeSetting("maintenance", config);
}

export function getSupportConfig(): Promise<SupportConfig> {
  return readSetting<SupportConfig>("support_config", DEFAULT_SUPPORT);
}

export function saveSupportConfig(config: SupportConfig): Promise<void> {
  return writeSetting("support_config", config);
}

/**
 * Landing page content, fully operator-editable from the admin panel.
 * The shape lives with the page so the editor and the page never drift.
 */
export function getLandingConfig(): Promise<LandingConfig> {
  return readSetting<LandingConfig>("landing", LANDING_DEFAULT);
}

export function saveLandingConfig(config: LandingConfig): Promise<void> {
  return writeSetting("landing", config);
}

/**
 * Focus / lockdown mode.
 *
 * A safety switch for incident response: only the listed DULMS ids keep being
 * polled — and they are polled on every tick with no clustering, no lane
 * budgeting and no jitter — while every other account is frozen. `botsLocked`
 * additionally refuses any bot interaction and answers with `lockedMessage`.
 */
export type FocusConfig = {
  enabled: boolean;
  dulmsIds: string[];
  botsLocked: boolean;
  lockedMessage: string;
  /** Telegram chat ids that keep full bot access while the bots are locked. */
  allowChatIds?: string[];
};

const DEFAULT_FOCUS: FocusConfig = {
  enabled: false,
  dulmsIds: [],
  botsLocked: false,
  allowChatIds: [],
  lockedMessage:
    "🔒 الخدمة متوقفة مؤقتًا لأسباب أمنية. هنرجع نشتغل بعد ما نخلص المراجعة — شكرًا لتفهمك.",
};

export function getFocusConfig(): Promise<FocusConfig> {
  return readSetting<FocusConfig>("focus_mode", DEFAULT_FOCUS);
}
