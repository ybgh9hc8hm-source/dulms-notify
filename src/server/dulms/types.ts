/** Shared DULMS domain types. */
export type ItemKind =
  | "quiz"
  | "assignment"
  | "schedule"
  | "absence"
  | "attendance"
  | "notice"
  | "event"
  | "announcement"
  | "gradebook"
  | "finalResult"
  | "warning"
  | "exam"
  | "registration"
  | "courseOffer"
  | "other";

export interface ScrapedItem {
  kind: ItemKind;
  externalKey: string;
  course: string | null;
  title: string;
  dueAt: string | null;
  status: string | null;
  score: string | null;
  extra: Record<string, string>;
}

/** Header summary shown at the top of the dashboard (mirrors the DULMS profile card). */
export interface DulmsProfile {
  name: string | null;
  dulmsId: string | null;
  photo: string | null;
  faculty: string | null;
  program: string | null;
  guide: string | null;
  status: string | null;
  level: string | null;
  cgpa: string | null;
  sgpa: string | null;
  passedHours: number | null;
  requiredHours: number | null;
  remainingHours: number | null;
  registeredCourses: string | null;
  /** Semester-by-semester GPA progress (oldest → newest). */
  gpaHistory?: { semester: string; sgpa: number | null; cgpa: number | null }[];
  /** Study-plan groups with required vs. passed credit hours. */
  planGroups?: { name: string; totalHours: number; passedHours: number }[];
}

/** Loose JSON row coming back from a DULMS endpoint. */
export type Row = Record<string, unknown>;
