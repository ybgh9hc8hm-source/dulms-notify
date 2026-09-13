import { describe, expect, it } from "vitest";

import {
  buildSemesters,
  forecastGraduation,
  letterForPercent,
  requiredAverageToGraduate,
  retakeRanking,
  solveHours,
  type RawResultRow,
} from "./gpa-analysis";

/** Live rows for account 42510975 (2025-2026). */
const rows: RawResultRow[] = [
  {
    code: "BAS123",
    name: "Probability and Statistics",
    letter: "B-",
    semester: "2025-2026 Summer",
    sgpa: 3.278,
    cgpa: 2.512,
  },
  {
    code: "BAS126",
    name: "Discrete Structures",
    letter: "B-",
    semester: "2025-2026 Summer",
    sgpa: 3.278,
    cgpa: 2.512,
  },
  {
    code: "GEN101",
    name: "English Language II",
    letter: "A+",
    semester: "2025-2026 Summer",
    sgpa: 3.278,
    cgpa: 2.512,
  },
  {
    code: "GEN402",
    name: "Creativity",
    letter: "A+",
    semester: "2025-2026 Summer",
    sgpa: 3.278,
    cgpa: 2.512,
  },
];

describe("credit-hour recovery", () => {
  it("recovers the live Summer split of 2/3/2/2 hours", () => {
    const hours = solveHours([2.7, 2.7, 4, 4], 3.278);
    expect(hours).not.toBeNull();
    const total = hours!.reduce((a, b) => a + b, 0);
    const points = hours!.reduce((sum, h, i) => sum + h * [2.7, 2.7, 4, 4][i]!, 0);
    expect(points / total).toBeCloseTo(3.278, 3);
  });

  it("returns null when no split reproduces the average", () => {
    expect(solveHours([4, 4], 2)).toBeNull();
  });

  it("builds a semester record from the live rows", () => {
    const [semester] = buildSemesters(rows, 9);
    expect(semester!.courses).toHaveLength(4);
    expect(semester!.solved).toBe(true);
    expect(semester!.hours).toBe(9);
  });

  it("prefers hours published by the registration endpoint", () => {
    const [semester] = buildSemesters(rows, null, new Map([["BAS123", 3]]));
    expect(semester!.courses[0]!.hours).toBe(3);
    expect(semester!.courses[0]!.inferred).toBe(false);
  });
});

describe("planning", () => {
  it("ranks repeats by CGPA gain", () => {
    const semesters = buildSemesters(rows, 9);
    const ranking = retakeRanking(semesters, 2.512, 32);
    expect(ranking[0]!.gain).toBeGreaterThan(0);
    expect(ranking[0]!.course.letter).toBe("B-");
    expect(ranking.every((option) => option.newCgpa > 2.512)).toBe(true);
  });

  it("forecasts graduation", () => {
    const forecast = forecastGraduation(2.512, 32, 142, 18, 3)!;
    expect(forecast.remainingHours).toBe(110);
    expect(forecast.terms).toBe(7);
    expect(forecast.projected).toBeCloseTo((2.512 * 32 + 3 * 110) / 142, 5);
    expect(forecast.best).toBeGreaterThan(forecast.projected);
  });

  it("computes the average needed to graduate at a target", () => {
    const need = requiredAverageToGraduate(3, 2.512, 32, 142)!;
    expect(need.points).toBeCloseTo((3 * 142 - 2.512 * 32) / 110, 5);
    expect(need.possible).toBe(true);
  });

  it("flags unreachable graduation targets", () => {
    expect(requiredAverageToGraduate(4, 2.512, 32, 142)!.possible).toBe(false);
  });

  it("maps percentages to letters", () => {
    expect(letterForPercent(95)).toBe("A+");
    expect(letterForPercent(77)).toBe("B");
    expect(letterForPercent(10)).toBe("F");
  });
});
