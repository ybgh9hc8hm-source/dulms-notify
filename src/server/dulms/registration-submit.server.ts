import { BASE, type Jar } from "./http";
import { requestPause } from "./browser-profile";

export interface RegistrationResponse {
  resultType: string;
  message: string;
  output: string | null;
  success: boolean;
  captchaRejected: boolean;
}

/** DULMS reports CAPTCHA rejection as human-readable text, not a stable code. */
export function isCaptchaRejection(message: string): boolean {
  return /captcha|كابتشا|رمز\s*(?:التحقق|التأكيد)|verification\s*code/i.test(message);
}

async function sessionFetch(jar: Jar, path: string): Promise<Response> {
  await requestPause();
  const response = await fetch(new URL(path, BASE), {
    method: "GET",
    redirect: "manual",
    headers: {
      ...jar.clientHeaders(),
      cookie: jar.header(),
      "x-requested-with": "XMLHttpRequest",
      accept: "application/json, image/*, */*; q=0.01",
    },
  });
  jar.absorb(response);
  const location = response.headers.get("location") ?? "";
  if (response.status >= 300 && response.status < 400 && /login\.aspx/i.test(location)) {
    throw new Error("DULMS session expired. Please try again.");
  }
  if (!response.ok) throw new Error(`DULMS returned ${response.status}.`);
  return response;
}

export async function readRegistrationCaptcha(jar: Jar): Promise<string> {
  const response = await sessionFetch(jar, `/Captcha?${Date.now()}`);
  const type = response.headers.get("content-type") ?? "image/png";
  if (!type.startsWith("image/")) throw new Error("DULMS did not return a CAPTCHA image.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 50 || bytes.length > 1_000_000) throw new Error("Invalid CAPTCHA image.");
  return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
}

export async function submitCourseRegistration(
  jar: Jar,
  input: {
    courseId: string;
    groupId: string;
    subgroupId: string;
    captcha: string;
  },
): Promise<RegistrationResponse> {
  const query = new URLSearchParams({
    CourseId: input.courseId,
    GroupId: input.groupId || "-1",
    SubGroupId: input.subgroupId || "-1",
    WarningSkip: "false",
    Captcha: input.captcha,
  });
  return readResult(
    await sessionFetch(jar, `/Registered/RegisterStudentCourse?${query}`),
    "DULMS rejected the registration request.",
  );
}

/**
 * Drops an already-registered course.
 *
 * The portal's own registration page calls
 * `GET /Registered/CancelCourseRegisteration?CourseId=<id>` with no CAPTCHA and
 * answers with the same ResultType/ResultMessage envelope as registering.
 */
export async function cancelCourseRegistration(
  jar: Jar,
  courseId: string,
): Promise<RegistrationResponse> {
  const query = new URLSearchParams({ CourseId: courseId });
  return readResult(
    await sessionFetch(jar, `/Registered/CancelCourseRegisteration?${query}`),
    "DULMS rejected the cancellation request.",
  );
}

async function readResult(
  response: Response,
  fallbackMessage: string,
): Promise<RegistrationResponse> {
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!payload) throw new Error("DULMS returned an unreadable registration response.");
  const resultType = String(payload["ResultType"] ?? "Error");
  const message = String(payload["ResultMessage"] ?? fallbackMessage);
  return {
    resultType,
    message,
    output: payload["ResultOutputList"] == null ? null : String(payload["ResultOutputList"]),
    success: resultType.toLowerCase() === "success",
    captchaRejected: isCaptchaRejection(message),
  };
}
