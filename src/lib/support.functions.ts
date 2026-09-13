/** Server functions powering the in-site AI support chat. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const turn = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const askSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  history: z.array(turn).max(20).default([]),
});

export const supportAsk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => askSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { answerSupport } = await import("@/server/support/agent.server");
    const result = await answerSupport({
      userId: context.userId,
      question: data.question,
      history: data.history,
      channel: "web",
    });
    if (!result.ok) return { ok: false as const, message: result.error };
    return { ok: true as const, reply: result.reply, model: result.model };
  });

/** Files a ticket from the structured form. Separate allowance from the chat. */
export const supportOpenTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        kind: z.enum(["bug", "suggestion", "question", "note"]),
        title: z.string().trim().min(3).max(120),
        details: z.string().trim().min(10).max(2000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { fileTicketForm } = await import("@/server/support/tickets.server");
    const result = await fileTicketForm({
      userId: context.userId,
      chatId: null,
      channel: "web",
      form: data,
    });
    if (!result.ok) return { ok: false as const, message: result.error };
    return { ok: true as const, reply: result.reply, remaining: result.remaining };
  });

/** Remaining daily allowances, so the UI can show them up front. */
export const supportQuota = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { chatQuota, ticketQuota, formatResetTime } =
      await import("@/server/support/quota.server");
    const identity = { userId: context.userId, chatId: null };
    const [chat, ticket] = await Promise.all([chatQuota(identity), ticketQuota(identity)]);
    return {
      chat: { ...chat, resetLabel: formatResetTime(chat.resetAt) },
      ticket: { ...ticket, resetLabel: formatResetTime(ticket.resetAt) },
    };
  });

/** Deep link of the standalone support bot, so the UI can offer it too. */
export const supportBotLink = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { getSupportBotUsername } = await import("@/server/support/bot.server");
    const { getSupportConfig } = await import("@/server/admin/settings.server");
    const [username, config] = await Promise.all([getSupportBotUsername(), getSupportConfig()]);
    return {
      username,
      url: username ? `https://t.me/${username}` : null,
      enabled: config.enabled && config.webEnabled,
      welcome: config.welcome,
      offlineMessage: config.offlineMessage,
    };
  });
