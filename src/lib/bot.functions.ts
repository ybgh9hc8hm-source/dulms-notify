/**
 * Telegram bot control surface for the admin panel.
 *
 * Everything the operator can do to the bot lives here: live status,
 * webhook / menu-button maintenance, the subscriber roster (with Telegram
 * usernames), targeted sends and previews.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const gate = z.object({
  key: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(300),
});

async function authorize(key: string, password: string) {
  const { authorizeAdmin } = await import("@/server/admin/auth-guard.server");
  return (await authorizeAdmin(key, password)).ok;
}

/** Live health of the bot: identity, webhook, menu button, delivery counters. */
export const adminBotStatus = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => gate.parse(input))
  .handler(async ({ data }) => {
    if (!(await authorize(data.key, data.password))) {
      return { ok: false as const, message: "غير مصرح" };
    }
    const { getBotInfo, getWebhookInfo, appOrigin } = await import("@/server/telegram.server");
    const { getSupportBotUsername, getSupportWebhookInfo, supportOrigin } =
      await import("@/server/support/bot.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    const [info, hook, linked, total, updates24h, pendingTokens, supportName, supportHook] =
      await Promise.all([
        getBotInfo(),
        getWebhookInfo(),
        supabaseAdmin
          .from("dulms_accounts")
          .select("user_id", { count: "exact", head: true })
          .not("telegram_chat_id", "is", null),
        supabaseAdmin.from("dulms_accounts").select("user_id", { count: "exact", head: true }),
        supabaseAdmin
          .from("telegram_updates")
          .select("update_id", { count: "exact", head: true })
          .gte("created_at", dayAgo),
        supabaseAdmin
          .from("telegram_link_tokens")
          .select("token", { count: "exact", head: true })
          .gt("expires_at", new Date().toISOString()),
        getSupportBotUsername(),
        getSupportWebhookInfo(),
      ]);

    const supportInfo = supportHook.ok ? supportHook.info : null;
    const supportExpected = `${supportOrigin()}/api/public/hooks/support-bot`;

    const hookInfo = hook.ok ? hook.info : null;
    const expectedUrl = `${appOrigin()}/api/public/hooks/telegram`;

    return {
      ok: true as const,
      tokenSet: Boolean(process.env["TELEGRAM_BOT_TOKEN"]),
      bot: info.ok
        ? {
            id: String(info.bot["id"] ?? ""),
            username: (info.bot["username"] as string | undefined) ?? null,
            name: (info.bot["first_name"] as string | undefined) ?? null,
          }
        : null,
      botError: info.ok ? null : info.error,
      webhook: {
        url: (hookInfo?.["url"] as string | undefined) ?? null,
        expectedUrl,
        matches: (hookInfo?.["url"] as string | undefined) === expectedUrl,
        pending: Number(hookInfo?.["pending_update_count"] ?? 0),
        lastError: (hookInfo?.["last_error_message"] as string | undefined) ?? null,
        error: hook.ok ? null : hook.error,
      },
      counts: {
        linked: linked.count ?? 0,
        accounts: total.count ?? 0,
        updates24h: updates24h.count ?? 0,
        pendingLinkTokens: pendingTokens.count ?? 0,
      },
      miniAppUrl: `${appOrigin()}/dashboard`,
      support: {
        tokenSet: Boolean(process.env["SUPPORT_BOT_TOKEN"]),
        username: supportName,
        url: (supportInfo?.["url"] as string | undefined) ?? null,
        expectedUrl: supportExpected,
        matches: (supportInfo?.["url"] as string | undefined) === supportExpected,
        pending: Number(supportInfo?.["pending_update_count"] ?? 0),
        lastError: (supportInfo?.["last_error_message"] as string | undefined) ?? null,
        error: supportHook.ok ? null : supportHook.error,
      },
    };
  });

/** Re-registers the webhook or the Mini App menu button on Telegram. */
export const adminBotMaintain = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    gate
      .extend({ action: z.enum(["setWebhook", "setMenuButton", "setSupportWebhook"]) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (!(await authorize(data.key, data.password))) {
      return { ok: false as const, message: "غير مصرح" };
    }
    if (data.action === "setSupportWebhook") {
      const { registerSupportWebhook } = await import("@/server/support/bot.server");
      const res = await registerSupportWebhook();
      return res.ok
        ? { ok: true as const, message: `تم تسجيل ويبهوك بوت الدعم: ${res.url}` }
        : { ok: false as const, message: `فشل تسجيل ويبهوك الدعم: ${res.error}` };
    }
    const { registerWebhook, setMiniAppMenuButton } = await import("@/server/telegram.server");
    if (data.action === "setWebhook") {
      const res = await registerWebhook();
      return res.ok
        ? { ok: true as const, message: `تم تسجيل الويبهوك: ${res.url}` }
        : { ok: false as const, message: `فشل تسجيل الويبهوك: ${res.error}` };
    }
    const res = await setMiniAppMenuButton();
    return res.ok
      ? { ok: true as const, message: "تم تحديث زر الميني آب" }
      : { ok: false as const, message: `فشل تحديث الزر: ${res.error}` };
  });

/** Roster of every account with its Telegram link state and username. */
export const adminBotSubscribers = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    gate.extend({ withUsernames: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    if (!(await authorize(data.key, data.password))) {
      return { ok: false as const, message: "غير مصرح", subscribers: [] };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getChatProfile } = await import("@/server/telegram.server");

    const { data: rows, error } = await supabaseAdmin
      .from("dulms_accounts")
      // Never select the whole `profile` here: it embeds a base64 photo per
      // student and turns this list into tens of megabytes.
      .select(
        "user_id, dulms_id, telegram_chat_id, sync_enabled, last_sync_at, name:profile->>name",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;

    const base = (rows ?? []).map((row) => {
      const raw = (row as unknown as Record<string, unknown>)["name"];
      const name = typeof raw === "string" && raw.trim() ? raw : null;

      return {
        userId: row.user_id,
        dulmsId: row.dulms_id,
        name,
        chatId: row.telegram_chat_id,
        linked: Boolean(row.telegram_chat_id),
        syncEnabled: row.sync_enabled,
        lastSyncAt: row.last_sync_at,
        username: null as string | null,
        telegramName: null as string | null,
      };
    });

    if (data.withUsernames) {
      const linked = base.filter((row) => row.chatId).slice(0, 80);
      await Promise.all(
        linked.map(async (row) => {
          const profile = await getChatProfile(row.chatId!);
          if (profile) {
            row.username = profile.username;
            row.telegramName = profile.displayName;
          }
        }),
      );
    }

    return { ok: true as const, subscribers: base };
  });

/** Sends one operator message to a chosen audience. */
export const adminBotSend = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    gate
      .extend({
        text: z.string().trim().min(2).max(2000),
        target: z.enum(["all", "enabled", "selected"]),
        userIds: z.array(z.string().uuid()).max(500).optional(),
        withHeader: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (!(await authorize(data.key, data.password))) {
      return { ok: false as const, message: "غير مصرح", sent: 0, failed: 0 };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { escapeHtml } = await import("@/server/telegram.server");
    const { getBotConfig } = await import("@/server/admin/settings.server");
    const { fetchAllRows } = await import("@/server/db/paginate");
    const { enqueuePushes, flushNow } = await import("@/server/notify/outbox.server");
    const config = await getBotConfig();

    // Paginated: PostgREST caps a plain select at 1 000 rows, which would
    // silently drop most of the audience once the cohort grows.
    const rows = await fetchAllRows<{ user_id: string; telegram_chat_id: string | null }>(
      (from, to) => {
        let query = supabaseAdmin
          .from("dulms_accounts")
          .select("user_id, telegram_chat_id")
          .not("telegram_chat_id", "is", null)
          .order("user_id", { ascending: true })
          .range(from, to);
        if (data.target === "enabled") query = query.eq("sync_enabled", true);
        if (data.target === "selected") query = query.in("user_id", data.userIds ?? []);
        return query;
      },
    );

    const body = [
      data.withHeader === false ? null : `<b>${escapeHtml(config.header ?? "إشعار إداري")}</b>`,
      escapeHtml(data.text),
      config.footer ? `<i>${escapeHtml(config.footer)}</i>` : null,
    ]
      .filter(Boolean)
      .join("\n");

    // Queued, not sent inline: a serial loop over 10 000 chats would blow past
    // any request timeout. The outbox worker drains it with retries/backoff.
    const ids = await enqueuePushes(
      rows.filter((row) => row.telegram_chat_id).map((row) => ({ userId: row.user_id, body })),
    );
    const sent = await flushNow(ids.slice(0, 200));
    const queued = Math.max(0, ids.length - sent);

    return {
      ok: true as const,
      sent,
      failed: 0,
      message: queued
        ? `تم الإرسال إلى ${sent} — و${queued} في طابور الإرسال`
        : `تم الإرسال إلى ${sent} مشترك`,
    };
  });
