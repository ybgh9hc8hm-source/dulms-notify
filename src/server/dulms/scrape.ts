/** Signs in and reads every DULMS section we know how to read. */
import { hasExamBeta } from "@/lib/exam-beta";
import { api, request } from "./http";
import { dropSession, getDulmsSession } from "./session";
import { readExams } from "./exams";
import { readExtras } from "./extras";
import { readRegistration } from "./registration";
import { readProfile } from "./profile";
import { courseLabel, gradeText, join, num, str, toIso, REMOVED_KINDS } from "./parse";

import { DAYS, assignmentStatus, quizStatus, sessionKindLabel, staffRoleLabel } from "./row-types";
import type {
  AbsenceRow,
  AssignmentGroup,
  IntervalRow,
  NotificationRow,
  QuizRow,
  TableRow,
} from "./row-types";
import type { DulmsProfile, ItemKind, Row, ScrapedItem } from "./types";

/** Signs in and reads every DULMS section we know how to read. */
export async function scrapeDulms(
  dulmsId: string,
  password: string,
  cachedPhoto?: string | null,
): Promise<{ items: ScrapedItem[]; profile: DulmsProfile | null }> {
  // Reuse the cached portal session when we have one; if the cookies were
  // rejected (we land back on login.aspx) sign in once and continue.
  let session = await getDulmsSession(dulmsId, password);
  let jar = session.jar;
  let landing = await request(jar, "/");
  if (/name="txtPass"/i.test(landing.html)) {
    await dropSession(dulmsId);
    session = await getDulmsSession(dulmsId, password, true);
    jar = session.jar;
    landing = await request(jar, "/");
  }
  const items: ScrapedItem[] = [];
  // تجربة محدودة: زر فتح المحاولة (كويز/امتحان) لحسابات البيتا فقط.
  const examBeta = hasExamBeta(dulmsId);

  const [quizzes, assignments, table, intervals, absences, notices] = await Promise.all([
    api<QuizRow>(jar, "/Quizzes/GetStudentQuizzes"),
    api<AssignmentGroup>(jar, "/Assignment/GetStudentAssignments"),
    api<TableRow>(jar, "/Registered/GetStudentTable", "POST"),
    api<IntervalRow>(jar, "/StudentSchedual/GetAllIntervals", "POST"),
    api<AbsenceRow>(jar, "/SemesterWorks/Report_StudentAllAbs", "POST"),
    api<NotificationRow>(jar, "/Notifications/GetNotifications", "POST", {
      Period: "Week",
      DateFrom: "",
      DateTo: "",
      IsSeen: -1,
    }),
  ]);

  for (const row of quizzes) {
    if (!row.Quiz_Id || !row.QuizName) continue;
    items.push({
      kind: "quiz",
      externalKey: `quiz-${row.Quiz_Id}`,
      course: courseLabel(row.Code, row.Name),
      title: row.QuizName,
      dueAt: toIso(row.EndDate),
      status: quizStatus(row),
      score: gradeText(row.Grade, row.MaxGrade),
      extra: {
        ...(examBeta ? { _quizId: String(row.Quiz_Id) } : {}),
        ...(row.StartDate ? { يبدأ: row.StartDate } : {}),
        ...(row.EndDate ? { ينتهي: row.EndDate } : {}),
        ...(row.AttemptsNo !== null ? { محاولات: String(row.AttemptsNo) } : {}),
      },
    });
  }

  for (const group of assignments) {
    for (const row of group.Data ?? []) {
      if (!row.AssignmentId || !row.AssignmentName) continue;
      items.push({
        kind: "assignment",
        externalKey: `assignment-${row.AssignmentId}`,
        course: courseLabel(group.CourseCode?.[0] ?? null, group.CourseName),
        title: row.AssignmentName,
        dueAt: toIso(row.EndDate),
        status: assignmentStatus(row),
        score: gradeText(row.Grade, row.MaximumGrade),
        extra: {
          ...(row.StartDate ? { يبدأ: row.StartDate } : {}),
          ...(row.EndDate ? { ينتهي: row.EndDate } : {}),
          التسليم: row.AssignmentAnswerId != null ? "تم التسليم" : "لم يتم التسليم",
        },
      });
    }
  }

  const byId = new Map(intervals.map((i) => [i.IntervalId, i]));
  const byNumber = new Map(intervals.map((i) => [i.Number, i]));
  for (const row of table) {
    if (!row.Code) continue;
    const start = row.IntervalId ? byId.get(row.IntervalId) : undefined;
    const end =
      start && row.IntervalsCount
        ? byNumber.get(start.Number + Math.max(row.IntervalsCount, 1) - 1)
        : undefined;
    const time = start ? `${start.TimeFrom} - ${(end ?? start).TimeTo}` : null;
    // DULMS DayWeek is 1-based starting at Sunday (1 = الأحد), while DAYS starts at السبت.
    const day = row.DayWeek ? (DAYS[row.DayWeek % 7] ?? null) : null;
    items.push({
      kind: "schedule",
      externalKey:
        `schedule-${row.Code}-${row.DayWeek}-${row.IntervalId}-${row.NameEn ?? ""}`.toLowerCase(),
      course: courseLabel(row.Code, row.Name),
      title: [day, time, sessionKindLabel(row.NameEn)].filter(Boolean).join(" • "),
      dueAt: null,
      status: row.ClassRoomName,
      score: null,
      extra: {
        النوع: sessionKindLabel(row.NameEn),
        ...(row.Staff ? { [staffRoleLabel(row.NameEn)]: row.Staff } : {}),
        ...(row.GroupName ? { المجموعة: row.GroupName } : {}),
      },
    });
  }

  const attendanceByCourse = new Map<
    string,
    {
      label: string;
      total: number;
      absent: number;
      present: number;
      pending: number;
      ratio: string | null;
    }
  >();
  for (const row of absences) {
    const label = courseLabel(row.Code, row.Name);
    const key = String(row.CourseId ?? row.Code ?? label);
    const bucket = attendanceByCourse.get(key) ?? {
      label: label ?? "مادة",
      total: 0,
      absent: 0,
      present: 0,
      pending: 0,
      ratio: null,
    };
    bucket.total += 1;
    if (row.IsAbsent === true) bucket.absent += 1;
    else if (row.IsAbsent === false) bucket.present += 1;
    else bucket.pending += 1;
    bucket.ratio = row.AbsentRatio?.trim() || bucket.ratio;
    attendanceByCourse.set(key, bucket);

    const state = row.IsAbsent === true ? "غياب" : row.IsAbsent === false ? "حضور" : "لم يُرصد بعد";
    items.push({
      kind: "absence",
      externalKey: `absence-${row.LectureId}`,
      course: label,
      title: `${row.LectureWeek ?? ""} — ${sessionKindLabel(row.NameEn_distribution)}`.trim(),
      dueAt: null,
      status: [state, row.LectureDate].filter(Boolean).join(" • "),
      score: row.AbsentRatio?.trim() || null,
      extra: {
        النوع: sessionKindLabel(row.NameEn_distribution),
        ...(row.HolidayName ? { أجازة: row.HolidayName } : {}),
        ...(row.LastUpdateFrom ? { "مصدر الرصد": row.LastUpdateFrom } : {}),
      },
    });
  }

  for (const [key, bucket] of attendanceByCourse) {
    items.push({
      kind: "attendance",
      externalKey: `attendance-${key}`.toLowerCase(),
      course: bucket.label,
      title: "سجل حضور المحاضرات",
      dueAt: null,
      status:
        bucket.absent > 0
          ? `غياب ${bucket.absent} من ${bucket.total} محاضرة`
          : bucket.present > 0
            ? "لا يوجد غياب حتى الآن"
            : "لم يُرصد الحضور بعد",
      score: `${bucket.present} / ${bucket.total}`,
      extra: {
        "محاضرات مرصودة حضور": String(bucket.present),
        "محاضرات غياب": String(bucket.absent),
        ...(bucket.pending ? { "لم تُرصد بعد": String(bucket.pending) } : {}),
        ...(bucket.ratio ? { التفاصيل: bucket.ratio } : {}),
      },
    });
  }

  for (const row of notices) {
    if (!row.NotifyExplain) continue;
    items.push({
      kind: "notice",
      externalKey: `notice-${row.NotificationId}`,
      course: null,
      title: row.NotifyExplain,
      dueAt: toIso(row.NotifyDate),
      status: row.FromUserName,
      score: null,
      extra: { ...(row.PageUrl ? { الصفحة: row.PageUrl } : {}) },
    });
  }

  items.push(...(await readExtras(jar)));
  // باب التسجيل: حالة النافذة + كل مادة متاحة للتسجيل الآن.
  items.push(
    ...(await readRegistration(jar).catch((cause) => {
      console.error("[scrape] registration failed", cause);
      return [];
    })),
  );

  // تجربة محدودة: قسم الامتحانات مُعاد لحسابات البيتا فقط.

  if (examBeta) items.push(...(await readExams(jar)));

  const byKey = new Map<string, ScrapedItem>();
  for (const item of items) {
    const allowed = examBeta && item.kind === "exam";
    if (!allowed && REMOVED_KINDS.has(item.kind)) continue;

    byKey.set(`${item.kind}:${item.externalKey}`, {
      ...item,
      title: item.title.slice(0, 300),
      externalKey: item.externalKey.slice(0, 200),
    });
  }

  const profile = await readProfile(jar, dulmsId, landing.html, cachedPhoto ?? null);
  return { items: [...byKey.values()], profile };
}
