/**
 * Telegram message presentation layer.
 *
 * One professional, emoji-free template shared by every notification path
 * (sentinel section pushes, fresh items, changed items, batch summaries):
 *
 *   <b>[CATEGORY LABEL]</b>
 *   [course / context line]
 *   [what changed — value/status]
 *   <i>[time]</i>
 *
 * Telegram has no per-message colour, so the *structure* is what makes the
 * categories distinguishable. HTML parse mode only (<b>, <i>).
 */
import { escapeHtml } from "../telegram.server";

/**
 * Default category label per item kind.
 * These mirror the section names shown in the web app (English), so a message
 * in Telegram reads with exactly the same vocabulary as the dashboard.
 */
export const CATEGORY_LABEL: Record<string, string> = {
  quiz: "Quizzes",
  assignment: "Assignments",
  gradebook: "Grades book",
  finalResult: "Final result",
  result: "Final result",
  gpa: "GPA progress",
  absence: "Lectures absence",
  attendance: "Lecture attendance",
  warning: "Absence warnings",
  announcement: "Announcements",
  notice: "Announcements",
  event: "Events calendar",
  schedule: "Studying schedule",
  registration: "Course registration",
  courseOffer: "Course registration",
  other: "Updates",
};

/** Admin overrides shape (subset of BotConfig) applied on top of defaults. */
export type MessageConfig = {
  showTime?: boolean;
  header?: string | null;
  footer?: string | null;
  labels?: Record<string, string>;
  mutedKinds?: string[];
};

export function categoryLabel(kind: string, config?: MessageConfig): string {
  return config?.labels?.[kind] ?? CATEGORY_LABEL[kind] ?? CATEGORY_LABEL["other"]!;
}

/** Sentinel sections use the same vocabulary as the web app sections. */
export const SECTION_LABEL: Record<string, string> = {
  notifications: "Notifications",
  grades: "Grades book",
  schedule: "Studying schedule",
  attendance: "Lecture attendance",
  account_update: "Updates",
};

export function sectionLabel(section: string, config?: MessageConfig): string {
  return config?.labels?.[section] ?? SECTION_LABEL[section] ?? SECTION_LABEL["account_update"]!;
}

/** True when the operator muted this kind / sentinel section. */
export function isMuted(kind: string, config?: MessageConfig): boolean {
  return (config?.mutedKinds ?? []).includes(kind);
}

const RULE = "──────────";

/** Builds the shared template. All values are escaped here — pass raw text. */
export function formatMessage(
  parts: {
    category: string;
    context?: string | null;
    detail?: string | null;
    time?: string | null;
  },
  config?: MessageConfig,
): string {
  // Course alerts are intentionally terse: the course is the heading and the
  // next decision is visible without decorative labels or separators.
  if (parts.category === CATEGORY_LABEL["courseOffer"] && parts.context) {
    const lines = [`<b>${escapeHtml(parts.context)}</b>`];
    if (parts.detail) lines.push(escapeHtml(parts.detail));
    if (config?.footer) lines.push(`<i>${escapeHtml(config.footer)}</i>`);
    return lines.join("\n");
  }

  const lines: string[] = [];
  if (config?.header) lines.push(`<b>${escapeHtml(config.header)}</b>`);
  lines.push(`<b>${escapeHtml(parts.category)}</b>`);
  lines.push(RULE);

  const card: string[] = [];
  if (parts.context) card.push(`<b>${escapeHtml(parts.context)}</b>`);
  if (parts.detail) card.push(escapeHtml(parts.detail));
  if (parts.time && config?.showTime !== false) card.push(`<i>${escapeHtml(parts.time)}</i>`);
  if (card.length > 0) lines.push(`<blockquote>${card.join("\n")}</blockquote>`);

  if (config?.footer) lines.push(`<i>${escapeHtml(config.footer)}</i>`);
  return lines.join("\n");
}

/** "COURSE — Title" context line, collapsing the missing halves. */
export function contextLine(course: string | null | undefined, title: string): string {
  const clean = to12h(title).trim();
  const courseName = to12h(course).trim();
  // Course labels already read "CODE — Name"; repeating either half of that in
  // the title produced lines like "GEN302 — Risk — GEN302".
  if (courseName && clean && courseName !== clean && !courseName.includes(clean))
    return `${courseName} — ${clean}`;
  return courseName || clean;
}

/**
 * A DULMS score of "—" means "not graded yet", not a value. Sending the dash
 * alone ("— / 3") reads like a broken message, so it is spelled out.
 */
export function scoreText(score: string): string | null {
  const value = score.trim();
  if (!value) return null;
  const bare = value.replace(/[—–-]/g, "").replace(/[\s/]/g, "");
  // "—", "— / 3", "—/—" ... nothing was graded at all.
  if (!/\d/.test(value)) return "Not graded yet";
  if (bare && /^\d+$/.test(bare) && /^[—–-]\s*\/\s*\d+$/.test(value)) {
    return `Not graded yet (out of ${bare})`;
  }
  return `Score: ${value}`;
}

/** "بصمة" vs "يدوي" for an absence record, taken from the scraped extra. */
function attendanceSource(extra: Record<string, string> | undefined): string | null {
  const raw = extra?.["مصدر الرصد"] ?? extra?.["Source"];
  if (!raw) return null;
  return /finger|بصمة/i.test(raw) ? "Recorded: fingerprint" : "Recorded: manual";
}

/** Warning number + lecture date — the two facts a student must not miss. */
function warningDetail(extra: Record<string, string> | undefined): string | null {
  if (!extra) return null;
  const number = extra["WarningNum"] ?? extra["WarningsNo"];
  const date = extra["LectureDate"];
  const bits: string[] = [];
  if (number) bits.push(`Warning #${number}`);
  if (date) bits.push(`Lecture date: ${date}`);
  return bits.length > 0 ? bits.join(" • ") : null;
}

/** "الدرجة: 85/100" style value line built from whatever DULMS gave us. */
export function detailLine(parts: {
  kind?: string;
  status?: string | null;
  score?: string | null;
  dueAt?: string | null;
  extra?: Record<string, string>;
}): string | null {
  if (parts.kind === "courseOffer") {
    const status = parts.status ? to12h(parts.status) : null;
    const extra = parts.extra ?? {};
    const summary = [extra["Structure"], extra["Seats"]].filter(Boolean).join(" • ");
    return [status, summary].filter(Boolean).join("\n") || null;
  }

  const bits: string[] = [];
  if (parts.kind === "warning") {
    const warning = warningDetail(parts.extra);
    if (warning) bits.push(warning);
  }
  if (parts.score) {
    // Absence rows carry a group/counter string in `score`, not a grade —
    // prefixing it with "الدرجة" made the line read wrong.
    const text =
      parts.kind === "absence" || parts.kind === "registration" || parts.kind === "courseOffer"
        ? parts.score.trim()
        : // Final results carry a letter grade (B, C+, W) — never a mark out of N.
          parts.kind === "finalResult"
          ? `Grade: ${parts.score.trim()}`
          : scoreText(parts.score);
    if (text) bits.push(text);
  }

  if (parts.status) bits.push(to12h(parts.status));
  if (parts.kind === "absence") {
    const source = attendanceSource(parts.extra);
    if (source) bits.push(source);
  }
  if (parts.dueAt) bits.push(`Due: ${formatDue(parts.dueAt)}`);

  const head = bits.join(" • ");
  const details = extraLines(parts.kind, parts.extra);
  const body = [head, ...details].filter((line) => line.length > 0).join("\n");
  return body.length > 0 ? body : null;
}

/**
 * Everything else DULMS gave us about the item, one "label: value" per line.
 *
 * Without this the message says *that* something happened; with it the student
 * reads the whole record (group, hall, seats, hours, dates...) without opening
 * the portal. Keys already spoken in the head line are skipped, and the list is
 * bounded so a chatty endpoint can never produce a wall of text.
 */
const SKIPPED_EXTRA_KEYS: ReadonlySet<string> = new Set([
  "مصدر الرصد",
  "النوع",
  "WarningNum",
  "WarningsNo",
  "LectureDate",
]);

function extraLines(kind: string | undefined, extra?: Record<string, string>): string[] {
  if (!extra) return [];
  // The registration summary carries the actual list of open courses, which is
  // both long and the whole point of the notification — give it room.
  const maxLines = kind === "registration" || kind === "courseOffer" ? 14 : 8;
  const maxValue = kind === "registration" || kind === "courseOffer" ? 900 : 120;
  const lines: string[] = [];
  const entries = Object.entries(extra).sort(([a], [b]) => {
    if (a === "Offered courses" || a === "المواد المتاحة") return -1;
    if (b === "Offered courses" || b === "المواد المتاحة") return 1;
    return 0;
  });
  for (const [key, rawValue] of entries) {
    if (lines.length >= maxLines) break;
    if (SKIPPED_EXTRA_KEYS.has(key)) continue;
    if (/^(id|.*Id|guid|url|link)$/i.test(key)) continue;
    const raw = String(rawValue ?? "").trim();
    // Values that already carry AM/PM are portal-formatted; running them
    // through the 24h rewriter produced nonsense like "12:00 م AM".
    const value = /(AM|PM|[صم])/i.test(raw) ? raw : to12h(raw).trim();
    if (!value || value === "-" || value.length > maxValue) continue;
    if (value.includes("\n")) {
      lines.push(`${key}:`);
      lines.push(value);
    } else lines.push(`${key}: ${value}`);
  }
  if (kind === "courseOffer" && lines.length > 0) lines.unshift("");
  return lines;
}

function formatDue(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: true,
    timeZone: "Africa/Cairo",
  }).format(date);
}

/** Local "now" stamp used as the trailing italic line. */
export function nowLine(): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: true,
    timeZone: "Africa/Cairo",
  }).format(new Date());
}

/**
 * Batch summary: one line per category with its count, instead of a generic
 * "N items" line.
 */
export function formatBatch(
  kinds: readonly string[],
  heading = "New updates",
  config?: MessageConfig,
): string {
  const counts = new Map<string, number>();
  for (const kind of kinds) {
    const label = categoryLabel(kind, config);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const lines: string[] = [];
  if (config?.header) lines.push(`<b>${escapeHtml(config.header)}</b>`);
  const total = kinds.length;
  lines.push(`<b>${escapeHtml(heading)}</b>`);
  lines.push(`<i>${total} update${total === 1 ? "" : "s"}</i>`);
  lines.push(RULE);

  const card: string[] = [];
  for (const [label, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    card.push(`<b>${escapeHtml(label)}:</b> ${count}`);
  }
  if (config?.showTime !== false) card.push(`<i>${escapeHtml(nowLine())}</i>`);
  lines.push(`<blockquote>${card.join("\n")}</blockquote>`);

  if (config?.footer) lines.push(`<i>${escapeHtml(config.footer)}</i>`);
  return lines.join("\n");
}

/**
 * Scraped DULMS text (schedules, halls, exam slots) carries raw 24-hour clock
 * strings like "13:15 - 16:15". Rewrite every clock occurrence to the Arabic
 * 12-hour form ("١:١٥ م" → we keep latin digits: "1:15 م") so the bot and the
 * app never show 24-hour times.
 */
export function to12h(text: string | null | undefined): string {
  const value = (text ?? "").toString();
  if (!value) return "";
  return value.replace(
    /\b([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\b/g,
    (_match, h: string, m: string) => {
      const hour = Number(h);
      const suffix = hour < 12 ? "AM" : "PM";
      const display = hour % 12 === 0 ? 12 : hour % 12;
      return `${display}:${m} ${suffix}`;
    },
  );
}
