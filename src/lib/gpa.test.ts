import { describe, expect, it } from "vitest";

import { gradePoints, planForTarget, simulate, hoursToTarget, gpaBand } from "./gpa";

const course = (hours: number, letter: string) => ({
  id: `${hours}-${letter}`,
  name: letter,
  hours,
  letter,
});

describe("grade scale (verified against live DULMS results)", () => {
  it("reproduces the Spring semester SGPA of 2.25", () => {
    const sim = simulate(
      [course(3, "C"), course(3, "C+"), course(3, "B"), course(3, "C-")],
      null,
      null,
    );
    expect(sim.sgpa).toBeCloseTo(2.25, 3);
  });

  it("reproduces the Summer semester SGPA of 3.278", () => {
    const sim = simulate(
      [course(2, "B-"), course(3, "B-"), course(2, "A+"), course(2, "A+")],
      null,
      null,
    );
    expect(sim.sgpa).toBeCloseTo(3.278, 3);
  });

  it("ignores courses without a chosen grade", () => {
    const sim = simulate([course(3, "A"), course(3, "")], null, null);
    expect(sim.hours).toBe(3);
    expect(sim.sgpa).toBeCloseTo(4, 5);
  });

  it("weights the cumulative average by earned hours", () => {
    const sim = simulate([course(10, "A+")], 2.512, 32);
    expect(sim.cgpa).toBeCloseTo((2.512 * 32 + 40) / 42, 5);
  });

  it("maps unknown letters to null", () => {
    expect(gradePoints("W")).toBeNull();
    expect(gradePoints("b-")).toBe(2.7);
  });
});

describe("target planning", () => {
  it("computes the semester average needed for the target", () => {
    const plan = planForTarget(3, 18, 2.512, 32)!;
    expect(plan.requiredSgpa).toBeCloseTo((3 * 50 - 2.512 * 32) / 18, 5);
    expect(plan.possible).toBe(true);
    expect(plan.requiredGrade?.letter).toBe("A");
  });

  it("flags impossible targets", () => {
    const plan = planForTarget(4, 6, 2.0, 60)!;
    expect(plan.possible).toBe(false);
  });

  it("estimates the hours needed at a fixed grade", () => {
    expect(hoursToTarget(3, 4, 2.512, 32)).toBe(Math.ceil((32 * 0.488) / 1));
    expect(hoursToTarget(3, 2.7, 2.512, 32)).toBeNull();
  });

  it("bands the cumulative average", () => {
    expect(gpaBand(2.512).key).toBe("good");
    expect(gpaBand(3.5).key).toBe("excellent");
    expect(gpaBand(1.5).key).toBe("pass");
  });
});
