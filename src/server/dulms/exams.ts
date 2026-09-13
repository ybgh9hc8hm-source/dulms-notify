/**
 * Online exams (`/ExamQuiz/GetStudentExams`).
 *
 * Same row shape as quizzes, but a different section in the portal: these are
 * the graded final/midterm exams with a hard appointment window. DULMS refuses
 * `StartStudentAttempt` outside that window, so the value we add is surfacing
 * the exam early with an in-app launch button that works the moment the window
 * opens.
 */
import { api, Jar } from "./http";
import { courseLabel, gradeText, num, str, toIso } from "./parse";
import type { Row, ScrapedItem } from "./types";

export async function readExams(jar: Jar): Promise<ScrapedItem[]> {
  const rows = await api<Row>(jar, "/ExamQuiz/GetStudentExams", "POST").catch(() => [] as Row[]);
  const items: ScrapedItem[] = [];

  for (const row of rows) {
    const quizId = num(row["Quiz_Id"]);
    const name = str(row["QuizName"]);
    if (!quizId || !name) continue;

    const start = str(row["StartDate"]);
    const end = str(row["EndDate"]);
    const ended = row["IsEnded"] === 1 || row["IsEnded"] === true;
    const started = row["IsStarted"] === 1 || row["IsStarted"] === true;

    items.push({
      kind: "exam",
      externalKey: `exam-${quizId}`,
      course: courseLabel(str(row["Code"]), str(row["Name"])),
      title: name,
      dueAt: toIso(start ?? end),
      status: ended ? "انتهى الامتحان" : started ? "الامتحان جارٍ الآن" : "لم يبدأ بعد",
      score: gradeText(row["Grade"], row["MaxGrade"]),
      extra: {
        _quizId: String(quizId),
        ...(start ? { يبدأ: start } : {}),
        ...(end ? { ينتهي: end } : {}),
        ...(str(row["TimeLimit"]) && num(row["TimeLimit"])! > 0
          ? { "مدة الامتحان": `${str(row["TimeLimit"])} ${str(row["TimeType"]) ?? ""}`.trim() }
          : {}),
        ...(num(row["AttemptsNo"]) !== null ? { محاولات: String(num(row["AttemptsNo"])) } : {}),
      },
    });
  }

  return items;
}
