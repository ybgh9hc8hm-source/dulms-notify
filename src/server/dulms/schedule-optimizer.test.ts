import { describe, expect, it } from "vitest";

import { parseTimeRange, type RegistrationOption } from "./registration";
import { buildCandidates, recommendSchedule, scheduleMetrics } from "./schedule-optimizer";

function option(partial: Partial<RegistrationOption> & { courseId: string }): RegistrationOption {
  return {
    courseCode: partial.courseId,
    courseName: partial.courseId,
    groupId: "g1",
    groupName: "A",
    subgroupId: "",
    subgroupName: null,
    kind: "lecture",
    blocked: false,
    free: 10,
    total: 30,
    label: "Lecture A",
    dayIndex: 0,
    dayName: "Saturday",
    startMinutes: 9 * 60,
    endMinutes: 10 * 60 + 30,
    room: null,
    ...partial,
  };
}

describe("parseTimeRange", () => {
  it("reads a 24h portal range", () => {
    expect(parseTimeRange("19:15:00 - 20:45:00")).toEqual({ start: 1155, end: 1245 });
  });
  it("defaults to 90 minutes with one time", () => {
    expect(parseTimeRange("09:00")).toEqual({ start: 540, end: 630 });
  });
  it("handles missing time", () => {
    expect(parseTimeRange(null)).toEqual({ start: null, end: null });
  });
});

describe("recommendSchedule", () => {
  it("prefers the group that keeps everything on one day", () => {
    const options = [
      option({ courseId: "C1", groupId: "a", groupName: "A" }),
      option({
        courseId: "C2",
        groupId: "b",
        groupName: "B",
        dayIndex: 3,
        dayName: "Tuesday",
        startMinutes: 9 * 60,
        endMinutes: 10 * 60 + 30,
      }),
      option({
        courseId: "C2",
        groupId: "c",
        groupName: "C",
        startMinutes: 10 * 60 + 45,
        endMinutes: 12 * 60 + 15,
      }),
    ];
    const result = recommendSchedule(options);
    expect(result.picks).toHaveLength(2);
    expect(result.metrics.days).toBe(1);
    expect(result.metrics.conflicts).toBe(0);
    expect(result.picks.find((pick) => pick.courseId === "C2")?.groupName).toBe("C");
  });

  it("never overlaps two meetings when a clash-free option exists", () => {
    const options = [
      option({ courseId: "C1", groupId: "a" }),
      option({ courseId: "C2", groupId: "b" }), // exact clash with C1
      option({
        courseId: "C2",
        groupId: "c",
        startMinutes: 11 * 60,
        endMinutes: 12 * 60 + 30,
      }),
    ];
    const result = recommendSchedule(options);
    expect(result.metrics.conflicts).toBe(0);
  });

  it("pairs a lecture with a section of the same group", () => {
    const candidates = buildCandidates([
      option({ courseId: "C1", groupId: "a", groupName: "A" }),
      option({
        courseId: "C1",
        groupId: "a",
        kind: "section",
        subgroupId: "s1",
        subgroupName: "1",
        startMinutes: 11 * 60,
        endMinutes: 12 * 60,
        label: "Section 1",
      }),
    ]);
    const list = candidates.get("C1")!;
    expect(list).toHaveLength(1);
    expect(list[0]!.slots).toHaveLength(2);
    expect(list[0]!.label).toBe("Lecture A + Section 1");
  });

  it("rejects lecture-only candidates when the course requires a section", () => {
    const candidates = buildCandidates([
      option({ courseId: "C1", groupId: "a", groupName: "A" }),
      option({ courseId: "C1", groupId: "b", groupName: "B" }),
      option({
        courseId: "C1",
        groupId: "a",
        kind: "section",
        subgroupId: "s1",
        subgroupName: "1",
      }),
    ]);
    expect(candidates.get("C1")?.map((candidate) => candidate.groupId)).toEqual(["a"]);
  });

  it("marks the pair closed when its section is closed", () => {
    const options = [
      option({ courseId: "C1", groupId: "a" }),
      option({
        courseId: "C1",
        groupId: "a",
        kind: "section",
        subgroupId: "s1",
        blocked: true,
      }),
    ];
    const candidates = buildCandidates(options);
    expect(candidates.get("C1")?.[0]?.open).toBe(false);
    expect(buildCandidates(options, true).has("C1")).toBe(false);
  });

  it("counts idle days between campus days", () => {
    const metrics = scheduleMetrics([
      {
        courseId: "C1",
        courseCode: "C1",
        courseName: "C1",
        groupId: "a",
        groupName: "A",
        subgroupId: "",
        subgroupName: null,
        label: "Lecture A",
        free: 5,
        open: true,
        slots: [
          { day: 0, start: 540, end: 630, label: "" },
          { day: 2, start: 540, end: 630, label: "" },
        ],
      },
    ]);
    expect(metrics.days).toBe(2);
    expect(metrics.idleDays).toBe(1);
  });
});
