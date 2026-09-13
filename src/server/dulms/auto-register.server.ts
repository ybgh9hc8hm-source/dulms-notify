/**
 * Fully automatic course registration.
 *
 * When a watched group opens, this agent logs into DULMS, asks the vision
 * agent to read the CAPTCHA, and submits the registration. A wrong CAPTCHA is
 * cheap to retry, so it walks a few attempts with a fresh image each time.
 */
import type { RegistrationOption } from "./registration";

const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 750;

export type AutoRegisterOutcome = {
  success: boolean;
  message: string;
  attempts: number;
  captchaFailed: boolean;
};

function retryDelay(attempt: number): Promise<void> {
  const delay = Math.min(RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1), 6_000);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/** Returns a logged-in DULMS cookie jar for the student behind `userId`. */
async function sessionForUser(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: account } = await supabaseAdmin
    .from("dulms_accounts")
    .select("dulms_id, password_ciphertext, key_version")
    .eq("user_id", userId)
    .maybeSingle();
  if (!account) throw new Error("DULMS account is not connected.");
  const { ensureKeyring } = await import("@/server/crypto.server");
  const { readAccountPassword } = await import("@/server/credentials.server");
  const { getDulmsSession } = await import("./session");
  await ensureKeyring();
  const session = await getDulmsSession(
    account.dulms_id,
    readAccountPassword(account.password_ciphertext, account.key_version),
  );
  return session.jar;
}

export async function autoRegisterCourse(
  userId: string,
  option: Pick<RegistrationOption, "courseId" | "groupId" | "subgroupId">,
): Promise<AutoRegisterOutcome> {
  const { readRegistrationCaptcha, submitCourseRegistration } =
    await import("./registration-submit.server");
  const { solveCaptcha } = await import("@/server/support/vision.server");

  let jar;
  try {
    jar = await sessionForUser(userId);
  } catch (cause) {
    return {
      success: false,
      attempts: 0,
      captchaFailed: false,
      message: cause instanceof Error ? cause.message : "Could not open a DULMS session.",
    };
  }

  let lastMessage = "Automatic registration did not run.";
  let captchaFailed = false;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const image = await readRegistrationCaptcha(jar);
      const solved = await solveCaptcha(image);
      if (!solved.ok) {
        captchaFailed = true;
        lastMessage = solved.error;
        if (attempt < MAX_ATTEMPTS) await retryDelay(attempt);
        continue;
      }
      const result = await submitCourseRegistration(jar, {
        courseId: option.courseId,
        groupId: option.groupId,
        subgroupId: option.subgroupId,
        captcha: solved.text,
      });
      lastMessage = result.message;
      if (result.success) {
        return { success: true, message: result.message, attempts: attempt, captchaFailed: false };
      }
      // Only a CAPTCHA miss is worth another attempt; portal rules are final.
      if (!result.captchaRejected) {
        return { success: false, message: result.message, attempts: attempt, captchaFailed: false };
      }
      captchaFailed = true;
      if (attempt < MAX_ATTEMPTS) await retryDelay(attempt);
    } catch (cause) {
      lastMessage = cause instanceof Error ? cause.message : String(cause);
      if (/session expired|not connected|sign in|سجّل الدخول/i.test(lastMessage)) {
        return { success: false, message: lastMessage, attempts: attempt, captchaFailed: false };
      }
      if (attempt < MAX_ATTEMPTS) await retryDelay(attempt);
    }
  }

  return { success: false, message: lastMessage, attempts: MAX_ATTEMPTS, captchaFailed };
}
