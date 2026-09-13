import type { ScrapedItem } from "../dulms.server";
import type { RegistrationOption } from "../dulms/registration";

function fnv1a(payload: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Alerts are deduplicated on the *rendered* content, not on the raw snapshot
 * signature: seat counts and schedule rows fluctuate on every poll, which
 * changed the signature while the message the student reads stayed identical
 * (the same "3 courses offered" card resent every few minutes).
 */
export async function sendImmediateRegistrationAlert(
  userId: string,
  _signature: string,
  items: readonly ScrapedItem[],
  options: readonly RegistrationOption[] = [],
): Promise<number> {
  const summary = items.find((item) => item.kind === "registration");
  if (!summary) return 0;

  const { getBotConfig } = await import("../admin/settings.server");
  const config = await getBotConfig();
  if (!config.enabled || (config.mutedKinds ?? []).includes("registration")) return 0;

  const { formatMessage, categoryLabel, contextLine, detailLine, nowLine } =
    await import("./message-format");
  const category = categoryLabel("registration", config);
  const context = contextLine(summary.course, summary.title);
  const detail = detailLine(summary);
  // The timestamp line is deliberately excluded from the hash.
  const dedupeKey = `dulms:${userId}:registration-direct:${fnv1a([category, context, detail].join("|"))}`;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: seen } = await supabaseAdmin
    .from("notification_events")
    .select("dedupe_key")
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();
  if (seen) return 0;

  const body = formatMessage({ category, context, detail, time: nowLine() }, config);
  const { enqueuePushes, flushNow } = await import("../notify/outbox.server");
  const ids = await enqueuePushes([{ userId, body, dedupeKey }]);
  if (ids.length === 0) return 0;

  await supabaseAdmin.from("notifications").insert({
    user_id: userId,
    kind: "registration",
    title: "Course registration update",
    body: detail,
  });
  await supabaseAdmin
    .from("notification_events")
    .upsert(
      { user_id: userId, dedupe_key: dedupeKey, section: "registration" },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    );
  const sent = await flushNow(ids);
  await sendRegistrationChoiceButtons(userId, options);
  return sent;
}

/**
 * Follow-up message carrying one button per offered group (with its day/time).
 * Tapping a button starts a watch that registers right away when the group is
 * open, or automatically the moment it opens.
 */
export async function sendRegistrationChoiceButtons(
  userId: string,
  options: readonly RegistrationOption[],
): Promise<void> {
  if (options.length === 0) return;
  const { registrationChoiceKeyboard } = await import("../telegram/registration-buttons");
  const keyboard = registrationChoiceKeyboard(options);
  if (keyboard.length === 0) return;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: account } = await supabaseAdmin
    .from("dulms_accounts")
    .select("telegram_chat_id")
    .eq("user_id", userId)
    .maybeSingle();
  const chatId = account?.telegram_chat_id;
  if (!chatId) return;

  const { sendTelegramMessage } = await import("../telegram.server");
  await sendTelegramMessage(
    chatId,
    "اختر الجروب اللي عايز تتسجل فيه — لو مفتوح هيتسجل فورًا، ولو مقفول هستنى وأسجلك أول ما يفتح.",
    keyboard,
  );
}
