import { describe, expect, it } from "vitest";

import type { RegistrationOption } from "../dulms/registration";
import { groupRegistrationChoices, registrationChoiceKeyboard } from "./registration-buttons";

function option(courseId: string, courseCode: string, label: string): RegistrationOption {
  return {
    courseId,
    courseCode,
    courseName: `Course ${courseId}`,
    groupId: label,
    groupName: label,
    subgroupId: "",
    subgroupName: null,
    kind: "lecture",
    blocked: false,
    free: 4,
    total: 20,
    label,
    dayIndex: 1,
    dayName: "Sunday",
    startMinutes: 540,
    endMinutes: 630,
    room: null,
  };
}

describe("registration choice layout", () => {
  it("groups choices by course and shortens each button to the group label", () => {
    const choices = [option("2", "BAS211", "Lecture B"), option("1", "BAS112", "Lecture A")];
    const groups = groupRegistrationChoices(choices);

    expect(groups.map((group) => group.courseId)).toEqual(["1", "2"]);
    expect(registrationChoiceKeyboard(groups[0]!.options)[0]?.[0]?.text).toBe(
      "Lecture A • 4 مقعد",
    );
  });
});