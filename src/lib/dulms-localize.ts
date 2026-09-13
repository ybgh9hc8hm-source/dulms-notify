/**
 * DULMS rows are scraped in Arabic (that is how the portal exposes them and how
 * the Telegram messages read). The web UI is bilingual, so anything that comes
 * from the scraper is normalized to English here when the user picks English.
 *
 * Nothing is translated back to Arabic: Arabic is already the source form.
 */

type Lang = "en" | "ar";

/** Exact phrase map (whole segment matches). */
const PHRASES: Record<string, string> = {
  // Session types
  محاضرة: "Lecture",
  سكشن: "Section",
  عملي: "Lab",
  نظري: "Lecture",
  "سكشن (عملي)": "Section (lab)",

  // Staff roles
  دكتور: "Professor",
  "د.": "Dr.",
  معيد: "Teaching assistant",
  "م.": "TA",
  مدرس: "Instructor",

  // Assignment / sheet states
  "متاح للتسليم": "Open for submission",
  "متاحة للتسليم": "Open for submission",
  مسلَّم: "Submitted",
  مسلم: "Submitted",
  مسلمة: "Submitted",
  "مسلَّم متأخر": "Submitted late",
  "انتهى — مسلَّم": "Closed — submitted",
  "انتهى — مسلَّم متأخر": "Closed — submitted late",
  "انتهى — لم يُسلَّم": "Closed — not submitted",
  "انتهى — متأخر": "Closed — late",
  "لم يُسلَّم بعد": "Not submitted yet",
  انتهى: "Closed",
  "لم يبدأ بعد": "Not started yet",

  // Quiz states
  "جاري الآن": "In progress",
  "متاح للحل": "Open now",

  // Attendance
  غياب: "Absent",
  حضور: "Present",
  "لم يُرصد بعد": "Not recorded yet",
  "لم يُرصد الحضور بعد": "Attendance not recorded yet",
  "لا يوجد غياب حتى الآن": "No absences so far",
  "سجل حضور المحاضرات": "Lecture attendance record",
  بصمة: "Fingerprint device",
  يدوي: "Manual entry",
  "رصد يدوي": "Manual entry",

  // Gradebook / results
  "تم الرصد": "Recorded",
  "بانتظار الرصد": "Awaiting recording",
  "لم تُرصد بعد": "Not recorded yet",
  "لم تُرصد أي درجة بعد": "No grade recorded yet",
  "تم رصد كل الدرجات": "All grades recorded",
  "إجمالي أعمال السنة": "Coursework total",
  "لم تُضف أعمال سنة لهذه المادة بعد": "No coursework added for this course yet",
  كويز: "Quiz",
  تكليف: "Assignment",
  امتحان: "Exam",
  ناجح: "Pass",
  راسب: "Fail",
  منسحب: "Withdrawn",
  مؤجّل: "Deferred",
  "لم تُعلَن بعد": "Not published yet",
  "النتيجة محجوبة": "Result withheld",
  "الفصل الحالي": "Current semester",
  "إعلان جديد": "New announcement",
  "حدث في التقويم": "Calendar event",
  "غير مذكور": "Not stated",
  "غير محدد": "Not specified",
  مادة: "Course",
  // DULMS itself returns this misspelling for an unknown final grade.
  unkown: "Unknown",

  // Extra keys
  يبدأ: "Starts",
  ينتهي: "Ends",
  النوع: "Type",
  التسليم: "Submission",
  "تم التسليم": "Submitted",
  "لم يتم التسليم": "Not submitted",
  المعيد: "Teaching assistant",
  محاولات: "Attempts",
  المحاولات: "Attempts",
  المحاضر: "Instructor",
  المجموعة: "Group",
  القاعة: "Room",
  الصفحة: "Page",
  أجازة: "Holiday",
  "مصدر الرصد": "Recorded by",
  التفاصيل: "Details",
  النسبة: "Percentage",
  "درجة النجاح": "Pass mark",
  "درجة العنصر": "Item total",
  "المجموع الكلي": "Overall total",
  الكويزات: "Quizzes",
  التكاليف: "Assignments",
  الفصل: "Semester",
  التقدير: "Grade",
  السبب: "Reason",
  "معدل الفصل SGPA": "Semester GPA (SGPA)",
  "المعدل التراكمي CGPA": "Cumulative GPA (CGPA)",
  "محاضرات مرصودة حضور": "Lectures marked present",
  "محاضرات غياب": "Lectures marked absent",
};

/** Dynamic patterns, applied when no exact phrase matched. */
const PATTERNS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^غياب\s+(\d+)\s+من\s+(\d+)\s+محاضرة$/u, (m) => `Absent ${m[1]} of ${m[2]} lectures`],
  [/^تم رصد\s+(\d+)\s+من\s+(\d+)$/u, (m) => `${m[1]} of ${m[2]} recorded`],
  [/^(\d+)\s+عنصر$/u, (m) => `${m[1]} item${m[1] === "1" ? "" : "s"}`],
  [/^(\d+)\s+مادة$/u, (m) => `${m[1]} course${m[1] === "1" ? "" : "s"}`],
  [/^معدل الفصل\s+(.+)$/u, (m) => `Semester GPA ${m[1]}`],
  [/^التراكمي\s+(.+)$/u, (m) => `Cumulative GPA ${m[1]}`],
  [/^من\s+([\d.]+)\s*درجة?$/u, (m) => `out of ${m[1]}`],
  [/^من\s+([\d.]+)$/u, (m) => `out of ${m[1]}`],
  [/^الموعد:\s*(.+)$/u, (m) => `Due: ${m[1]}`],
  [/^الأسبوع\s*(\d+)$/u, (m) => `Week ${m[1]}`],
  [/^محاضرة\s*(\d+)$/u, (m) => `Lecture ${m[1]}`],
  [/^النتيجة النهائية\s*—\s*(.+)$/u, (m) => `Final result — ${localizeSegment(m[1] ?? "")}`],
  [/^ملخص النتيجة\s*—\s*(.+)$/u, (m) => `Result summary — ${localizeSegment(m[1] ?? "")}`],
  [/^إنذار رقم\s*(\d+)$/u, (m) => `Warning no. ${m[1]}`],
];

/** Weekday names produced by the scraper (schedule titles). */
const DAYS: Record<string, string> = {
  السبت: "Saturday",
  الأحد: "Sunday",
  الإثنين: "Monday",
  الاثنين: "Monday",
  الثلاثاء: "Tuesday",
  الأربعاء: "Wednesday",
  الخميس: "Thursday",
  الجمعة: "Friday",
};

/** Semester wording, e.g. "الفصل الدراسي الأول 2025/2026". */
const SEMESTER: Record<string, string> = {
  "الفصل الدراسي الأول": "First semester",
  "الفصل الدراسي الثاني": "Second semester",
  "الفصل الصيفي": "Summer semester",
};

function localizeSegment(raw: string): string {
  const text = raw.trim();
  if (!text) return raw;
  const exact = PHRASES[text] ?? DAYS[text] ?? SEMESTER[text];
  if (exact) return exact;
  for (const [pattern, build] of PATTERNS) {
    const match = text.match(pattern);
    if (match) return build(match);
  }
  // Compound semester label ("الفصل الدراسي الأول 2025/2026").
  for (const [ar, en] of Object.entries(SEMESTER)) {
    if (text.startsWith(ar)) return `${en}${text.slice(ar.length)}`;
  }
  return text;
}

/**
 * Localizes one scraped string. Segments separated by "•" or "—" are
 * translated independently so mixed strings ("غياب • 12/03/2026") work.
 */
export function localizeDulms(value: string | null | undefined, lang: Lang): string {
  if (!value) return value ?? "";
  if (lang === "ar") return value;
  const direct = localizeSegment(value);
  if (direct !== value.trim()) return direct;
  return value
    .split(/\s*•\s*/u)
    .map((part) =>
      part
        .split(/\s+—\s+/u)
        .map((chunk) => localizeSegment(chunk))
        .join(" — "),
    )
    .join(" • ");
}
