/**
 * Ticket capture for the AI assistant.
 *
 * The model appends a machine tag at the very end of its reply whenever the
 * student reports a bug, asks for a feature, or leaves a note:
 *
 *   [[TICKET: kind | title | one-line summary]]
 *
 * We strip the tag before showing the answer and persist a row the operator
 * can triage in the admin dashboard.
 */

export type TicketKind = "suggestion" | "bug" | "question" | "note";

const KINDS: TicketKind[] = ["suggestion", "bug", "question", "note"];

const TAG = /\[\[\s*TICKET\s*:([^\]]*)\]\]/i;

export type ParsedTicket = { kind: TicketKind; title: string; summary: string };

/** Splits a raw model reply into the visible answer and an optional ticket. */
export function extractTicket(reply: string): { text: string; ticket: ParsedTicket | null } {
  const match = reply.match(TAG);
  if (!match) return { text: reply.trim(), ticket: null };

  const text = reply.replace(TAG, "").trim();
  const parts = (match[1] ?? "").split("|").map((part) => part.trim());
  const rawKind = (parts[0] ?? "").toLowerCase();
  const kind = (KINDS.find((item) => rawKind.includes(item)) ?? "note") as TicketKind;
  const title = (parts[1] || "طلب من مستخدم").slice(0, 120);
  const summary = (parts[2] || title).slice(0, 2000);

  return { text, ticket: { kind, title, summary } };
}

/** Persists a captured ticket. Never throws — support must keep answering. */
export async function saveTicket(options: {
  ticket: ParsedTicket;
  userId: string | null;
  channel: "web" | "telegram";
  chatId: string | null;
  question: string;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let dulmsId: string | null = null;
    if (options.userId) {
      const { data } = await supabaseAdmin
        .from("dulms_accounts")
        .select("dulms_id")
        .eq("user_id", options.userId)
        .maybeSingle();
      dulmsId = data?.dulms_id ?? null;
    }

    const body = `${options.ticket.summary}\n\n— رسالة المستخدم —\n${options.question}`.slice(
      0,
      4000,
    );

    const { error } = await supabaseAdmin.from("support_tickets").insert({
      user_id: options.userId,
      dulms_id: dulmsId,
      channel: options.channel,
      chat_id: options.chatId,
      kind: options.ticket.kind,
      title: options.ticket.title,
      body,
      priority: options.ticket.kind === "bug" ? "high" : "normal",
    });
    if (error) console.error("[support] ticket insert failed", error.message);
  } catch (error) {
    console.error("[support] ticket capture threw", error);
  }
}

/**
 * Dedicated support-ticket flow (separate from normal chat).
 *
 * A ticket is one shot: the student writes the problem/suggestion, the AI
 * classifies it, writes a short confirmation reply, and the row lands in
 * `support_tickets` for the operator. It has its own daily allowance and never
 * consumes the chat allowance (and is not stored in `support_messages`).
 */
export type TicketOutcome =
  | { ok: true; reply: string; kind: TicketKind; title: string; remaining: number }
  | { ok: false; error: string };

const TICKET_SYSTEM = `أنت موظف دعم لموقع DULMS Notify. الطالب بيفتح تذكرة دعم.
- صنّف الطلب واكتب عنوانًا قصيرًا وملخصًا واضحًا للفريق.
- ردّ على الطالب بجملة أو جملتين بالعربية المصرية تطمنه إن التذكرة اتسجّلت، وبدون وعود بمواعيد.
- لو رسالة الطالب بالإنجليزية، رُدّ بالإنجليزية.
- في آخر الرد اكتب سطرًا منفصلًا حرفيًا:
[[TICKET: kind | عنوان قصير | ملخص سطر واحد للفريق]]
- kind واحدة من: suggestion أو bug أو question أو note.
- لا تشرح السطر ولا تذكره للطالب.`;

export async function fileSupportTicket(options: {
  userId: string | null;
  chatId: string | null;
  channel: "web" | "telegram";
  text: string;
}): Promise<TicketOutcome> {
  const { getSupportConfig } = await import("@/server/admin/settings.server");
  const config = await getSupportConfig();
  if (!config.enabled || !config.ticketsEnabled) {
    return { ok: false, error: "نظام التذاكر متوقف مؤقتًا، جرّب بعد شوية." };
  }

  const { ticketQuota, resolveIdentity, throttledTicketMessage } = await import("./quota.server");
  const identity = await resolveIdentity({ userId: options.userId, chatId: options.chatId });
  const quota = await ticketQuota(identity);
  if (!quota.allowed) return { ok: false, error: throttledTicketMessage(quota) };

  const { chatComplete } = await import("./openrouter.server");
  const { sanitizeReply } = await import("./format");

  const result = await chatComplete(
    [
      { role: "system", content: TICKET_SYSTEM },
      { role: "user", content: options.text },
    ],
    { model: config.model, temperature: 0.2, maxTokens: 400 },
  );

  // The ticket must be recorded even if the model is unavailable.
  const parsed = result.ok
    ? extractTicket(result.reply)
    : { text: "", ticket: null as ParsedTicket | null };
  const ticket: ParsedTicket = parsed.ticket ?? {
    kind: "note",
    title: options.text.slice(0, 80) || "تذكرة دعم",
    summary: options.text.slice(0, 2000),
  };

  await saveTicket({
    ticket,
    userId: identity.userId,
    channel: options.channel,
    chatId: options.chatId,
    question: options.text,
  });

  const reply =
    sanitizeReply(parsed.text) || "تم تسجيل تذكرتك ووصلت للفريق. هنراجعها ونرد عليك في أقرب وقت.";

  return {
    ok: true,
    reply,
    kind: ticket.kind,
    title: ticket.title,
    remaining: Math.max(0, quota.remaining - 1),
  };
}

/**
 * Files a ticket coming from the structured support form (site dialog or the
 * bot's guided steps). No model call is needed: the student already chose the
 * type, the title and the details, so the row is exact and the reply is
 * deterministic — the student never gets a vague "تم استلام طلبك".
 */
export async function fileTicketForm(options: {
  userId: string | null;
  chatId: string | null;
  channel: "web" | "telegram";
  form: import("@/lib/ticket-form").TicketForm;
}): Promise<TicketOutcome> {
  const { getSupportConfig } = await import("@/server/admin/settings.server");
  const config = await getSupportConfig();
  if (!config.enabled || !config.ticketsEnabled) {
    return { ok: false, error: "نظام التذاكر متوقف مؤقتًا، جرّب بعد شوية." };
  }

  const { ticketQuota, resolveIdentity, throttledTicketMessage } = await import("./quota.server");
  const identity = await resolveIdentity({ userId: options.userId, chatId: options.chatId });
  const quota = await ticketQuota(identity);
  if (!quota.allowed) return { ok: false, error: throttledTicketMessage(quota) };

  const { formatTicketBody, kindLabel } = await import("@/lib/ticket-form");
  const title = options.form.title.trim().slice(0, 120);
  const details = options.form.details.trim();

  await saveTicket({
    ticket: { kind: options.form.kind, title, summary: formatTicketBody(options.form) },
    userId: identity.userId,
    channel: options.channel,
    chatId: options.chatId,
    question: details,
  });

  const remaining = Math.max(0, quota.remaining - 1);
  const reply = [
    `تم تسجيل التذكرة ✅`,
    `النوع: ${kindLabel(options.form.kind)}`,
    `العنوان: ${title}`,
    "وصلت للفريق وهنراجعها ونرد عليك هنا.",
    quota.limit > 0
      ? `متبقي لك ${remaining} من ${quota.limit} تذاكر خلال ٢٤ ساعة.`
      : "عدد التذاكر بلا حدود.",
  ].join("\n");

  return { ok: true, reply, kind: options.form.kind, title, remaining };
}
