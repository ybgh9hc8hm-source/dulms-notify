/** Webhook of the standalone AI support bot. */
import { createFileRoute } from "@tanstack/react-router";

type Update = {
  update_id?: number;
  message?: {
    chat?: { id?: number };
    text?: string;
    from?: { id?: number; username?: string };
  };
};

const WELCOME = [
  "<b>AI Assistant &amp; Support</b>",
  "",
  "• اسأل عن درجاتك، مواعيدك، غيابك، أو حالة المزامنة.",
  "• الأسئلة <b>بلا حدود</b> (نفس الحساب على الموقع والبوت).",
  "• للمشاكل والاقتراحات: اضغط زر «🎫 فتح تذكرة دعم» — بيفتحلك <b>استمارة</b> من ٣ خطوات، والتذاكر كمان <b>بلا حدود</b>.",
  "",
  "<i>لو حسابك مش مربوط، افتح البوت الرئيسي واربط حسابك الأول.</i>",
].join("\n");

export const Route = createFileRoute("/api/public/hooks/support-bot")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supportWebhookSecret, sendSupportMessage, sendTyping, escapeHtml } =
          await import("@/server/support/bot.server");
        const { toTelegramHtml } = await import("@/server/support/format");

        const { safeEqual } = await import("@/server/cron-auth.server");
        const expected = await supportWebhookSecret();
        const got = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
        const { getSecret } = await import("@/server/vault.server");
        if (!(await getSecret("SUPPORT_BOT_TOKEN")) || !safeEqual(got, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const update = (await request.json().catch(() => null)) as Update | null;
        const chatId = update?.message?.chat?.id ?? null;
        const text = (update?.message?.text ?? "").trim();
        if (!chatId || !text) return Response.json({ ok: true, ignored: true });

        // ---- lockdown: bot interaction disabled by the operator --------------
        const { getFocusConfig, botAccessAllowedDuringLock } = await import(
          "@/server/admin/settings.server"
        );
        const lock = await getFocusConfig();
        const supportToken = text.startsWith("/start") ? (text.split(/\s+/)[1] ?? null) : null;
        if (lock.botsLocked && !(await botAccessAllowedDuringLock(String(chatId), supportToken))) {
          await sendSupportMessage(chatId, lock.lockedMessage);
          return Response.json({ ok: true, locked: true });
        }

        // Idempotency: an AI answer can take tens of seconds, so Telegram may
        // redeliver the same update. Claim it first so the student never gets
        // the same reply twice. The offset keeps support ids from colliding
        // with the main bot's ids in the shared `telegram_updates` table.
        if (typeof update?.update_id === "number") {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin
            .from("telegram_updates")
            .insert({ update_id: update.update_id + 1_000_000_000_000, chat_id: String(chatId) });
          if (error?.code === "23505") return Response.json({ ok: true, duplicate: true });
        }

        try {
          const chat = String(chatId);
          const { TICKET_BUTTON_LABEL, sendKindPicker, sendConfirmPicker, SUPPORT_KEYBOARD } =
            await import("@/server/support/bot.server");
          const { startTicketDraft, saveTicketDraft, clearTicketDraft, getTicketDraft } =
            await import("@/server/support/pending.server");
          const { kindFromLabel, kindLabel } = await import("@/lib/ticket-form");

          if (text.startsWith("/start") || text === "/help") {
            const { getSupportConfig } = await import("@/server/admin/settings.server");
            const { welcome } = await getSupportConfig();
            await clearTicketDraft(chat);
            await sendSupportMessage(chatId, `${WELCOME}\n\n${escapeHtml(welcome)}`);
            return Response.json({ ok: true });
          }

          if (text === "/cancel" || text === "❌ إلغاء") {
            await clearTicketDraft(chat);
            await sendSupportMessage(chatId, "تم إلغاء الاستمارة. ابعت سؤالك عادي.");
            return Response.json({ ok: true });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: account } = await supabaseAdmin
            .from("dulms_accounts")
            .select("user_id")
            .eq("telegram_chat_id", chat)
            .maybeSingle();
          const userId = account?.user_id ?? null;

          // Step 0: the button (or /ticket) only opens the form — costs nothing.
          if (text === TICKET_BUTTON_LABEL || text === "/ticket") {
            const { ticketQuota, resolveIdentity, throttledTicketMessage } =
              await import("@/server/support/quota.server");
            const quota = await ticketQuota(await resolveIdentity({ userId, chatId: chat }));
            if (!quota.allowed) {
              await clearTicketDraft(chat);
              await sendSupportMessage(chatId, escapeHtml(throttledTicketMessage(quota)));
              return Response.json({ ok: true });
            }
            await startTicketDraft(chat);
            await sendKindPicker(
              chatId,
              [
                "<b>استمارة تذكرة دعم — خطوة ١ من ٣</b>",
                "اختار نوع التذكرة من الأزرار تحت 👇",
                quota.limit > 0
                  ? `<i>متبقي لك ${quota.remaining} من ${quota.limit} تذاكر. للإلغاء اكتب /cancel</i>`
                  : "<i>عدد التذاكر بلا حدود. للإلغاء اكتب /cancel</i>",
              ].join("\n"),
            );
            return Response.json({ ok: true });
          }

          // Steps 1–3: the guided form. Only the final confirm files a ticket.
          const draft = await getTicketDraft(chat);
          if (draft) {
            if (draft.step === "kind") {
              const kind = kindFromLabel(text);
              if (!kind) {
                await sendKindPicker(
                  chatId,
                  "اختار نوع التذكرة من الأزرار تحت، أو اكتب /cancel للإلغاء.",
                );
                return Response.json({ ok: true });
              }
              await saveTicketDraft(chat, { ...draft, kind, step: "title" });
              await sendSupportMessage(
                chatId,
                [
                  "<b>خطوة ٢ من ٣ — العنوان</b>",
                  `النوع: ${escapeHtml(kindLabel(kind))}`,
                  "اكتب عنوانًا قصيرًا للتذكرة (٣ إلى ٨ كلمات).",
                ].join("\n"),
                { keyboard: false },
              );
              return Response.json({ ok: true });
            }

            if (draft.step === "title") {
              if (text.length < 3) {
                await sendSupportMessage(chatId, "العنوان قصير جدًا، اكتبه في كلمتين أو أكتر.", {
                  keyboard: false,
                });
                return Response.json({ ok: true });
              }
              await saveTicketDraft(chat, { ...draft, title: text.slice(0, 120), step: "details" });
              await sendSupportMessage(
                chatId,
                [
                  "<b>خطوة ٣ من ٣ — التفاصيل</b>",
                  "اشرح المشكلة أو الاقتراح بالتفصيل في رسالة واحدة (خطوات التكرار، وقت المشكلة، أي رسالة خطأ…).",
                ].join("\n"),
                { keyboard: false },
              );
              return Response.json({ ok: true });
            }

            if (draft.step === "details") {
              if (text.length < 10) {
                await sendSupportMessage(chatId, "محتاجين تفاصيل أكتر شوية (١٠ حروف على الأقل).", {
                  keyboard: false,
                });
                return Response.json({ ok: true });
              }
              const next = { ...draft, details: text.slice(0, 2000), step: "confirm" as const };
              await saveTicketDraft(chat, next);
              await sendConfirmPicker(
                chatId,
                [
                  "<b>مراجعة التذكرة</b>",
                  `النوع: ${escapeHtml(kindLabel(next.kind ?? "note"))}`,
                  `العنوان: ${escapeHtml(next.title ?? "")}`,
                  "",
                  escapeHtml(next.details ?? ""),
                  "",
                  "اضغط «✅ إرسال التذكرة» للتأكيد أو «❌ إلغاء».",
                ].join("\n"),
              );
              return Response.json({ ok: true });
            }

            if (draft.step === "confirm") {
              if (text !== "✅ إرسال التذكرة") {
                await sendConfirmPicker(
                  chatId,
                  "اضغط «✅ إرسال التذكرة» للتأكيد أو «❌ إلغاء» للخروج.",
                );
                return Response.json({ ok: true });
              }
              await clearTicketDraft(chat);
              const { fileTicketForm } = await import("@/server/support/tickets.server");
              const filed = await fileTicketForm({
                userId,
                chatId: chat,
                channel: "telegram",
                form: {
                  kind: draft.kind ?? "note",
                  title: draft.title ?? "تذكرة دعم",
                  details: draft.details ?? "",
                },
              });
              await sendSupportMessage(
                chatId,
                filed.ok ? escapeHtml(filed.reply) : escapeHtml(filed.error),
              );
              return Response.json({ ok: true, keyboard: Boolean(SUPPORT_KEYBOARD) });
            }
          }

          await sendTyping(chatId);

          const { answerSupport, recentTurnsForChat } =
            await import("@/server/support/agent.server");
          const { getSupportConfig } = await import("@/server/admin/settings.server");
          const supportConfig = await getSupportConfig();
          const history = await recentTurnsForChat(chat, supportConfig.historyTurns);
          const result = await answerSupport({
            userId,
            question: text,
            history,
            channel: "telegram",
            chatId: chat,
          });

          await sendSupportMessage(
            chatId,
            result.ok ? toTelegramHtml(result.reply) : escapeHtml(result.error),
          );
          return Response.json({ ok: true });
        } catch (error) {
          console.error("[support-bot] handler failed", error);
          // 200 so Telegram does not retry-storm on our own bugs.
          await sendSupportMessage(chatId, "حصل خطأ مؤقت، جرّب تبعت رسالتك تاني.").catch(() => {});
          return Response.json({ ok: true, handledError: true });
        }
      },
    },
  },
});
