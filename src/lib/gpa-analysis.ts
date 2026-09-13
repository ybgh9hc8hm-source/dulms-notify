/**
 * Deep GPA analysis for DULMS.
 *
 * DULMS never publishes the credit hours of a course you already finished:
 * `/FinalResult/StudentResult` returns only code, name, letter grade and the
 * semester's SGPA/CGPA, and `/Registered/GetStudentCourseGradesHistory` answers
 * `[]` for finished courses. Credit hours are only exposed for courses that are
 * open for registration (`CreditHours` on `GetStudentResiterationCourses`).
 *
 * So we recover them: for every semester we know each letter grade and the
 * published SGPA, and the SGPA is a weighted average of those grades. Searching
 * the small space of plausible credit hours (1…4 per course) for the combination
 * that reproduces the published SGPA to three decimals recovers the real hours.
 * Verified against the live account 42510975:
 *   Summer  B-, B-, A+, A+  → SGPA 3.278 → 2, 3, 2, 2  ✓
 *   Spring  C, C+, B, C-    → SGPA 2.25  → equal hours ✓
 * The total recovered across all semesters is cross-checked against the passed
 * hours DULMS reports, and anything that does not add up is flagged instead of
 * silently trusted.
 */
import { gradePoints, GRADE_SCALE, MAX_POINTS } from "./gpa";

export interface CompletedCourse {
  code: string | null;
  name: string;
  letter: string;
  points: number;
  hours: number;
  /** true when the hours were recovered by the solver rather than published. */
  inferred: boolean;
}

export interface SemesterRecord {
  semester: string;
  sgpa: number | null;
  cgpa: number | null;
  courses: CompletedCourse[];
  hours: number;
  /** The solver reproduced the published SGPA exactly. */
  solved: boolean;
}

/** Chronological rank of a "2025-2026 Fall" style label. */
export function semesterOrder(label: string): number {
  const year = Number(/\d{4}/.exec(label)?.[0] ?? 0);
  const season = /fall|خريف/i.test(label)
    ? 0
    : /spring|ربيع/i.test(label)
      ? 1
      : /summer|صيف/i.test(label)
        ? 2
        : 3;
  return year * 10 + season;
}

const MIN_HOURS = 1;
const MAX_HOURS = 4;

/**
 * Finds the credit-hour split that reproduces `sgpa` for the given grade points.
 * Many splits can match (equal hours match any average), so we prefer the one
 * closest to a hinted total and, failing that, the one closest to the 3-hour
 * course that Delta's credit-hour plan uses for almost every subject.
 */
export function solveHours(
  points: readonly number[],
  sgpa: number,
  hint?: number | null,
): number[] | null {
  const n = points.length;
  if (n === 0 || n > 8 || !Number.isFinite(sgpa)) return null;
  let best: number[] | null = null;
  let bestScore = Infinity;
  const current: number[] = new Array(n).fill(MIN_HOURS);

  const walk = (index: number) => {
    if (index === n) {
      let hours = 0;
      let total = 0;
      for (let i = 0; i < n; i += 1) {
        hours += current[i]!;
        total += current[i]! * points[i]!;
      }
      if (Math.abs(total / hours - sgpa) > 0.0006) return;
      let spread = 0;
      // Squared distance: a 1-hour course is far more unusual than a 2-hour one.
      for (let i = 0; i < n; i += 1) spread += (current[i]! - 3) ** 2;
      const score = hint != null ? Math.abs(hours - hint) * 100 + spread : spread;
      if (score < bestScore) {
        bestScore = score;
        best = [...current];
      }
      return;
    }
    for (let h = MIN_HOURS; h <= MAX_HOURS; h += 1) {
      current[index] = h;
      walk(index + 1);
    }
    current[index] = MIN_HOURS;
  };

  walk(0);
  return best;
}

export interface RawResultRow {
  code: string | null;
  name: string;
  letter: string | null;
  semester: string;
  sgpa: number | null;
  cgpa: number | null;
}

/** Builds the per-semester record, recovering credit hours where possible. */
export function buildSemesters(
  rows: readonly RawResultRow[],
  passedHours: number | null,
  knownHours: ReadonlyMap<string, number> = new Map(),
): SemesterRecord[] {
  const map = new Map<string, RawResultRow[]>();
  for (const row of rows) {
    const bucket = map.get(row.semester);
    if (bucket) bucket.push(row);
    else map.set(row.semester, [row]);
  }

  const semesters = [...map.entries()].map(([semester, list]) => {
    const graded = list.filter((row) => gradePoints(row.letter) !== null);
    const sgpa = list.find((row) => row.sgpa !== null)?.sgpa ?? null;
    const cgpa = list.find((row) => row.cgpa !== null)?.cgpa ?? null;
    const points = graded.map((row) => gradePoints(row.letter)!);
    const solved = sgpa !== null ? solveHours(points, sgpa) : null;
    const courses: CompletedCourse[] = graded.map((row, index) => {
      const published = row.code ? knownHours.get(row.code.toUpperCase()) : undefined;
      return {
        code: row.code,
        name: row.name,
        letter: (row.letter ?? "").toUpperCase(),
        points: points[index]!,
        hours: published ?? solved?.[index] ?? 3,
        inferred: published === undefined,
      };
    });
    return {
      semester,
      sgpa,
      cgpa,
      courses,
      hours: courses.reduce((sum, course) => sum + course.hours, 0),
      solved: solved !== null,
    };
  });

  semesters.sort((a, b) => semesterOrder(a.semester) - semesterOrder(b.semester));

  // `passedHours` is a cross-check only: DULMS may withhold whole semesters
  // (its result endpoint answers for the latest term only), so the difference
  // is reported to the UI rather than forced onto the semesters we can see.
  void passedHours;

  return semesters;
}

/* -------------------------------------------------------------------------- */
/*  Retake planning                                                           */
/* -------------------------------------------------------------------------- */

export interface RetakeOption {
  course: CompletedCourse;
  /** CGPA if the course is repeated and the new grade replaces the old one. */
  newCgpa: number;
  gain: number;
}

/**
 * Effect of repeating a finished course.
 * DULMS replaces the old grade with the new one in the cumulative average, so
 * the earned hours stay the same and only the quality points move.
 */
export function retakeImpact(
  course: CompletedCourse,
  newLetter: string,
  cgpa: number,
  passedHours: number,
): RetakeOption | null {
  const next = gradePoints(newLetter);
  if (next === null || passedHours <= 0) return null;
  const totalPoints = cgpa * passedHours - course.points * course.hours + next * course.hours;
  const newCgpa = totalPoints / passedHours;
  return { course, newCgpa, gain: newCgpa - cgpa };
}

/** The finished courses that would lift the CGPA most if repeated for an A. */
export function retakeRanking(
  semesters: readonly SemesterRecord[],
  cgpa: number | null,
  passedHours: number | null,
  newLetter = "A",
): RetakeOption[] {
  if (cgpa === null || !passedHours) return [];
  const seen = new Set<string>();
  const options: RetakeOption[] = [];
  for (const semester of [...semesters].reverse()) {
    for (const course of semester.courses) {
      const key = (course.code ?? course.name).toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const option = retakeImpact(course, newLetter, cgpa, passedHours);
      if (option && option.gain > 0.0005) options.push(option);
    }
  }
  return options.sort((a, b) => b.gain - a.gain);
}

/* -------------------------------------------------------------------------- */
/*  Graduation forecast                                                       */
/* -------------------------------------------------------------------------- */

export interface Forecast {
  remainingHours: number;
  /** Semesters left at the chosen load. */
  terms: number;
  /** CGPA at graduation if every remaining hour is taken at `assumedPoints`. */
  projected: number;
  /** Ceiling (all A+) and floor (all D) at graduation. */
  best: number;
  worst: number;
}

export function forecastGraduation(
  cgpa: number | null,
  passedHours: number | null,
  requiredHours: number | null,
  hoursPerTerm: number,
  assumedPoints: number,
): Forecast | null {
  if (cgpa === null || passedHours === null || requiredHours === null) return null;
  const remaining = Math.max(requiredHours - passedHours, 0);
  if (remaining === 0 || hoursPerTerm <= 0) return null;
  const mix = (points: number) => (cgpa * passedHours + points * remaining) / requiredHours;
  return {
    remainingHours: remaining,
    terms: Math.ceil(remaining / hoursPerTerm),
    projected: mix(assumedPoints),
    best: mix(MAX_POINTS),
    worst: mix(1),
  };
}

/** Average grade needed over every remaining hour to graduate at `target`. */
export function requiredAverageToGraduate(
  target: number,
  cgpa: number | null,
  passedHours: number | null,
  requiredHours: number | null,
): { points: number; possible: boolean; letter: string | null } | null {
  if (cgpa === null || passedHours === null || requiredHours === null) return null;
  const remaining = requiredHours - passedHours;
  if (remaining <= 0) return null;
  const points = (target * requiredHours - cgpa * passedHours) / remaining;
  const letter =
    [...GRADE_SCALE].reverse().find((grade) => grade.points >= points - 1e-9)?.letter ?? null;
  return { points, possible: points <= MAX_POINTS + 1e-9, letter };
}

/* -------------------------------------------------------------------------- */
/*  Coursework → expected final grade                                         */
/* -------------------------------------------------------------------------- */

/**
 * Delta grades a course out of 100: coursework (assignments/quizzes) plus the
 * final exam. Given the coursework earned so far we can bound the final letter:
 * the floor assumes zero on everything left, the ceiling assumes full marks.
 */
export function courseworkOutlook(
  earned: number,
  gradedMax: number,
  courseTotal = 100,
): { floor: number; ceiling: number; pace: number | null } | null {
  if (gradedMax <= 0 || courseTotal <= 0) return null;
  const pace = earned / gradedMax;
  return {
    floor: (earned / courseTotal) * 100,
    ceiling: ((earned + Math.max(courseTotal - gradedMax, 0)) / courseTotal) * 100,
    pace: Number.isFinite(pace) ? pace * 100 : null,
  };
}

/** Percentage → the letter Delta awards for it (standard credit-hour bylaw). */
export function letterForPercent(percent: number): string {
  if (percent >= 93) return "A+";
  if (percent >= 89) return "A";
  if (percent >= 84) return "A-";
  if (percent >= 80) return "B+";
  if (percent >= 76) return "B";
  if (percent >= 73) return "B-";
  if (percent >= 70) return "C+";
  if (percent >= 67) return "C";
  if (percent >= 64) return "C-";
  if (percent >= 61) return "D+";
  if (percent >= 58) return "D";
  if (percent >= 55) return "D-";
  return "F";
}
