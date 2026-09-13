import { describe, expect, it } from "vitest";

import { matchOption } from "./tools.server";
import type { RegistrationOption } from "@/server/dulms/registration";

const option = (over: Partial<RegistrationOption>): RegistrationOption =>
  ({
    courseId: "1",
    courseCode: "GEN403",
    courseName: "Introduction to Economics",
    groupId: "g1",
    groupName: "B",
    subgroupId: "",
    subgroupName: null,
    kind: "lecture",
    blocked: false,
    free: 5,
    total: 30,
    label: "Lecture B",
    ...over,
  }) as RegistrationOption;

const options = [
  option({}),
  option({ groupId: "g2", groupName: "C", label: "Lecture C" }),
  option({
    courseId: "2",
    courseCode: "BAS211",
    courseName: "Numerical Computation",
    groupId: "g3",
    groupName: "A",
    label: "Lecture A",
  }),
];

describe("matchOption", () => {
  it("matches by course code and group letter", () => {
    expect(matchOption(options, "GEN403", "C")?.groupId).toBe("g2");
  });

  it("matches full labels and is case insensitive", () => {
    expect(matchOption(options, "gen403", "lecture b")?.groupId).toBe("g1");
  });

  it("keeps the match inside the requested course", () => {
    expect(matchOption(options, "BAS211", "A")?.courseCode).toBe("BAS211");
  });

  it("returns null when nothing matches", () => {
    expect(matchOption(options, "GEN403", "Z")).toBeNull();
  });

  it("requires the section when one lecture has multiple sections", () => {
    const paired = [
      option({ subgroupId: "s1", subgroupName: "1", label: "Lecture B + Section 1" }),
      option({ subgroupId: "s2", subgroupName: "2", label: "Lecture B + Section 2" }),
    ];
    expect(matchOption(paired, "GEN403", "Lecture B")).toBeNull();
    expect(matchOption(paired, "GEN403", "2")?.subgroupId).toBe("s2");
  });
});
