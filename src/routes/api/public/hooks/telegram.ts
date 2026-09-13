/** Telegram webhook: account linking + inline-button navigation of the app sections. */
import { createFileRoute } from "@tanstack/react-router";

type Update = {
  update_id?: number;
  message?: { chat?: { id?: number }; text?: string };
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id?: number; chat?: { id?: number } };
  };
};

/** Network/database blips Telegram may usefully retry. */
function isTransient(cause: unknown): boolean {
  const message = (
    cause instanceof Error
      ? cause.message
      : typeof cause === "object" && cause
        ? String((cause as { message?: unknown }).message ?? "")
        : String(cause ?? "")
  ).toLowerCase();
  return (
    message.includes("fetch failed") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("etimedout") ||
    message.includes("timeout") ||
    message.includes("socket hang up") ||
    message.includes("connection terminated") ||
    message.includes("too many connections") ||
    message.includes("service unavailable")
  );
}

export const Route = createFileRoute("/api/public/hooks/telegram")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { webhookSecret, sendTelegramMessage, editTelegramMessage, answerCallbackQuery } =
          await import("@/server/telegram.server");

        const { safeEqual } = await import("@/server/cron-auth.server");
        const expected = await webhookSecret();
        const got = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
        const { getSecret } = await import("@/server/vault.server");
        if (!(await getSecret("TELEGRAM_BOT_TOKEN")) || !safeEqual(got, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const update = (await request.json().catch(() => null)) as Update | null;
        const updateId = typeof update?.update_id === "number" ? update.update_id : null;
        const chatIdForLog =
          update?.message?.chat?.id ?? update?.callback_query?.message?.chat?.id ?? null;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // ---- lockdown: bot interaction disabled by the operator --------------
        const { getFocusConfig, botAccessAllowedDuringLock } = await import(
          "@/server/admin/settings.server"
        );
        const lock = await getFocusConfig();
        const startText = (update?.message?.text ?? "").trim();
        const startToken = startText.startsWith("/start")
          ? (startText.split(/\s+/)[1] ?? null)
          : null;
        const allowedChat =
          chatIdForLog !== null &&
          (await botAccessAllowedDuringLock(String(chatIdForLog), startToken));
        if (lock.botsLocked && !allowedChat) {
          if (update?.callback_query?.id) await answerCallbackQuery(update.callback_query.id);
          if (chatIdForLog) await sendTelegramMessage(String(chatIdForLog), lock.lockedMessage);
          return Response.json({ ok: true, locked: true });
        }

        // ---- idempotency: Telegram retries the same update on any non-200 ----
        if (updateId !== null) {
          const { error: dedupeError } = await supabaseAdmin
            .from("telegram_updates")
            .insert({ update_id: updateId, chat_id: chatIdForLog ? String(chatIdForLog) : null });
          if (dedupeError) {
            if (dedupeError.code === "23505") {
              return Response.json({ ok: true, duplicate: true });
            }
            if (isTransient(dedupeError)) {
              console.error("[telegram] dedupe insert failed (transient)", {
                updateId,
                chatId: chatIdForLog,
                error: dedupeError.message,
              });
              return new Response("retry", { status: 500 });
            }
            console.error("[telegram] dedupe insert failed", {
              updateId,
              chatId: chatIdForLog,
              error: dedupeError.message,
            });
          }
        }

        try {
          const menu = await import("@/server/telegram/menu");
          const linkedUser = async (chat: string) => {
            const { data } = await supabaseAdmin
              .from("dulms_accounts")
              .select("user_id, profile")
              .eq("telegram_chat_id", chat)
              .maybeSingle();
            return data ?? null;
          };

          const firstName = (profile: unknown) => {
            const name = (profile as Record<string, unknown> | null)?.["name"];
            if (typeof name !== "string" || !name.trim()) return null;
            return name.trim().split(/\s+/)[0] ?? null;
          };

          // ---- inline button navigation -------------------------------------
          const cb = update?.callback_query;
          if (cb) {
            const chatId = cb.message?.chat?.id;
            const messageId = cb.message?.message_id;
            const data = cb.data ?? "";
            await answerCallbackQuery(cb.id);
            if (!chatId || !messageId) return Response.json({ ok: true });
            const chat = String(chatId);

            const account = await linkedUser(chat);
            if (!account?.user_id) {
              await editTelegramMessage(
                chat,
                messageId,
                "حسابك غير مربوط. افتح لوحة DULMS Notify واضغط «ربط تليجرام».",
              );
              return Response.json({ ok: true });
            }

            // ---- "register me in this group" buttons from an alert ---------
            const { parseWatchCallbackData } =
              await import("@/server/telegram/registration-buttons");
            const choice = parseWatchCallbackData(data);
            if (choice) {
              await sendTelegramMessage(chat, "جاري تنفيذ طلبك على بوابة الجامعة…");
              try {
                const { startRegistrationWatch } =
                  await import("@/server/dulms/watch-create.server");
                const outcome = await startRegistrationWatch(account.user_id, {
                  ...choice,
                  autoRegister: true,
                });
                await sendTelegramMessage(
                  chat,
                  outcome.registered
                    ? `تم تسجيلك في ${outcome.option.courseName} — ${outcome.option.label} ✅`
                    : `تمام، هراقب ${outcome.option.courseName} — ${outcome.option.label} وأسجلك أوتوماتيك أول ما يفتح.\n${outcome.message}`,
                );
              } catch (cause) {
                await sendTelegramMessage(
                  chat,
                  cause instanceof Error ? cause.message : "تعذر تنفيذ الطلب، حاول تاني.",
                );
              }
              return Response.json({ ok: true });
            }

            let view: import("@/server/telegram/menu").View | null = null;
            if (data === "home") view = await menu.homeView(account.user_id);
            else if (data.startsWith("g:")) view = menu.groupView(data.slice(2));
            else if (data.startsWith("alerts:"))
              view = await menu.alertsView(account.user_id, Number(data.split(":")[1]) || 0);
            else if (data.startsWith("c:")) {
              const [, categoryId, page] = data.split(":");
              view = await menu.categoryView(account.user_id, categoryId ?? "", Number(page) || 0);
            }
            if (!view) view = await menu.homeView(account.user_id);

            await editTelegramMessage(chat, messageId, view.text, view.keyboard);
            return Response.json({ ok: true });
          }

          // ---- plain messages ------------------------------------------------
          const chatId = update?.message?.chat?.id;
          const text = (update?.message?.text ?? "").trim();
          if (!chatId) return Response.json({ ok: true, ignored: true });
          const chat = String(chatId);

          const showMenu = async (userId: string, intro?: string) => {
            const view = await menu.homeView(userId);
            await sendTelegramMessage(
              chat,
              intro ? `${intro}\n\n${view.text}` : view.text,
              view.keyboard,
            );
          };

          if (text.startsWith("/start")) {
            const token = text.split(/\s+/)[1] ?? "";
            const existing = await linkedUser(chat);

            if (existing?.user_id && !token) {
              const name = firstName(existing.profile);
              await showMenu(existing.user_id, `حسابك مربوط بالفعل${name ? ` يا ${name}` : ""} ✅`);
              return Response.json({ ok: true });
            }

            if (!token) {
              await sendTelegramMessage(
                chat,
                "أهلًا بك في DULMS Notify\nافتح اللوحة واضغط «ربط تليجرام» لتوليد رابط الربط.",
              );
              return Response.json({ ok: true });
            }

            const { data: row } = await supabaseAdmin
              .from("telegram_link_tokens")
              .select("token, user_id, expires_at, used_at")
              .eq("token", token)
              .maybeSingle();

            if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
              if (existing?.user_id) {
                const name = firstName(existing.profile);
                await showMenu(
                  existing.user_id,
                  `حسابك مربوط بالفعل${name ? ` يا ${name}` : ""} ✅`,
                );
                return Response.json({ ok: true });
              }
              await sendTelegramMessage(
                chat,
                "رابط الربط غير صالح أو منتهي — ولّد رابطًا جديدًا من اللوحة.",
              );
              return Response.json({ ok: true });
            }

            if (existing?.user_id && existing.user_id === row.user_id) {
              const name = firstName(existing.profile);
              await showMenu(existing.user_id, `حسابك مربوط بالفعل${name ? ` يا ${name}` : ""} ✅`);
              return Response.json({ ok: true });
            }

            // A chat can only belong to one student.
            await supabaseAdmin
              .from("dulms_accounts")
              .update({ telegram_chat_id: null })
              .eq("telegram_chat_id", chat);

            const { error } = await supabaseAdmin
              .from("dulms_accounts")
              .update({ telegram_chat_id: chat })
              .eq("user_id", row.user_id);

            if (error) {
              await sendTelegramMessage(chat, "حصلت مشكلة أثناء الربط، حاول تاني.");
              return Response.json({ ok: false });
            }

            await supabaseAdmin
              .from("telegram_link_tokens")
              .update({ used_at: new Date().toISOString(), consumed_by_update_id: updateId })
              .eq("token", row.token);

            const { data: account } = await supabaseAdmin
              .from("dulms_accounts")
              .select("profile")
              .eq("user_id", row.user_id)
              .maybeSingle();
            const name = firstName(account?.profile);

            await showMenu(
              row.user_id,
              `أهلًا${name ? ` يا ${name}` : ""} — تم الربط بنجاح ✅\nهتوصلك إشعارات DULMS هنا أول ما يظهر أي جديد.`,
            );
            return Response.json({ ok: true });
          }

          if (text.startsWith("/stop")) {
            await supabaseAdmin
              .from("dulms_accounts")
              .update({ telegram_chat_id: null })
              .eq("telegram_chat_id", chat);
            await sendTelegramMessage(chat, "تم إيقاف الإشعارات على تليجرام.");
            return Response.json({ ok: true });
          }

          const account = await linkedUser(chat);
          if (!account?.user_id) {
            await sendTelegramMessage(
              chat,
              "حسابك غير مربوط. افتح لوحة DULMS Notify واضغط «ربط تليجرام».",
            );
            return Response.json({ ok: true });
          }
          await showMenu(account.user_id);
          return Response.json({ ok: true });
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : String(cause);
          console.error("[telegram] handler failed", {
            updateId,
            chatId: chatIdForLog,
            error: message,
          });
          // Only let Telegram retry when the failure is plausibly transient;
          // otherwise ack with 200 so our own bugs don't cause a retry storm.
          if (isTransient(cause)) return new Response("retry", { status: 500 });
          return Response.json({ ok: true, handled: false });
        }
      },
    },
  },
});
