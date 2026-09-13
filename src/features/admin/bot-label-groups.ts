/**
 * Taxonomy used by the bot "labels" tab.
 *
 * The groups and the order of the entries mirror the dashboard sidebar, so an
 * operator sees the exact same structure they see on the site. Each entry keeps
 * the English site name (used as the default Telegram label), a short Arabic
 * hint, and the raw key stored in `bot_config.labels` / `mutedKinds`.
 */

export type LabelEntry = {
  /** Storage key: item kind or sentinel section id. */
  key: string;
  /** English name as shown on the website. */
  name: string;
  /** Short Arabic description of what triggers this notification. */
  hint: string;
  /** Sentinel sections are page-level pushes, not single items. */
  section?: boolean;
};

export type LabelGroup = {
  id: string;
  /** English group name, matching the sidebar. */
  name: string;
  /** Arabic group name. */
  nameAr: string;
  entries: LabelEntry[];
};

export const LABEL_GROUPS: LabelGroup[] = [
  {
    id: "elearning",
    name: "E-Learning",
    nameAr: "التعلم الإلكتروني",
    entries: [
      { key: "quiz", name: "Quizzes", hint: "كويز جديد أو تعديل في كويز" },
      { key: "assignment", name: "Assignments", hint: "تكليف جديد أو تعديل موعده" },
    ],
  },
  {
    id: "grades",
    name: "Exams & grades",
    nameAr: "الامتحانات والدرجات",
    entries: [
      { key: "gradebook", name: "Grades book", hint: "درجة جديدة في دفتر الدرجات" },
      { key: "finalResult", name: "Final result", hint: "ظهور أو تغيّر النتيجة النهائية" },
    ],
  },
  {
    id: "attendance",
    name: "Semester works",
    nameAr: "أعمال الفصل",
    entries: [
      { key: "absence", name: "Lectures absence", hint: "غياب جديد مسجَّل" },
      { key: "warning", name: "Absence warnings", hint: "إنذار غياب" },
      { key: "attendance", name: "Lecture attendance", hint: "تحديث في سجل الحضور" },
    ],
  },
  {
    id: "comm",
    name: "Announcements",
    nameAr: "الإعلانات",
    entries: [
      { key: "announcement", name: "Announcements", hint: "إعلان من الجامعة أو المادة" },
      { key: "notice", name: "Announcements", hint: "تنبيه من DULMS" },
      { key: "event", name: "Events calendar", hint: "حدث جديد في التقويم" },
    ],
  },
  {
    id: "academicReg",
    name: "Academic registration",
    nameAr: "التسجيل الأكاديمي",
    entries: [{ key: "schedule", name: "Studying schedule", hint: "تعديل في الجدول الدراسي" }],
  },
  {
    id: "sections",
    name: "Page-level pushes",
    nameAr: "تنبيهات الصفحات",
    entries: [
      {
        key: "notifications",
        name: "Notifications",
        hint: "تغيّر عام في صفحة الإشعارات",
        section: true,
      },
      { key: "grades", name: "Grades book", hint: "تغيّر عام في صفحة الدرجات", section: true },
      {
        key: "account_update",
        name: "Updates",
        hint: "تحديث عام في بيانات الحساب",
        section: true,
      },
      { key: "other", name: "Updates", hint: "أي تحديث غير مصنّف", section: true },
    ],
  },
];
