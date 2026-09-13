import { decryptSecret } from "./crypto.server";
import { DulmsAuthError } from "./dulms.server";

const RELOGIN_REQUIRED_MESSAGE =
  "تعذّر قراءة بياناتك المحفوظة — سجّل الدخول مرة أخرى بكود الطالب وكلمة المرور لتحديثها";

/**
 * Reads a stored DULMS password. When the ciphertext can't be decrypted (the
 * encryption key was rotated), it's reported as an auth error so the student
 * sees the "sign in again" banner instead of a generic failure.
 */
export function readAccountPassword(ciphertext: string, keyVersion?: number | null): string {
  try {
    return decryptSecret(ciphertext, keyVersion);
  } catch {
    throw new DulmsAuthError(RELOGIN_REQUIRED_MESSAGE);
  }
}
