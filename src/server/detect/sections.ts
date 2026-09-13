/**
 * Central PageUrl → section mapping.
 *
 * The DULMS notification feed returns a `PageUrl` per notification; that URL is
 * the only hint about *which* part of the account moved. All string matching
 * lives here so the mapping can be tuned in one place.
 */

export type DulmsSection =
  | "notifications"
  | "grades"
  | "courses"
  | "schedule"
  | "attendance"
  | "account_update"
  /** Retired categories — mapped here so the event is dropped, never notified. */
  | "drop";

interface Rule {
  section: DulmsSection;
  patterns: RegExp[];
}

const RULES: Rule[] = [
  { section: "grades", patterns: [/grade/i, /result/i, /mark/i, /gradebook/i, /degree/i] },
  { section: "attendance", patterns: [/attend/i, /absence/i, /absent/i] },
  {
    section: "drop",
    patterns: [
      /fee/i,
      /finance/i,
      /payment/i,
      /invoice/i,
      /account_?statement/i,
      /registration/i,
      /register/i,
      /desire/i,
      /adddrop/i,
      /proposal/i,
      /document/i,
      /gpa/i,
      /programchart/i,
      /coursesspecs/i,
    ],
  },
  { section: "schedule", patterns: [/schedule/i, /timetable/i, /calendar/i, /lecture/i] },
  {
    section: "courses",
    patterns: [/course/i, /material/i, /assignment/i, /quiz/i, /exam/i, /content/i, /discussion/i],
  },
  { section: "drop", patterns: [/profile/i, /student(info|data)/i, /myaccount/i] },
  { section: "notifications", patterns: [/notification/i, /announcement/i, /message/i, /news/i] },
];

/** Maps a raw PageUrl to a stable section. Unknown URLs never drop the event. */
export function mapDulmsPageToSection(pageUrl: string | null | undefined): DulmsSection {
  const url = (pageUrl ?? "").trim();
  if (!url) return "account_update";
  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => pattern.test(url))) return rule.section;
  }
  return "account_update";
}

/** Short, payload-free Arabic message shown to the student. */
const SECTION_MESSAGE: Record<DulmsSection, string> = {
  notifications: "🔔 يوجد تحديث جديد في الإشعارات",
  grades: "🎓 يوجد تحديث جديد في الدرجات",
  courses: "📚 يوجد تحديث جديد في المواد",
  schedule: "📅 يوجد تحديث جديد في الجدول",
  attendance: "🗓️ يوجد تحديث جديد في الحضور",
  account_update: "⚠️ يوجد تحديث جديد في حسابك",
  drop: "",
};

export function sectionMessage(section: DulmsSection): string {
  return SECTION_MESSAGE[section] ?? SECTION_MESSAGE.account_update;
}
