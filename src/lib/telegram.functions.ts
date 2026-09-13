import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getTelegramStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("dulms_accounts")
      .select("telegram_chat_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    return { connected: Boolean(data?.telegram_chat_id) };
  });

/** Issues a fresh one-time token and returns the bot deep link. */
export const createTelegramLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getBotUsername } = await import("@/server/telegram.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const username = await getBotUsername();
    if (!username) {
      return { ok: false as const, message: "بوت تليجرام غير مهيأ بعد" };
    }

    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

    // one active token per user
    await supabaseAdmin
      .from("telegram_link_tokens")
      .delete()
      .eq("user_id", context.userId)
      .is("used_at", null);
    const { error } = await supabaseAdmin
      .from("telegram_link_tokens")
      .insert({ token, user_id: context.userId });
    if (error) throw error;

    return { ok: true as const, url: `https://t.me/${username}?start=${token}` };
  });
