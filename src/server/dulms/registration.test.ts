import { describe, expect, it } from "vitest";

import {
  registrationItems,
  registrationSelections,
  registrationSignature,
  type RegistrationOption,
} from "./registration";
import type { Row } from "./types";

const info = (available = 1): Row => ({
  RegAvailabilty: available,
  RegStartDate: "08-09-2026 12:00 AM",
  RegEndDate: "08-10-2026 12:00 AM",
  AcademicAllowedHours: 19,
  RegisteredHours: 0,
  ConfirmedHours: 0,
  StudentCredit: "42164.00",
  HourCostAfterDiscount: "2218.65",
});

const course = (id: number, seats = 4): Row => ({
  CourseId: id,
  CourseCode: id === 1 ? "GEN302" : "GEN403",
  CourseName: id === 1 ? "General Risk Management" : "Introduction to Economics",
  CreditHours: 2,
  GradeStatusId: 5,
  AvailableSeats: seats,
});

describe("direct registration fingerprint", () => {
  it("is stable when the portal returns courses in another order", () => {
    const a = registrationItems(info(), [course(1), course(2)]);
    const b = registrationItems(info(), [course(2), course(1)]);
    expect(registrationSignature(a)).toBe(registrationSignature(b));
  });

  it("moves when registration opens", () => {
    expect(registrationSignature(registrationItems(info(1), []))).not.toBe(
      registrationSignature(registrationItems(info(0), [])),
    );
  });

  it("moves when a course appears or disappears", () => {
    expect(registrationSignature(registrationItems(info(), [course(1)]))).not.toBe(
      registrationSignature(registrationItems(info(), [])),
    );
  });

  it("moves when available seats change", () => {
    expect(registrationSignature(registrationItems(info(), [course(1, 3)]))).not.toBe(
      registrationSignature(registrationItems(info(), [course(1, 4)])),
    );
  });

  it("keeps closed schedules out of the visible details", () => {
    const schedules = new Map<string, Row[]>([
      [
        "1",
        [
          {
            Type: "Group",
            GroupId: "A",
            GroupName: "A",
            IsBlocked: true,
            StudentsCount: 0,
            RegisteredCount: 0,
            DayWeekName: "Monday",
            Time: "08:45:00 - 10:15:00",
          },
        ],
      ],
    ]);
    const item = registrationItems(info(), [course(1)], schedules).find(
      (entry) => entry.kind === "courseOffer",
    );
    expect(item?.status).toBe("Offered — waiting for lecture and section");
    expect(item?.extra).toMatchObject({
      Structure: "Lectures only",
      Seats: "0 seats • 0/1 lectures open",
    });
    expect(item?.extra).not.toHaveProperty("Open lectures");
  });

  it("separates open lectures from open sections", () => {
    const schedules = new Map<string, Row[]>([
      [
        "1",
        [
          {
            Type: "Group",
            GroupId: "A",
            GroupName: "A",
            IsBlocked: false,
            StudentsCount: 40,
            RegisteredCount: 35,
          },
          {
            Type: "SubGroup",
            GroupId: "S1",
            GroupName: "S1",
            IsBlocked: false,
            StudentsCount: 20,
            RegisteredCount: 18,
          },
        ],
      ],
    ]);
    const item = registrationItems(info(), [course(1)], schedules).find(
      (entry) => entry.kind === "courseOffer",
    );
    expect(item?.extra).toMatchObject({
      Structure: "Lectures + sections",
      Seats: "7 seats • 1/1 lectures open • 1/1 sections open",
    });
    expect(item?.extra).toHaveProperty("Open lectures");
    expect(item?.extra).toHaveProperty("Open sections");
  });

  it("does not call a course open until both its lecture and section are open", () => {
    const schedules = new Map<string, Row[]>([
      [
        "1",
        [
          {
            Type: "Group",
            GroupId: "A",
            GroupName: "A",
            IsBlocked: false,
            StudentsCount: 40,
            RegisteredCount: 30,
          },
          {
            Type: "SubGroup",
            ParentGroupId: "A",
            GroupId: "S1",
            GroupName: "S1",
            IsBlocked: true,
            StudentsCount: 20,
            RegisteredCount: 10,
          },
        ],
      ],
    ]);
    const item = registrationItems(info(), [course(1)], schedules).find(
      (entry) => entry.kind === "courseOffer",
    );
    expect(item?.status).toBe("Offered — waiting for lecture and section");
  });
});

function registrationOption(
  kind: "lecture" | "section",
  partial: Partial<RegistrationOption> = {},
): RegistrationOption {
  return {
    courseId: "1",
    courseCode: "GEN302",
    courseName: "General Risk Management",
    groupId: "A",
    groupName: "A",
    subgroupId: kind === "section" ? "S1" : "",
    subgroupName: kind === "section" ? "1" : null,
    kind,
    blocked: false,
    free: 5,
    total: 20,
    label: kind === "section" ? "Section 1 — Monday 11:00 AM" : "Lecture A — Sunday 9:00 AM",
    dayIndex: kind === "section" ? 2 : 1,
    dayName: kind === "section" ? "Monday" : "Sunday",
    startMinutes: kind === "section" ? 660 : 540,
    endMinutes: kind === "section" ? 720 : 630,
    room: null,
    ...partial,
  };
}

describe("atomic lecture and section choices", () => {
  it("requires a section when the course exposes sections", () => {
    const choices = registrationSelections([
      registrationOption("lecture"),
      registrationOption("section"),
    ]);
    expect(choices).toHaveLength(1);
    expect(choices[0]).toMatchObject({ groupId: "A", subgroupId: "S1", blocked: false, free: 5 });
  });

  it("closes the whole choice when either half is closed", () => {
    const choices = registrationSelections([
      registrationOption("lecture"),
      registrationOption("section", { blocked: true, free: 8 }),
    ]);
    expect(choices[0]).toMatchObject({ blocked: true, free: 5 });
  });

  it("does not offer a lecture group with no compatible section", () => {
    const choices = registrationSelections([
      registrationOption("lecture", { groupId: "A" }),
      registrationOption("lecture", { groupId: "B", groupName: "B" }),
      registrationOption("section", { groupId: "A" }),
    ]);
    expect(choices.map((choice) => choice.groupId)).toEqual(["A"]);
  });

  it("keeps lecture-only courses registerable", () => {
    const choices = registrationSelections([registrationOption("lecture")]);
    expect(choices).toHaveLength(1);
    expect(choices[0]?.subgroupId).toBe("");
  });
});
