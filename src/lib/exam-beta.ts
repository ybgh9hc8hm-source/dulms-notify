/**
 * Beta gate for the DULMS "Exams" section.
 *
 * The exam category was retired for everyone; it is being brought back as a
 * trial for a single account first. Shared between server (scrape + open) and
 * client (dashboard category), so it lives in a client-safe module.
 */
const EXAM_BETA_DULMS_IDS: ReadonlySet<string> = new Set(["42510975"]);

export function hasExamBeta(dulmsId: string | null | undefined): boolean {
  return Boolean(dulmsId && EXAM_BETA_DULMS_IDS.has(dulmsId.trim()));
}
