import { describe, expect, it } from "vitest";

import { isCaptchaRejection } from "./registration-submit.server";

describe("isCaptchaRejection", () => {
  it.each([
    "Invalid Captcha, Please try again",
    "Invalid verification code",
    "رمز التحقق غير صحيح",
    "كابتشا غير صحيحة",
  ])("recognizes a retryable CAPTCHA response: %s", (message) => {
    expect(isCaptchaRejection(message)).toBe(true);
  });

  it.each([
    "No seats available",
    "Registration period has ended",
    "Prerequisite course is required",
  ])("does not retry a final portal response: %s", (message) => {
    expect(isCaptchaRejection(message)).toBe(false);
  });
});
