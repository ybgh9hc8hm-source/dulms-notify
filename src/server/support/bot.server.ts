/**
 * Standalone support bot (separate Telegram bot, own token).
 *
 * It only talks to the AI support assistant — notifications keep using the
 * main bot in `telegram.server.ts`.
 */

import { SITE_URL } from "@/config/site";
import { hydrateSecrets, secret } from "../vault.server";

const API = "https://api.telegram.org";

function token(): string | null {
  return secret("SUPPORT_BOT_TOKEN") ?? null;
}

async function call(
  method: string,
  body: Record<string, unknown>,
  attempt = 0,
): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  await hydrateSecrets();
  const t = token();
  if (!t) return { ok: false as const, error: "SUPPORT_BOT_TOKEN غير مضبوط" };
  const res = await fetch(`${API}/bot${t}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    result?: unknown;
    description?: string;
    parameters?: { retry_after?: number };
  };
  if (!res.ok || json.ok === false) {
    // Unlike the notification bot there is no outbox behind this path, so a
    // rate-limited or transient reply would simply be lost. Retry once.
    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < 2) {
      const waitSeconds = json.parameters?.retry_after ?? (attempt + 1) * 2;
      await new Promise((resolve) => setTimeout(resolve, Math.min(waitSeconds, 10) * 1000));
      return call(method, body, attempt + 1);
    }
    return { ok: false as const, error: json.description ?? `Telegram error ${res.status}` };
  }
  return { ok: true as const, result: json.result };
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Label of the reply-keyboard button that starts a support ticket. */
const TICKET_BUTTON = "🎫 فتح تذكرة دعم";

let cachedUsername: string | null = null;
export async function getSupportBotUsername(): Promise<string | null> {
  if (cachedUsername) return cachedUsername;
  const res = await call("getMe", {});
  if (!res.ok) return null;
  cachedUsername = (res.result as { username?: string } | undefined)?.username ?? null;
  return cachedUsername;
}

/** Persistent keyboard: the ticket button lives next to the message box. */
export const SUPPORT_KEYBOARD = {
  keyboard: [[{ text: TICKET_BUTTON }]],
  resize_keyboard: true,
  is_persistent: true,
} as const;

export const TICKET_BUTTON_LABEL = TICKET_BUTTON;

export async function sendSupportMessage(
  chatId: string | number,
  text: string,
  options: { keyboard?: boolean } = {},
) {
  const { chunkTelegramText } = await import("@/server/telegram/limits");
  const parts = chunkTelegramText(text);
  let last = await call("sendMessage", {
    chat_id: chatId,
    text: parts[0],
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(options.keyboard === false ? {} : { reply_markup: SUPPORT_KEYBOARD }),
  });
  for (const part of parts.slice(1)) {
    if (!last.ok) return last;
    last = await call("sendMessage", {
      chat_id: chatId,
      text: part,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
  }
  return last;
}

/** One-off keyboard, used by the ticket form's steps. */
async function sendWithKeyboard(chatId: string | number, text: string, rows: string[][]) {
  return call("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: {
      keyboard: rows.map((row) => row.map((label) => ({ text: label }))),
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
}

/** Step 1 of the ticket form: pick the ticket type. */
export async function sendKindPicker(chatId: string | number, text: string) {
  const { TICKET_KINDS } = await import("@/lib/ticket-form");
  const labels = TICKET_KINDS.map((kind) => `${kind.emoji} ${kind.label}`);
  return sendWithKeyboard(chatId, text, [
    [labels[0]!, labels[1]!],
    [labels[2]!, labels[3]!],
    ["❌ إلغاء"],
  ]);
}

/** Final step of the ticket form: confirm or cancel. */
export async function sendConfirmPicker(chatId: string | number, text: string) {
  return sendWithKeyboard(chatId, text, [["✅ إرسال التذكرة"], ["❌ إلغاء"]]);
}

export async function sendTyping(chatId: string | number) {
  return call("sendChatAction", { chat_id: chatId, action: "typing" });
}

/** Shared secret for the webhook header, derived from the support bot token. */
export async function supportWebhookSecret(): Promise<string> {
  await hydrateSecrets();
  const t = token() ?? "";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`support-webhook:${t}`),
  );
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function supportOrigin(): string {
  return (secret("APP_PUBLIC_URL") ?? SITE_URL).replace(/\/+$/, "");
}

export async function registerSupportWebhook(origin?: string) {
  const url = `${(origin ?? supportOrigin()).replace(/\/+$/, "")}/api/public/hooks/support-bot`;
  const res = await call("setWebhook", {
    url,
    secret_token: await supportWebhookSecret(),
    allowed_updates: ["message"],
    drop_pending_updates: false,
  });
  return res.ok ? { ok: true as const, url } : { ok: false as const, error: res.error, url };
}

export async function getSupportWebhookInfo() {
  const res = await call("getWebhookInfo", {});
  return res.ok
    ? { ok: true as const, info: res.result as Record<string, unknown> }
    : { ok: false as const, error: res.error };
}
