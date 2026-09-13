/**
 * Deterministic CGPA maths for the support assistant.
 *
 * The portal exposes CGPA and passed hours but never the letter-grade point
 * table, so the assistant used to refuse any "what if I score X" question.
 * We keep the standard Delta four-point table here as the default and let the
 * student override any letter with their own bylaw values.
 */

/** Default 4.0 letter scale (Delta University credit-hour bylaw). */
export const DEFAULT_GRADE_POINTS: Readonly<Record<string, number>> = {
  "A+": 4.0,
  A: 4.0,
  "A-": 3.7,
  "B+": 3.3,
  B: 3.0,
  "B-": 2.7,
  "C+": 2.3,
  C: 2.0,
  "C-": 1.7,
  "D+": 1.3,
  D: 1.0,
  F: 0.0,
};

export type GradeScale = Record<string, number>;

export function normalizeGrade(grade: string): string {
  return grade.trim().toUpperCase().replace(/\s+/g, "");
}

export function gradePoints(
  grade: string,
  scale: GradeScale = DEFAULT_GRADE_POINTS,
): number | null {
  const key = normalizeGrade(grade);
  const direct = scale[key];
  if (typeof direct === "number") return direct;
  const numeric = Number(key);
  return Number.isFinite(numeric) ? numeric : null;
}

export interface PlannedCourse {
  /** Course label, only used in the explanation. */
  readonly name?: string | null;
  readonly hours: number;
  /** Letter grade ("A-") or a raw point value ("3.7"). */
  readonly grade: string;
}

export interface CgpaScenario {
  readonly currentCgpa: number;
  readonly currentHours: number;
  readonly courses: readonly PlannedCourse[];
  readonly scale?: GradeScale | undefined;
}

export interface CgpaResult {
  readonly newCgpa: number;
  readonly newHours: number;
  readonly termGpa: number | null;
  readonly lines: readonly string[];
  readonly unknownGrades: readonly string[];
}

export function projectCgpa(scenario: CgpaScenario): CgpaResult {
  const scale = { ...DEFAULT_GRADE_POINTS, ...(scenario.scale ?? {}) };
  const lines: string[] = [];
  const unknown: string[] = [];
  let addedPoints = 0;
  let addedHours = 0;

  for (const course of scenario.courses) {
    const points = gradePoints(course.grade, scale);
    if (points === null) {
      unknown.push(course.grade);
      continue;
    }
    addedPoints += points * course.hours;
    addedHours += course.hours;
    lines.push(
      `${course.name ?? "مقرر"}: ${course.hours} ساعة × ${points} = ${(points * course.hours).toFixed(2)}`,
    );
  }

  const totalHours = scenario.currentHours + addedHours;
  const totalPoints = scenario.currentCgpa * scenario.currentHours + addedPoints;
  return {
    newCgpa: totalHours > 0 ? round2(totalPoints / totalHours) : 0,
    newHours: totalHours,
    termGpa: addedHours > 0 ? round2(addedPoints / addedHours) : null,
    lines,
    unknownGrades: unknown,
  };
}

/** Average points per hour needed over `hours` new hours to reach `targetCgpa`. */
export function requiredAverage(
  currentCgpa: number,
  currentHours: number,
  hours: number,
  targetCgpa: number,
): { readonly average: number; readonly reachable: boolean; readonly max: number } {
  const max = Math.max(...Object.values(DEFAULT_GRADE_POINTS));
  const needed = (targetCgpa * (currentHours + hours) - currentCgpa * currentHours) / hours;
  return { average: round2(needed), reachable: needed <= max, max };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Every distinct total reachable with the given letters, best and worst first. */
export function gradeCombinations(
  scenario: Omit<CgpaScenario, "courses"> & {
    readonly courses: readonly { readonly name?: string | null; readonly hours: number }[];
    readonly letters: readonly string[];
  },
  limit = 12,
): readonly { readonly grades: readonly string[]; readonly cgpa: number }[] {
  const scale = { ...DEFAULT_GRADE_POINTS, ...(scenario.scale ?? {}) };
  const letters = scenario.letters.filter((letter) => gradePoints(letter, scale) !== null);
  if (!letters.length || !scenario.courses.length) return [];
  // Cap the search space: uniform-then-mixed enumeration stays cheap.
  const maxCombos = 20_000;
  if (letters.length ** scenario.courses.length > maxCombos) {
    return letters
      .map((letter) => ({
        grades: scenario.courses.map(() => letter),
        cgpa: projectCgpa({
          ...scenario,
          courses: scenario.courses.map((course) => ({ ...course, grade: letter })),
        }).newCgpa,
      }))
      .sort((a, b) => b.cgpa - a.cgpa)
      .slice(0, limit);
  }

  const results: { grades: string[]; cgpa: number }[] = [];
  const walk = (index: number, picked: string[]) => {
    if (index === scenario.courses.length) {
      results.push({
        grades: [...picked],
        cgpa: projectCgpa({
          ...scenario,
          courses: scenario.courses.map((course, i) => ({ ...course, grade: picked[i]! })),
        }).newCgpa,
      });
      return;
    }
    for (const letter of letters) walk(index + 1, [...picked, letter]);
  };
  walk(0, []);
  results.sort((a, b) => b.cgpa - a.cgpa);
  return results.slice(0, limit);
}
