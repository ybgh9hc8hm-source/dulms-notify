/**
 * GPA engine for Delta University's credit-hour system.
 *
 * The letter → points table was verified twice:
 *  1. Against the published Delta University scale (A 4.0 … F 0, ±0.3 steps).
 *  2. Against real DULMS results for a live account:
 *     - Spring (C, C+, B, C- with equal hours) → SGPA 2.25   ✓
 *     - Summer (B-, B-, A+, A+ / 2,3,2,2 hours) → SGPA 3.278 ✓
 *
 * The scale is university-wide (it comes from the credit-hour bylaw, not from a
 * single faculty), so the same math applies to every faculty on DULMS.
 */

export interface GradeDef {
  letter: string;
  points: number;
  en: string;
  ar: string;
}

/** Ordered from best to worst — the order the UI shows and searches in. */
export const GRADE_SCALE: GradeDef[] = [
  { letter: "A+", points: 4.0, en: "Excellent", ar: "ممتاز" },
  { letter: "A", points: 4.0, en: "Excellent", ar: "ممتاز" },
  { letter: "A-", points: 3.7, en: "Excellent", ar: "ممتاز" },
  { letter: "B+", points: 3.3, en: "Very good", ar: "جيد جدًا" },
  { letter: "B", points: 3.0, en: "Very good", ar: "جيد جدًا" },
  { letter: "B-", points: 2.7, en: "Very good", ar: "جيد جدًا" },
  { letter: "C+", points: 2.3, en: "Good", ar: "جيد" },
  { letter: "C", points: 2.0, en: "Good", ar: "جيد" },
  { letter: "C-", points: 1.7, en: "Pass", ar: "مقبول" },
  { letter: "D+", points: 1.3, en: "Pass", ar: "مقبول" },
  { letter: "D", points: 1.0, en: "Pass", ar: "مقبول" },
  { letter: "D-", points: 0.7, en: "Weak pass", ar: "مقبول بحد أدنى" },
  { letter: "F", points: 0, en: "Fail", ar: "راسب" },
];

export const MAX_POINTS = 4.0;

/** Points for a letter grade, or null when the letter is unknown (W, I, …). */
export function gradePoints(letter: string | null | undefined): number | null {
  const key = (letter ?? "").trim().toUpperCase();
  return GRADE_SCALE.find((g) => g.letter === key)?.points ?? null;
}

/** Cumulative-average band used by the university for the overall standing. */
export function gpaBand(gpa: number): { key: string; en: string; ar: string } {
  if (gpa >= 3.4) return { key: "excellent", en: "Excellent", ar: "ممتاز" };
  if (gpa >= 2.8) return { key: "veryGood", en: "Very good", ar: "جيد جدًا" };
  if (gpa >= 2.0) return { key: "good", en: "Good", ar: "جيد" };
  if (gpa >= 1.0) return { key: "pass", en: "Pass (at risk)", ar: "مقبول (تحت الملاحظة)" };
  return { key: "probation", en: "Academic probation", ar: "إنذار أكاديمي" };
}

export interface PlannedCourse {
  id: string;
  name: string;
  hours: number;
  /** Empty string = "not decided yet"; such a course is ignored in the math. */
  letter: string;
}

export interface Simulation {
  /** Hours that actually carry a chosen grade. */
  hours: number;
  /** Quality points earned by the planned courses. */
  points: number;
  /** Semester average for the planned courses (null when nothing is graded). */
  sgpa: number | null;
  /** Cumulative average after this semester. */
  cgpa: number | null;
  /** Difference vs. the current cumulative average. */
  delta: number | null;
}

/** Runs the planned semester against the current record. */
export function simulate(
  courses: readonly PlannedCourse[],
  currentCgpa: number | null,
  currentHours: number | null,
): Simulation {
  let hours = 0;
  let points = 0;
  for (const course of courses) {
    const value = gradePoints(course.letter);
    if (value === null || !Number.isFinite(course.hours) || course.hours <= 0) continue;
    hours += course.hours;
    points += course.hours * value;
  }
  const sgpa = hours > 0 ? points / hours : null;
  const base = currentCgpa ?? null;
  const baseHours = currentHours ?? 0;
  const totalHours = baseHours + hours;
  const cgpa =
    base !== null && totalHours > 0 ? (base * baseHours + points) / totalHours : (sgpa ?? null);
  return {
    hours,
    points,
    sgpa,
    cgpa,
    delta: cgpa !== null && base !== null ? cgpa - base : null,
  };
}

export interface TargetPlan {
  /** Semester average required to hit the target. */
  requiredSgpa: number;
  /** Reachable within the 4.0 ceiling? */
  possible: boolean;
  /** Best cumulative average reachable with those hours (all A+). */
  bestCgpa: number;
  /** Lowest letter grade that, taken in every course, still hits the target. */
  requiredGrade: GradeDef | null;
  /** True when the target is already met without studying anything new. */
  alreadyReached: boolean;
}

/**
 * Answers "what do I need next semester?".
 *
 * required = (target × (base + new) − current × base) / new
 */
export function planForTarget(
  targetCgpa: number,
  plannedHours: number,
  currentCgpa: number | null,
  currentHours: number | null,
): TargetPlan | null {
  if (!Number.isFinite(targetCgpa) || !Number.isFinite(plannedHours) || plannedHours <= 0) {
    return null;
  }
  const base = currentCgpa ?? 0;
  const baseHours = currentCgpa === null ? 0 : (currentHours ?? 0);
  const requiredSgpa = (targetCgpa * (baseHours + plannedHours) - base * baseHours) / plannedHours;
  const bestCgpa = (base * baseHours + MAX_POINTS * plannedHours) / (baseHours + plannedHours);
  const requiredGrade =
    [...GRADE_SCALE].reverse().find((g) => g.points >= requiredSgpa - 1e-9) ?? null;
  return {
    requiredSgpa,
    possible: requiredSgpa <= MAX_POINTS + 1e-9,
    bestCgpa,
    requiredGrade,
    alreadyReached: requiredSgpa <= 0,
  };
}

/** How many extra credit hours at `grade` are needed to reach `target`. */
export function hoursToTarget(
  targetCgpa: number,
  grade: number,
  currentCgpa: number | null,
  currentHours: number | null,
): number | null {
  const base = currentCgpa;
  const baseHours = currentHours ?? 0;
  if (base === null || baseHours <= 0) return null;
  if (base >= targetCgpa) return 0;
  if (grade <= targetCgpa) return null; // never converges
  return Math.ceil((baseHours * (targetCgpa - base)) / (grade - targetCgpa));
}

/** Rounds like the portal does (three decimals, no trailing noise). */
export function fmtGpa(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return (Math.round(value * 1000) / 1000).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}
