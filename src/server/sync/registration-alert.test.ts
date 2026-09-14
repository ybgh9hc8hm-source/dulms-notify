import { describe, expect, it } from "vitest";

import type { ScrapedItem } from "../dulms/types";
import { newlyOpenedCourses } from "./registration-alert.server";

function offer(id: string, status: string): ScrapedItem {
  return {
    kind: "courseOffer",
    externalKey: `course-offer-${id}`,
    course: `BAS${id} — Course ${id}`,
    title: "",
    dueAt: null,
    status,
    score: "3 h",
    extra: { _courseId: id },
  };
}

describe("newlyOpenedCourses", () => {
  it("returns only courses that have just become open", () => {
    const previous = [
      offer("112", "Offered — waiting for lecture and section"),
      offer("211", "Open for registration"),
    ];
    const current = [
      offer("112", "Open for registration"),
      offer("211", "Open for registration"),
      offer("302", "Offered — waiting for lecture and section"),
    ];

    expect(newlyOpenedCourses(previous, current).map((item) => item.externalKey)).toEqual([
      "course-offer-112",
    ]);
  });

  it("treats a newly offered open course as newly opened", () => {
    expect(newlyOpenedCourses([], [offer("112", "Open for registration")])).toHaveLength(1);
  });
});