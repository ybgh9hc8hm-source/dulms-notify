/** Remaining DULMS sections: announcements, events, gradebook, warnings. */
import { api, apiObj, Jar } from "./http";
import {
  arrayOf,
  courseLabel,
  generic,
  gradeText,
  join,
  num,
  push,
  str,
  toIso,
  toIsoLoose,
} from "./parse";
import type { ItemKind, Row, ScrapedItem } from "./types";

export async function readExtras(jar: Jar): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];

  const [announcement, todayEvents, gradebook, warnings, finalResult] = await Promise.all([
    apiObj(jar, "/Announcement/GetAnnouncement"),
    apiObj(jar, "/Announcement/GetTodayEvents"),
    api<Row>(jar, "/GradeBook/StudentAssignmentsAndQuizes", "POST"),
    api<Row>(jar, "/SemesterWorks/Report_StudentWarnings", "POST"),
    api<Row>(jar, "/FinalResult/StudentResult", "POST").catch(() => [] as Row[]),
  ]);

  items.push(...finalResultItems(finalResult));

  /* ---- إعلانات وأحداث ---- */
  for (const row of arrayOf(announcement, "AnnList")) {
    push(items, {
      kind: "announcement",
      externalKey: `announcement-${str(row["AnnouncementId"]) ?? str(row["Id"]) ?? str(row["Title"])}`,
      course: null,
      title: str(row["Title"]) ?? str(row["AnnouncementText"]) ?? "إعلان جديد",
      dueAt: toIsoLoose(row["AnnouncementDate"] ?? row["CreationDate"]),
      status: str(row["FromUserName"]),
      score: null,
      extra: {},
    });
  }
  for (const row of arrayOf(todayEvents, "Item1")) {
    push(items, {
      kind: "event",
      externalKey: `event-${str(row["EventsId"])}`,
      course: null,
      title: str(row["EventsTitle"]) ?? "حدث في التقويم",
      dueAt: toIsoLoose(row["EventStartDate"]),
      status: join(str(row["EventsTypeName"]), str(row["EventsText"])),
      score: null,
      extra: {
        ...(str(row["EventEndDate"]) ? { ينتهي: str(row["EventEndDate"])! } : {}),
      },
    });
  }
  items.push(...generic("warning", "warning", warnings));
  /* ---- دفتر الدرجات (أعمال السنة) ---- */
  const TYPE_AR: Record<string, string> = { Quiz: "كويز", Assignment: "تكليف", Exam: "امتحان" };
  for (const group of gradebook) {
    const label = courseLabel(str(group["Code"]), str(group["CourseName"]));
    const rows = arrayOf(group, "Data").filter(
      (row) => str(row["QuizOrAssignId"]) && str(row["QuizOrAssignName"]),
    );

    let totalMax = 0;
    let totalGrade = 0;
    let gradedCount = 0;

    for (const row of rows) {
      const grade = str(row["StudentGrade"]);
      const max = str(row["MaxGrade"]);
      const maxNum = num(max);
      const gradeNum = num(grade);
      if (maxNum !== null) totalMax += maxNum;
      if (gradeNum !== null) {
        totalGrade += gradeNum;
        gradedCount += 1;
      }
      const endIso = toIsoLoose(row["EndDate"]);
      const ended = endIso ? new Date(endIso).getTime() < Date.now() : false;
      const state =
        str(row["StudentStatus"]) ??
        (gradeNum !== null ? "تم الرصد" : ended ? "بانتظار الرصد" : "لم تُرصد بعد");
      push(items, {
        kind: "gradebook",
        externalKey:
          `gradebook-${str(row["TypeId"]) ?? ""}-${str(row["QuizOrAssignId"])}`.toLowerCase(),
        course: label,
        title: str(row["QuizOrAssignName"])!,
        dueAt: endIso,
        status: join(TYPE_AR[str(row["Type"]) ?? ""] ?? str(row["Type"]), state),
        score: max ? `${grade || "—"} / ${max}` : grade,
        extra: {
          ...(max ? { "درجة العنصر": `من ${max}` } : {}),
          ...(str(row["studentPercent"]) ? { النسبة: `${str(row["studentPercent"])}%` } : {}),
          ...(str(row["GradeToPass"]) ? { "درجة النجاح": str(row["GradeToPass"])! } : {}),
          ...(/^\d+$/.test(str(row["AttemptsNo"]) ?? "")
            ? { المحاولات: str(row["AttemptsNo"])! }
            : {}),
        },
      });
    }

    // بطاقة ملخص لكل مادة مسجَّلة — تظهر حتى لو لم تُضف أعمال سنة بعد.
    push(items, {
      kind: "gradebook",
      externalKey:
        `gradebook-course-${str(group["CourseId"]) ?? str(group["Code"]) ?? label}`.toLowerCase(),
      course: label,
      title: "إجمالي أعمال السنة",
      dueAt: null,
      status:
        rows.length === 0
          ? "لم تُضف أعمال سنة لهذه المادة بعد"
          : join(
              `${rows.length} عنصر`,
              gradedCount === 0
                ? "لم تُرصد أي درجة بعد"
                : gradedCount < rows.length
                  ? `تم رصد ${gradedCount} من ${rows.length}`
                  : "تم رصد كل الدرجات",
            ),
      score: totalMax > 0 ? `${gradedCount > 0 ? totalGrade : "—"} / ${totalMax}` : null,
      extra: {
        ...(totalMax > 0 ? { "المجموع الكلي": `من ${totalMax} درجة` } : {}),
        ...(rows.length
          ? {
              الكويزات: String(rows.filter((r) => str(r["Type"]) === "Quiz").length),
              التكاليف: String(rows.filter((r) => str(r["Type"]) === "Assignment").length),
            }
          : {}),
      },
    });
  }

  return items;
}

/* ---- النتيجة النهائية (FinalResult/StudentResult) ---- */

/** Human wording for a final letter grade. */
function resultState(grade: string | null): string {
  const value = (grade ?? "").trim().toUpperCase();
  if (value === "F" || value === "FAIL") return "راسب";
  if (value === "W") return "منسحب";
  if (value === "I") return "مؤجّل";
  if (!value) return "لم تُعلَن بعد";
  return "ناجح";
}

/** Maps the published semester result into per-course items + one summary. */
export function finalResultItems(rows: Row[]): ScrapedItem[] {
  const items: ScrapedItem[] = [];
  if (rows.length === 0) return items;

  // DULMS answers with a single sentinel row when the result is withheld.
  const first = rows[0]!;
  const semester = str(first["Semester"]) ?? "الفصل الحالي";
  if (str(first["Code"]) === "-1") {
    push(items, {
      kind: "finalResult",
      externalKey: `finalresult-blocked-${semester}`.toLowerCase(),
      course: null,
      title: `النتيجة النهائية — ${semester}`,
      dueAt: null,
      status: "النتيجة محجوبة",
      score: null,
      extra: { السبب: str(first["Name"]) ?? "غير مذكور" },
    });
    return items;
  }

  for (const row of rows) {
    const code = str(row["Code"]);
    const name = str(row["Name"]);
    if (!code && !name) continue;
    const grade = str(row["Grade"]);
    push(items, {
      kind: "finalResult",
      externalKey: `finalresult-${semester}-${code ?? name}`.toLowerCase(),
      course: courseLabel(code, name),
      title: name ?? code!,
      dueAt: null,
      status: join(resultState(grade), str(row["Grade2"])),
      score: grade,
      extra: { الفصل: semester },
    });
  }

  const sgpa = str(first["SGPA"]);
  const cgpa = str(first["CGPA"]);
  push(items, {
    kind: "finalResult",
    externalKey: `finalresult-summary-${semester}`.toLowerCase(),
    course: null,
    title: `ملخص النتيجة — ${semester}`,
    dueAt: null,
    status: join(
      `${rows.length} مادة`,
      sgpa ? `معدل الفصل ${sgpa} / 4` : null,
      cgpa ? `التراكمي ${cgpa} / 4` : null,
      str(first["SGPAGrade"]),
    ),
    score: null,
    extra: {
      ...(sgpa ? { "معدل الفصل SGPA": `${sgpa} / 4` } : {}),
      ...(cgpa ? { "المعدل التراكمي CGPA": `${cgpa} / 4` } : {}),
      ...(str(first["CGPAGrade"]) ? { التقدير: str(first["CGPAGrade"])! } : {}),
    },
  });

  return items;
}
