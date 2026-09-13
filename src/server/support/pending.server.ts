/**
 * Draft store for the support bot's ticket form.
 *
 * Telegram gives us no session, so the multi-step form (type → title →
 * details → confirm) keeps its state here. The draft lives in `app_settings`
 * (already used for operator documents) and expires on its own, so no schema
 * change and no cleanup job.
 */

import type { TicketFormKind } from "@/lib/ticket-form";

const TTL_MS = 30 * 60_000;

export type TicketStep = "kind" | "title" | "details" | "confirm";

export interface TicketDraft {
  step: TicketStep;
  kind?: TicketFormKind;
  title?: string;
  details?: string;
  startedAt: string;
}

function key(chatId: string): string {
  return `support_pending_ticket:${chatId}`;
}

export async function saveTicketDraft(chatId: string, draft: TicketDraft): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("app_settings")
    .upsert({ key: key(chatId), value: JSON.stringify(draft) }, { onConflict: "key" });
}

export async function startTicketDraft(chatId: string): Promise<TicketDraft> {
  const draft: TicketDraft = { step: "kind", startedAt: new Date().toISOString() };
  await saveTicketDraft(chatId, draft);
  return draft;
}

export async function clearTicketDraft(chatId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("app_settings").delete().eq("key", key(chatId));
}

/** The in-progress form for this chat, or null when there is none / expired. */
export async function getTicketDraft(chatId: string): Promise<TicketDraft | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", key(chatId))
    .maybeSingle();
  if (!data?.value) return null;

  let draft: TicketDraft | null = null;
  try {
    const parsed = JSON.parse(data.value) as Partial<TicketDraft>;
    if (parsed && typeof parsed.step === "string") draft = parsed as TicketDraft;
  } catch {
    // Legacy value (a bare timestamp from the old one-step flow).
    draft = { step: "kind", startedAt: data.value };
  }
  if (!draft) return null;

  const age = Date.now() - new Date(draft.startedAt).getTime();
  if (Number.isNaN(age) || age > TTL_MS) {
    await clearTicketDraft(chatId);
    return null;
  }
  return draft;
}
