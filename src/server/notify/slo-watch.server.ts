/**
 * SLO watchdog.
 *
 * The promise this product makes is "you hear about it within a minute". That
 * promise is measurable: detection latency (`heartbeat_checks.notify_ms`) and
 * delivery latency (`notification_outbox.created_at → sent_at`). This module
 * reads both from `slo_stats()`, decides whether we are inside the objective,
 * and — when we are not — pages the operator once per cooldown instead of
 * spamming them every cron tick.
 *
 * Operator setup (optional): store the alert chat in `app_settings`
 *   key = 'slo_alert', value = {"chatId":"123456789"}
 * With no chat configured the breach is logged and exposed in the admin
 * dashboard, and nothing is sent.
 */

export interface SloReport {
  deliveryP95: number;
  detectP95: number;
  pending: number;
  dead: number;
  oldestPendingSeconds: number;
  breaches: string[];
  alerted: boolean;
  /** Whether an operator Telegram chat is configured for paging. */
  alertChannel: "configured" | "missing";
}

/** Objective: a change is delivered within 60s p95. */
const DELIVERY_P95_MS = 60_000;
/** Nothing should sit in the queue longer than 5 minutes. */
const OLDEST_PENDING_SECONDS = 300;
/** Minimum gap between two operator pages. */
const ALERT_COOLDOWN_MS = 30 * 60_000;
/** Minimum gap between two "channel not configured" log warnings. */
const MISCONFIG_WARN_MS = 60 * 60_000;

let lastMisconfigWarnAt = 0;

function warnChannelMissing(context: string): void {
  if (Date.now() - lastMisconfigWarnAt < MISCONFIG_WARN_MS) return;
  lastMisconfigWarnAt = Date.now();
  console.error(
    `[slo] ALERT CHANNEL NOT CONFIGURED (${context}). ` +
      "No operator will be paged on an SLO breach. " +
      "Set app_settings.slo_alert.chatId from the admin dashboard → قناة تنبيهات المشغّل.",
  );
}

/**
 * Boot/tick-level health check for the paging channel itself. Runs cheaply and
 * shouts in the logs instead of failing silently when nobody can be paged.
 */
export async function assertAlertChannel(): Promise<boolean> {
  const chatId = await getAlertChat().catch(() => null);
  if (!chatId) {
    warnChannelMissing("startup check");
    return false;
  }
  return true;
}

export async function checkSlo(windowMinutes = 60): Promise<SloReport> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  const { data, error } = await supabaseAdmin.rpc("slo_stats", { p_since: since });

  const raw = (error ? {} : ((data ?? {}) as Record<string, unknown>)) as Record<string, unknown>;
  const num = (key: string) => {
    const value = Number(raw[key] ?? 0);
    return Number.isFinite(value) ? value : 0;
  };

  const state = await readAlertState();
  const chatId = state.chatId ?? null;

  const report: SloReport = {
    deliveryP95: num("deliveryP95"),
    detectP95: num("detectP95"),
    pending: num("pending"),
    dead: num("dead"),
    oldestPendingSeconds: num("oldestPendingSeconds"),
    breaches: [],
    alerted: false,
    alertChannel: chatId ? "configured" : "missing",
  };

  if (!chatId) warnChannelMissing("slo tick");

  if (report.deliveryP95 > DELIVERY_P95_MS) {
    report.breaches.push(`زمن التسليم p95 = ${(report.deliveryP95 / 1000).toFixed(1)} ثانية`);
  }
  if (report.oldestPendingSeconds > OLDEST_PENDING_SECONDS) {
    report.breaches.push(
      `أقدم رسالة منتظرة منذ ${Math.round(report.oldestPendingSeconds / 60)} دقيقة`,
    );
  }
  if (report.dead > 0) report.breaches.push(`رسائل فشلت نهائيًا: ${report.dead}`);

  if (report.breaches.length === 0) return report;
  console.warn("[slo] objective breached:", report.breaches.join(" | "));

  // ---- Paging, with a cooldown so one incident is one message -------------
  try {
    if (!chatId) {
      console.error(
        "[slo] breach detected but no alert chat is configured — nobody was paged:",
        report.breaches.join(" | "),
      );
      return report;
    }
    if (state.lastAlertAt && Date.now() - state.lastAlertAt < ALERT_COOLDOWN_MS) return report;

    const { sendTelegramMessage } = await import("../telegram.server");
    await sendTelegramMessage(
      chatId,
      ["⚠️ تجاوز مستوى الخدمة (SLO)", ...report.breaches.map((line) => `• ${line}`)].join("\n"),
    );
    await supabaseAdmin
      .from("app_settings")
      .upsert(
        { key: "slo_alert", value: JSON.stringify({ ...state, lastAlertAt: Date.now() }) },
        { onConflict: "key" },
      );
    report.alerted = true;
  } catch (cause) {
    console.error("[slo] alerting failed", cause);
  }

  return report;
}

/* ------------------------------------------------------------------ */
/* Operator alert chat                                                 */
/* ------------------------------------------------------------------ */

async function readAlertState(): Promise<{ chatId?: string | null; lastAlertAt?: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "slo_alert")
    .maybeSingle();
  if (!row?.value) return {};
  try {
    return JSON.parse(row.value) as { chatId?: string | null; lastAlertAt?: number };
  } catch {
    return {};
  }
}

export async function getAlertChat(): Promise<string | null> {
  return (await readAlertState()).chatId ?? null;
}

/** Passing null disables paging but keeps the cooldown bookkeeping intact. */
export async function setAlertChat(chatId: string | null): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const state = await readAlertState();
  const { error } = await supabaseAdmin
    .from("app_settings")
    .upsert(
      { key: "slo_alert", value: JSON.stringify({ ...state, chatId }) },
      { onConflict: "key" },
    );
  if (error) throw error;
}
