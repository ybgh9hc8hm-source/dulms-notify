/**
 * Launches an online exam attempt on DULMS from inside DULMS Notify.
 *
 * The portal's own flow is: `GET /Quizzes/StartStudentAttempt?QuizId=<id>` →
 * `{ ResultType: 'Success', ResultOutput: <attemptId> }` → navigate to
 * `/Quizzes/QuizStart?id=<attemptId>`. Timing is enforced server-side by DULMS,
 * so before the appointment it answers `KnownError`; we pass that message back
 * verbatim instead of pretending it worked.
 *
 * We create the attempt with the student's cached portal session, then hand the
 * student the direct `QuizStart` link. Server-only module.
 */
import { BASE, Jar } from "./http";
import { dropSession, getDulmsSession } from "./session";

export const DULMS_ORIGIN = BASE;

interface StartResponse {
  ResultType?: string;
  ResultMessage?: string | null;
  ResultOutput?: number | string | null;
}

export interface ExamOpenResult {
  ok: boolean;
  /** Direct `QuizStart` URL when the attempt was created. */
  url: string | null;
  /** Fallback page that always works: the exam's attempts screen. */
  fallbackUrl: string;
  message: string | null;
}

async function callStart(jar: Jar, quizId: number): Promise<StartResponse | null> {
  const url = new URL(`/Quizzes/StartStudentAttempt?QuizId=${quizId}`, BASE).toString();
  const res = await fetch(url, {
    headers: {
      ...jar.clientHeaders(),
      cookie: jar.header(),
      "x-requested-with": "XMLHttpRequest",
      accept: "application/json, text/javascript, */*; q=0.01",
    },
    redirect: "manual",
  });
  const text = await res.text();
  if (!text.trim().startsWith("{")) return null; // session died → HTML/redirect
  return JSON.parse(text) as StartResponse;
}

export async function openExamAttempt(
  dulmsId: string,
  password: string,
  quizId: number,
): Promise<ExamOpenResult> {
  const fallbackUrl = new URL(`/Quizzes/QuizAttempts?id=${quizId}`, BASE).toString();

  let session = await getDulmsSession(dulmsId, password);
  let response = await callStart(session.jar, quizId);
  if (response === null) {
    // Cookies were rejected: sign in once and retry.
    await dropSession(dulmsId);
    session = await getDulmsSession(dulmsId, password, true);
    response = await callStart(session.jar, quizId);
  }

  if (response === null) {
    return { ok: false, url: null, fallbackUrl, message: "تعذّر الاتصال بـ DULMS، حاول مرة أخرى." };
  }

  if (response.ResultType === "Success" && response.ResultOutput) {
    return {
      ok: true,
      url: new URL(`/Quizzes/QuizStart?id=${response.ResultOutput}`, BASE).toString(),
      fallbackUrl,
      message: null,
    };
  }

  const raw = (response.ResultMessage ?? "").trim();
  const tooEarly = /before it|after the end|appointment/i.test(raw);
  return {
    ok: false,
    url: null,
    fallbackUrl,
    message: tooEarly
      ? "DULMS لا يسمح ببدء المحاولة إلا في ميعاد الامتحان بالضبط. سنفتح لك المحاولة تلقائيًا بمجرد بدء الميعاد."
      : raw || "تعذّر بدء المحاولة الآن.",
  };
}
