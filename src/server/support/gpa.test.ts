import { describe, expect, it } from "vitest";

import { gradeCombinations, projectCgpa, requiredAverage } from "./gpa";

describe("projectCgpa", () => {
  it("blends current points with new courses", () => {
    const result = projectCgpa({
      currentCgpa: 2.512,
      currentHours: 32,
      courses: [
        { hours: 3, grade: "A" },
        { hours: 3, grade: "B" },
      ],
    });
    expect(result.newHours).toBe(38);
    expect(result.termGpa).toBe(3.5);
    expect(result.newCgpa).toBeCloseTo(2.67, 2);
  });

  it("accepts raw point values and reports unknown letters", () => {
    const result = projectCgpa({
      currentCgpa: 3,
      currentHours: 10,
      courses: [
        { hours: 2, grade: "3.5" },
        { hours: 2, grade: "Z" },
      ],
    });
    expect(result.unknownGrades).toEqual(["Z"]);
    expect(result.newCgpa).toBeCloseTo(3.08, 2);
  });
});

describe("requiredAverage", () => {
  it("computes the average needed and flags impossible targets", () => {
    expect(requiredAverage(2.512, 32, 19, 3).average).toBeCloseTo(3.82, 2);
    expect(requiredAverage(2, 60, 3, 3.9).reachable).toBe(false);
  });
});

describe("gradeCombinations", () => {
  it("ranks outcomes best first", () => {
    const combos = gradeCombinations({
      currentCgpa: 3,
      currentHours: 10,
      courses: [{ hours: 3 }, { hours: 3 }],
      letters: ["A", "B"],
    });
    expect(combos[0]!.grades).toEqual(["A", "A"]);
    expect(combos[0]!.cgpa).toBeGreaterThan(combos[combos.length - 1]!.cgpa);
  });
});
