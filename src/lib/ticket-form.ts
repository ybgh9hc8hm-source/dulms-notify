/**
 * Shared shape of the support-ticket form used by both the site widget and
 * the Telegram bot. A ticket is never a plain chat message: it always carries
 * a type, a short title and the details, so the operator gets triage-ready
 * rows and the student sees a real form instead of a free-text box.
 */

export type TicketFormKind = "bug" | "suggestion" | "question" | "note";

export interface TicketForm {
  kind: TicketFormKind;
  title: string;
  details: string;
}

export const TICKET_KINDS: { value: TicketFormKind; label: string; emoji: string }[] = [
  { value: "bug", label: "مشكلة / عطل", emoji: "🐞" },
  { value: "suggestion", label: "اقتراح تحسين", emoji: "💡" },
  { value: "question", label: "استفسار للفريق", emoji: "❓" },
  { value: "note", label: "ملاحظة أخرى", emoji: "📝" },
];

export function kindLabel(kind: TicketFormKind): string {
  const found = TICKET_KINDS.find((item) => item.value === kind);
  return found ? `${found.emoji} ${found.label}` : "📝 ملاحظة أخرى";
}

/** Telegram sends back the button caption, so map captions to kinds. */
export function kindFromLabel(text: string): TicketFormKind | null {
  const clean = text.trim();
  const found = TICKET_KINDS.find(
    (item) => clean === `${item.emoji} ${item.label}` || clean === item.label,
  );
  return found?.value ?? null;
}

export function formatTicketBody(form: TicketForm): string {
  return [`النوع: ${kindLabel(form.kind)}`, `العنوان: ${form.title}`, "", form.details]
    .join("\n")
    .slice(0, 4000);
}
