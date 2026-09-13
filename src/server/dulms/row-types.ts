/** Row shapes for the DULMS endpoints we map explicitly. */
export const DAYS = ["السبت", "الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];

export interface QuizRow {
  Quiz_Id: number | null;
  QuizName: string | null;
  CourseId?: number | null;
  Code: string | null;

  Name: string | null;
  StartDate: string | null;
  EndDate: string | null;
  AttemptsNo: number | null;
  Grade: number | null;
  MaxGrade: number | null;
  IsEnded: number | null;
  IsStarted: number | null;
  Inprogress: number | null;
}

export interface AssignmentRow {
  AssignmentId: number | null;
  AssignmentName: string | null;
  MaximumGrade: number | null;
  Grade: number | null;
  IsLate: number | null;
  StartDate: string | null;
  EndDate: string | null;
  IsStarted: number | null;
  IsEnded: number | null;
  /** Present (non-null) only once the student uploaded an answer. */
  AssignmentAnswerId?: number | null;
}

export interface AssignmentGroup {
  CourseName: string | null;
  CourseCode: string[] | null;
  Data: AssignmentRow[] | null;
}

/**
 * Four real submission states, derived from the portal payload:
 * `AssignmentAnswerId` is only set once an answer was uploaded.
 */
export function assignmentStatus(row: AssignmentRow): string {
  const submitted = row.AssignmentAnswerId != null;
  if (row.IsEnded) {
    if (!submitted) return "انتهى — لم يُسلَّم";
    return row.IsLate ? "انتهى — مسلَّم متأخر" : "انتهى — مسلَّم";
  }
  return submitted ? "مسلَّم" : "متاح للتسليم";
}

/** DULMS returns `NameEn` / `NameEn_distribution` as "lecture", "practical", … */
export function sessionKind(nameEn: string | null | undefined): "lecture" | "section" {
  return /practical|lab|section|tutorial|سكشن|عملي/i.test((nameEn ?? "").trim())
    ? "section"
    : "lecture";
}

export function sessionKindLabel(nameEn: string | null | undefined): string {
  return sessionKind(nameEn) === "section" ? "سكشن" : "محاضرة";
}

/**
 * DULMS never labels staff academic rank, but the timetable does say whether a
 * slot is a lecture (given by the course professor) or a section (given by the
 * teaching assistant), which is the distinction students actually care about.
 */
export function staffRoleLabel(nameEn: string | null | undefined): string {
  return sessionKind(nameEn) === "section" ? "المعيد" : "المحاضر";
}

export interface HistoryRow {
  SemesterName: string | null;
  SemesterYear: string | null;
  Code: string | null;
  Name: string | null;
  Grade: string | null;
  PassedHours: number | null;
  CGPA_History: number | null;
  SGPA_History: number | null;
}

export interface RegisteredRow {
  Subject_Code: string | null;
  Subject_Name: string | null;
  Subject_Hours: number | null;
  Lecture_Name: string | null;
  Section_Name: string | null;
  Reg_Date: string | null;
}

export interface TableRow {
  DayWeek: number | null;
  ClassRoomName: string | null;
  Code: string | null;
  Name: string | null;
  NameEn: string | null;
  GroupName: string | null;
  IntervalId: number | null;
  IntervalsCount: number | null;
  Staff: string | null;
}

export interface IntervalRow {
  TimeFrom: string;
  TimeTo: string;
  IntervalId: number;
  Number: number;
}

export interface MaterialRow {
  CourseId: number | null;
  Code: string | null;
  Name: string | null;
  WeekNumber: string | null;
  FileId: number | null;
  FileName: string | null;
  FileSize: string | null;
  NameEn: string | null;
  CreationDate: string | null;
  NameEn_Employee: string | null;
}

export interface AbsenceRow {
  CourseId: number | null;
  HolidayName: string | null;
  LastUpdateFrom: string | null;
  Code: string | null;
  Name: string | null;
  LectureId: number | null;
  LectureWeek: string | null;
  LectureDate: string | null;
  NameEn_distribution: string | null;
  IsAbsent: boolean | null;
  StudentGrade: number | null;
  AbsentRatio: string | null;
}

export interface NotificationRow {
  NotificationId: number;
  NotifyDate: string | null;
  NotifyExplain: string | null;
  FromUserName: string | null;
  PageUrl: string | null;
}

export function quizStatus(row: QuizRow): string {
  if (row.Inprogress) return "جاري الآن";
  if (row.IsEnded) return "انتهى";
  if (row.IsStarted) return "متاح للحل";
  return "لم يبدأ بعد";
}
