/** Telegram Bot API delivery — the sole external notification channel. */

import { SITE_URL } from "@/config/site";
import { hydrateSecrets, secret } from "./vault.server";

const API = "https://api.telegram.org";

function token(): string | null {
  return secret("TELEGRAM_BOT_TOKEN") ?? null;
}

async function callTelegram(method: string, body: Record<string, unknown>) {
  await hydrateSecrets();
  const t = token();
  if (!t) return { ok: false as const, status: 0, error: "TELEGRAM_BOT_TOKEN غير مضبوط" };
  const res = await fetch(`${API}/bot${t}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    result?: unknown;
    description?: string;
    error_code?: number;
  };
  if (!res.ok || json.ok === false) {
    return {
      ok: false as const,
      status: json.error_code ?? res.status,
      error: json.description ?? `Telegram error ${res.status}`,
    };
  }
  return { ok: true as const, result: json.result };
}

/** Cached bot username so deep links can be built without a token round-trip. */
let cachedUsername: string | null = null;
export async function getBotUsername(): Promise<string | null> {
  if (cachedUsername) return cachedUsername;
  const res = await callTelegram("getMe", {});
  if (!res.ok) return null;
  const username = (res.result as { username?: string } | undefined)?.username ?? null;
  cachedUsername = username;
  return username;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Inline keyboard button: callback navigation, a link, or the Mini App. */
export type TelegramButton = {
  text: string;
  callback_data?: string;
  url?: string;
  web_app?: { url: string };
};

/** Public origin of the deployed site — used for the Mini App URL. */
export function appOrigin(): string {
  return (secret("APP_PUBLIC_URL") ?? SITE_URL).replace(/\/+$/, "");
}

/** Registers the persistent "Dulms Notify" menu button next to the chat input. */
export async function setMiniAppMenuButton() {
  return callTelegram("setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text: "Dulms Notify",
      web_app: { url: `${appOrigin()}/dashboard` },
    },
  });
}

/**
 * A chat is only "dead" when Telegram says the user is gone. Other 400s
 * (bad HTML entities, message too long, …) are our bugs — unlinking the
 * student for those would silently drop a working subscriber.
 */
const DEAD_CHAT =
  /chat not found|bot was blocked|user is deactivated|bot was kicked|chat_id is empty|PEER_ID_INVALID/i;

export function isDeadChatError(status: number, error: string): boolean {
  if (status === 403) return true;
  return status === 400 && DEAD_CHAT.test(error);
}

/** Sends a message to one chat. Never throws. Long text is split, not dropped. */
export async function sendTelegramMessage(
  chatId: string,
  text: string,
  keyboard?: TelegramButton[][],
) {
  try {
    const { chunkTelegramText } = await import("./telegram/limits");
    const parts = chunkTelegramText(text);
    for (let i = 0; i < parts.length; i++) {
      const last = i === parts.length - 1;
      const res = await callTelegram("sendMessage", {
        chat_id: chatId,
        text: parts[i],
        parse_mode: "HTML",
        disable_web_page_preview: true,
        // Buttons belong on the final part only.
        ...(keyboard && last ? { reply_markup: { inline_keyboard: keyboard } } : {}),
      });
      if (!res.ok) {
        const dead = isDeadChatError(res.status, res.error);
        if (!dead && res.status === 400) {
          console.error("[telegram] rejected message (not a dead chat)", {
            chatId,
            error: res.error,
          });
        }
        return { ok: false as const, dead, error: res.error };
      }
    }
    return { ok: true as const, dead: false };
  } catch (cause) {
    return {
      ok: false as const,
      dead: false,
      error: cause instanceof Error ? cause.message : "telegram send failed",
    };
  }
}

/** Replaces the text + buttons of an existing message (inline navigation). */
export async function editTelegramMessage(
  chatId: string,
  messageId: number,
  text: string,
  keyboard?: TelegramButton[][],
) {
  const { truncateTelegramText } = await import("./telegram/limits");
  const res = await callTelegram("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: truncateTelegramText(text),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
  // Re-tapping the same button repaints identical content; Telegram calls that
  // an error, but for us it is a no-op, not a failure worth logging.
  if (!res.ok && !res.error.includes("message is not modified")) {
    console.error("[telegram] edit failed", res.status, res.error);
  }
  return res;
}

/** Clears the loading spinner on a tapped inline button. */
export async function answerCallbackQuery(id: string, text?: string) {
  return callTelegram("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) });
}

/** Sends to a student's linked chat; unlinks the chat when Telegram says it's dead. */
export async function sendTelegramToUser(userId: string, text: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: account } = await supabaseAdmin
    .from("dulms_accounts")
    .select("telegram_chat_id")
    .eq("user_id", userId)
    .maybeSingle();

  const chatId = account?.telegram_chat_id ?? null;
  if (!chatId) return { sent: 0, skipped: true };

  const res = await sendTelegramMessage(chatId, text);
  if (!res.ok && res.dead) {
    await supabaseAdmin
      .from("dulms_accounts")
      .update({ telegram_chat_id: null })
      .eq("user_id", userId);
  }
  return { sent: res.ok ? 1 : 0, skipped: false };
}

/** Shared secret for the webhook header, derived from the bot token. */
export async function webhookSecret(): Promise<string> {
  await hydrateSecrets();
  const t = token() ?? "";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`tg-webhook:${t}`));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/* ------------------------------------------------------------------ *
 * Operator introspection / maintenance helpers used by the admin panel
 * ------------------------------------------------------------------ */

/** Raw getMe payload (id, username, name, capabilities). */
export async function getBotInfo() {
  const res = await callTelegram("getMe", {});
  return res.ok
    ? { ok: true as const, bot: res.result as Record<string, unknown> }
    : { ok: false as const, error: res.error };
}

/** Current webhook registration as Telegram sees it. */
export async function getWebhookInfo() {
  const res = await callTelegram("getWebhookInfo", {});
  return res.ok
    ? { ok: true as const, info: res.result as Record<string, unknown> }
    : { ok: false as const, error: res.error };
}

/** Re-registers the webhook on the current deployment origin. */
export async function registerWebhook(origin?: string) {
  const url = `${(origin ?? appOrigin()).replace(/\/+$/, "")}/api/public/hooks/telegram`;
  const res = await callTelegram("setWebhook", {
    url,
    secret_token: await webhookSecret(),
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
  });
  return res.ok ? { ok: true as const, url } : { ok: false as const, error: res.error, url };
}

/** Public profile of one chat (username / first name), for the subscriber list. */
export async function getChatProfile(chatId: string) {
  const res = await callTelegram("getChat", { chat_id: chatId });
  if (!res.ok) return null;
  const chat = res.result as {
    username?: string;
    first_name?: string;
    last_name?: string;
    type?: string;
  };
  return {
    username: chat.username ?? null,
    displayName: [chat.first_name, chat.last_name].filter(Boolean).join(" ") || null,
    type: chat.type ?? null,
  };
}
