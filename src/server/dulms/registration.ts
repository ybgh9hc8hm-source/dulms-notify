/**
 * Course-registration section.
 *
 * DULMS exposes the registration window and the list of courses a student may
 * register *right now* through two endpoints used by
 * `/Registered/CoursesRegisteration`:
 *
 *   GET  /Registered/GetStudentResiterationInfo      → window + hours + credit
 *   GET  /Registered/GetStudentResiterationCourses   → courses open for the student
 *        ?GradeStatusIds=0,1,2,3,4,&GroupsIds=-1&IsVirtualRegisteration=false
 *
 * Both were verified live against the portal: the info endpoint answers with a
 * single-row array, the courses endpoint with `[]` while nothing is open and
 * with one row per offered course once registration opens. Anything unexpected
 * degrades to "no items" instead of throwing, so a portal change can never
 * break the whole scrape.
 */
import { api, apiObj, BASE, type Jar } from "./http";
import { requestPause } from "./browser-profile";
import { dropSession, getDulmsSession } from "./session";
import { courseLabel, num, str, toIsoLoose } from "./parse";
import type { Row, ScrapedItem } from "./types";

/**
 * The portal's own filter defaults check statuses 0,2,3,4,5 — status 5
 * ("Never Registered") is the one that carries newly opened courses, so it
 * MUST be included or the endpoint answers with an empty list.
 */
const COURSES_PATH =
  "/Registered/GetStudentResiterationCourses?GradeStatusIds=0,1,2,3,4,5,&GroupsIds=-1&IsVirtualRegisteration=false";
const INFO_PATH = "/Registered/GetStudentResiterationInfo";

export interface RegistrationSnapshot {
  signature: string;
  info: Row;
  courses: Row[];
  items: ScrapedItem[];
  options: RegistrationOption[];
}

export interface RegistrationOption {
  courseId: string;
  courseCode: string | null;
  courseName: string;
  groupId: string;
  groupName: string;
  subgroupId: string;
  subgroupName: string | null;
  kind: "lecture" | "section";
  blocked: boolean;
  free: number;
  total: number;
  label: string;
  /** Structured meeting time, used by the schedule optimizer. */
  dayIndex: number | null;
  dayName: string | null;
  startMinutes: number | null;
  endMinutes: number | null;
  room: string | null;
}

/**
 * Converts portal schedule rows into valid registration choices.
 *
 * A course that has sections is atomic: a choice always contains one lecture
 * group and one section belonging to that group. Its availability is the
 * intersection of every lecture meeting and every section meeting, so callers
 * can never submit because only one half happened to be open.
 */
export function registrationSelections(
  options: readonly RegistrationOption[],
): RegistrationOption[] {
  const byCourse = new Map<string, RegistrationOption[]>();
  for (const option of options) {
    const rows = byCourse.get(option.courseId);
    if (rows) rows.push(option);
    else byCourse.set(option.courseId, [option]);
  }

  const selections: RegistrationOption[] = [];
  for (const courseOptions of byCourse.values()) {
    const lectures = courseOptions.filter((option) => option.kind === "lecture");
    const sections = courseOptions.filter((option) => option.kind === "section");
    const requiresSection = sections.length > 0;
    const groupIds = [...new Set(lectures.map((option) => option.groupId))];

    for (const groupId of groupIds) {
      const groupLectures = lectures.filter((option) => option.groupId === groupId);
      const groupSections = sections.filter((option) => option.groupId === groupId);
      if (groupLectures.length === 0 || (requiresSection && groupSections.length === 0)) continue;

      const sectionVariants = new Map<string, RegistrationOption[]>();
      for (const section of groupSections) {
        const rows = sectionVariants.get(section.subgroupId);
        if (rows) rows.push(section);
        else sectionVariants.set(section.subgroupId, [section]);
      }
      const variants = requiresSection
        ? [...sectionVariants.entries()]
        : ([["", []]] as [string, RegistrationOption[]][]);

      for (const [subgroupId, subgroupRows] of variants) {
        const members = [...groupLectures, ...subgroupRows];
        const head = groupLectures[0];
        if (!head || members.length === 0) continue;
        const section = subgroupRows[0] ?? null;
        const labels = [...new Set(members.map((member) => member.label).filter(Boolean))];
        selections.push({
          ...head,
          subgroupId,
          subgroupName: section?.subgroupName ?? null,
          blocked: members.some((member) => member.blocked),
          free: Math.min(...members.map((member) => member.free)),
          total: Math.min(...members.map((member) => member.total)),
          label: labels.join(" + "),
        });
      }
    }
  }
  return selections;
}

/** Academic week: DULMS timetables start on Saturday. */
const DAY_ORDER = [
  "Saturday",
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
] as const;

export function dayIndexOf(day: string | null | undefined): number | null {
  const index = DAY_ORDER.indexOf((day ?? "").trim() as (typeof DAY_ORDER)[number]);
  return index === -1 ? null : index;
}

export function dayLabel(index: number): string {
  return DAY_ORDER[index] ?? `Day ${index}`;
}

/** "19:15:00 - 20:45:00" -> { start: 1155, end: 1245 } (minutes since midnight). */
export function parseTimeRange(raw: string | null | undefined): {
  start: number | null;
  end: number | null;
} {
  const matches = [...(raw ?? "").matchAll(/(\d{1,2}):([0-5]\d)(?::[0-5]\d)?\s*(AM|PM|ص|م)?/gi)];
  const minutes = matches.map((match) => {
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    const suffix = (match[3] ?? "").toUpperCase();
    if ((suffix === "PM" || suffix === "م") && hour < 12) hour += 12;
    if ((suffix === "AM" || suffix === "ص") && hour === 12) hour = 0;
    return hour * 60 + minute;
  });
  if (minutes.length === 0) return { start: null, end: null };
  const start = minutes[0]!;
  const end = minutes.length > 1 ? minutes[1]! : start + 90;
  return { start, end: end > start ? end : start + 90 };
}

class RegistrationSessionRejected extends Error {}

/** "19:15:00 - 20:45:00" -> "7:15 PM – 8:45 PM". */
function cleanTime(raw: string | null | undefined): string {
  const value = (raw ?? "").toString().replace(/\s+/g, " ").trim();
  if (!value) return "";
  return value
    .replace(/(\d{1,2}):([0-5]\d)(?::[0-5]\d)?\s*(AM|PM|ص|م)?/gi, (_m, h: string, m: string) => {
      const hour = Number(h);
      const suffix = hour < 12 ? "AM" : "PM";
      const display = hour % 12 === 0 ? 12 : hour % 12;
      return `${display}:${m} ${suffix}`;
    })
    .replace(/\s*-\s*/g, " – ");
}

const EN_DAY: Record<string, string> = {
  السبت: "Saturday",
  الأحد: "Sunday",
  الاثنين: "Monday",
  الثلاثاء: "Tuesday",
  الأربعاء: "Wednesday",
  الخميس: "Thursday",
  الجمعة: "Friday",
};

function dayName(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  return EN_DAY[value] ?? value;
}

/** Human status for the registration window. */
function windowStatus(row: Row): string {
  const available = num(row["RegAvailabilty"]) === 1;
  const reason = str(row["RegAvailabiltyReason"]);
  if (available) return "Registration open";
  return reason ? `Registration closed — ${reason}` : "Registration closed";
}

/**
 * Extras for one course card. Deliberately minimal: the Telegram message is
 * read on a phone, so anything already spoken in the title/status line (code,
 * name, hours, state) is never repeated here.
 */
function courseExtras(row: Row): Record<string, string> {
  const extra: Record<string, string> = {};
  const prereq = str(row["Prerequisites"] ?? row["PreRequisite"]);
  if (prereq) extra["Prerequisite"] = prereq;
  return extra;
}

export function registrationItems(
  info: Row | null,
  courses: Row[],
  schedules?: Map<string, Row[]> | null,
): ScrapedItem[] {
  const items: ScrapedItem[] = [];
  courses = [...courses].sort((left, right) => {
    const key = (row: Row) =>
      str(row["CourseId"] ?? row["Id"] ?? row["CrsId"] ?? row["CourseCode"] ?? row["Code"]) ?? "";
    return key(left).localeCompare(key(right));
  });

  if (info) {
    const open = num(info["RegAvailabilty"]) === 1;
    const extra: Record<string, string> = {};
    const openCourses = courses.filter((row) => str(row["GradeStatusId"]) !== "4");

    // One compact line per fact instead of eight separate key/value rows.
    const from = str(info["RegStartDate"]);
    const to = str(info["RegEndDate"]);
    if (from || to) extra["Window"] = [from, to].filter(Boolean).join(" — ");
    const allowed = str(info["AcademicAllowedHours"]);
    const registered = str(info["RegisteredHours"]);
    if (allowed || registered)
      extra["Hours"] = `${allowed ?? "—"} allowed • ${registered ?? "0"} registered`;
    const credit = str(info["StudentCredit"]);
    const cost = str(info["HourCostAfterDiscount"] ?? info["HourCost"]);
    if (credit || cost)
      extra["Balance"] = [credit, cost ? `${cost} / hour` : null].filter(Boolean).join(" • ");
    if (openCourses.length) {
      const list = openCourses.map((row) => {
        const code = str(row["CourseCode"] ?? row["Code"]);
        const name = str(row["CourseName"] ?? row["Name"]);
        const hours = str(row["CreditHours"]);
        return `${[code, name].filter(Boolean).join(" — ")}${hours ? ` (${hours} h)` : ""}`;
      });
      extra["Offered courses"] =
        list.length === 1 ? list[0]! : list.map((line) => `• ${line}`).join("\n");
    }

    items.push({
      kind: "registration",
      externalKey: "registration-window",
      course: null,
      title: "Course registration",
      dueAt: null,
      status: windowStatus(info),
      score: open
        ? `${openCourses.length} course${openCourses.length === 1 ? "" : "s"} offered`
        : null,
      extra,
    });
  }

  for (const row of courses) {
    const code = str(row["CourseCode"] ?? row["Code"]);
    const name = str(row["CourseName"] ?? row["Name"] ?? row["NameEn"]);
    const id = str(row["CourseId"] ?? row["Id"] ?? row["CrsId"]) ?? `${code ?? ""}-${name ?? ""}`;
    if (!code && !name) continue;
    const seats = str(row["AvailableSeats"] ?? row["RemainingSeats"]);
    const hours = str(row["CreditHours"] ?? row["Hours"] ?? row["CourseHours"]);
    const statusId = str(row["GradeStatusId"]);
    const groups = groupSummary(schedules?.get(id) ?? null);
    const choices = schedules ? registrationSelections(registrationOptions([row], schedules)) : [];
    const hasReadyChoice = choices.some((choice) => !choice.blocked && choice.free > 0);
    const state =
      statusId === "4"
        ? "Already registered"
        : groups
          ? hasReadyChoice
            ? "Open for registration"
            : "Offered — waiting for lecture and section"
          : "Offered";
    const extra: Record<string, string> = { _courseId: id };
    if (groups) {
      extra["Structure"] = groups.structure;
      extra["Seats"] = groups.headline;
    } else if (seats) extra["Seats"] = seats;
    Object.assign(extra, groups?.extra ?? {}, courseExtras(row));
    if (choices.length > 0) extra["_registrationOptions"] = JSON.stringify(choices);
    items.push({
      kind: "courseOffer",
      externalKey: `course-offer-${id}`.toLowerCase(),
      course: courseLabel(code, name),
      // The context line already prints "CODE — Name"; repeating the code as a
      // title produced "GEN403 — Economics — GEN403".
      title: "",
      dueAt: null,
      status: state,
      score: hours ? `${hours} h` : null,
      extra,
    });
  }

  return items;
}

interface GroupSlot {
  section: boolean;
  blocked: boolean;
  free: number;
  total: number;
  line: string;
}

/**
 * Group/sub-group state for one course, exactly as the portal's registration
 * card renders it: "Available: StudentsCount - RegisteredCount / StudentsCount"
 * plus `IsBlocked`, which is what makes a course readable-but-still-closed
 * (all groups blocked, 0/0 places).
 *
 * DULMS models a lecture as `Type: "Group"` and a section/lab as
 * `Type: "SubGroup"`, so the two are counted and listed separately — a course
 * with lectures only reads differently from one that also needs a section.
 */
function groupSummary(rows: Row[] | null): {
  headline: string;
  structure: string;
  open: boolean;
  extra: Record<string, string>;
} | null {
  if (!rows || rows.length === 0) return null;
  const seen = new Map<string, Row>();
  for (const row of rows) {
    const key = `${str(row["Type"]) ?? "Group"}-${str(row["GroupId"]) ?? ""}`;
    if (!seen.has(key)) seen.set(key, row);
  }

  const slots: GroupSlot[] = [];
  for (const row of seen.values()) {
    // DULMS names the slot kind in `NameEn` ("lecture", "section", "lab") and
    // mirrors it in `Type` ("Group" / "SubGroup"); either is enough to tell a
    // lecture apart from a section.
    const kindRaw = (str(row["NameEn"]) ?? "").toLowerCase();
    const section = str(row["Type"]) === "SubGroup" || /section|lab|tutorial/.test(kindRaw);
    const kind = kindRaw
      ? kindRaw.charAt(0).toUpperCase() + kindRaw.slice(1)
      : section
        ? "Section"
        : "Lecture";
    const blocked = row["IsBlocked"] === true;
    const total = num(row["StudentsCount"]) ?? 0;
    const taken = num(row["RegisteredCount"]) ?? 0;
    const free = Math.max(0, total - taken);
    const label = str(row["GroupName"]) ?? str(row["GroupId"]) ?? "?";
    const when = [dayName(str(row["DayWeekName"])), cleanTime(str(row["Time"]))]
      .filter(Boolean)
      .join(" ");
    const bits = [
      `${kind} ${label}`,
      `${free} seat${free === 1 ? "" : "s"}`,
      when,
      str(row["ClassRoomName"])?.replace(/\s+/g, " ").trim(),
    ].filter(Boolean);
    slots.push({ section, blocked, free, total, line: `• ${bits.join(" — ")}` });
  }

  const lectures = slots.filter((slot) => !slot.section);
  const sections = slots.filter((slot) => slot.section);
  const openCount = (list: GroupSlot[]) => list.filter((slot) => !slot.blocked).length;
  const sum = (list: GroupSlot[], pick: (slot: GroupSlot) => number) =>
    list.reduce((total, slot) => total + pick(slot), 0);

  const freeSeats = sum(slots, (slot) => slot.free);
  const totalSeats = sum(slots, (slot) => slot.total);
  const openGroups = openCount(slots);

  const structure = sections.length ? "Lectures + sections" : "Lectures only";

  const parts = [
    `${openCount(lectures)}/${lectures.length} lectures open`,
    sections.length ? `${openCount(sections)}/${sections.length} sections open` : null,
  ].filter(Boolean);
  const headline = `${freeSeats} seat${freeSeats === 1 ? "" : "s"} • ${parts.join(" • ")}`;

  const extra: Record<string, string> = {};
  const list = (label: string, group: GroupSlot[]) => {
    // Closed groups add no actionable information. Keep them in the counts and
    // signature, but only display schedules the student can use right now.
    const open = group.filter((slot) => !slot.blocked);
    if (open.length === 0) return;
    const lines = open.map((slot) => slot.line);
    extra[label] = lines.length === 1 ? lines[0]!.replace(/^• /, "") : lines.join("\n");
  };
  list("Open lectures", lectures);
  list("Open sections", sections);

  return { headline, structure, open: openGroups > 0, extra };
}

export function registrationOptions(
  courses: Row[],
  schedules: Map<string, Row[]>,
): RegistrationOption[] {
  const options: RegistrationOption[] = [];
  for (const course of courses) {
    const courseId = str(course["CourseId"] ?? course["Id"] ?? course["CrsId"]);
    if (!courseId) continue;
    const courseCode = str(course["CourseCode"] ?? course["Code"]);
    const courseName =
      str(course["CourseName"] ?? course["Name"] ?? course["NameEn"]) ?? courseCode ?? courseId;
    for (const row of schedules.get(courseId) ?? []) {
      const kindRaw = (str(row["NameEn"]) ?? "").toLowerCase();
      const section = str(row["Type"]) === "SubGroup" || /section|lab|tutorial/.test(kindRaw);
      const groupId = str(row["ParentGroupId"] ?? row["MainGroupId"] ?? row["GroupId"]);
      const subgroupId = section ? (str(row["SubGroupId"] ?? row["GroupId"]) ?? "") : "";
      if (!groupId) continue;
      const groupName =
        str(row["ParentGroupName"] ?? row["MainGroupName"] ?? row["GroupName"]) ?? groupId;
      const subgroupName = section
        ? (str(row["SubGroupName"] ?? row["GroupName"]) ?? subgroupId)
        : null;
      const total = num(row["StudentsCount"]) ?? 0;
      const taken = num(row["RegisteredCount"]) ?? 0;
      const free = Math.max(0, total - taken);
      const blocked = row["IsBlocked"] === true;
      const day = dayName(str(row["DayWeekName"]));
      const range = parseTimeRange(str(row["Time"]));
      const when = [day, cleanTime(str(row["Time"]))].filter(Boolean).join(" ");
      options.push({
        courseId,
        courseCode,
        courseName,
        groupId,
        groupName,
        subgroupId,
        subgroupName,
        kind: section ? "section" : "lecture",
        blocked,
        free,
        total,
        label: [section ? `Section ${subgroupName}` : `Lecture ${groupName}`, when]
          .filter(Boolean)
          .join(" — "),
        dayIndex: dayIndexOf(day),
        dayName: day || null,
        startMinutes: range.start,
        endMinutes: range.end,
        room: str(row["ClassRoomName"])?.replace(/\s+/g, " ").trim() ?? null,
      });
    }
  }
  return options;
}

/** Group/sub-group schedule (seats + blocked state) for one course id. */
async function readCourseSchedules(
  jar: Jar,
  courses: Row[],
  strict: boolean,
): Promise<Map<string, Row[]>> {
  const ids = courses
    .map((row) => str(row["CourseId"] ?? row["Id"] ?? row["CrsId"]))
    .filter((id): id is string => Boolean(id));
  const map = new Map<string, Row[]>();
  const unique = [...new Set(ids)].slice(0, 24);
  await Promise.all(
    unique.map(async (id) => {
      const path = `/Registered/GetCourseSchedual?CourseId=${encodeURIComponent(id)}`;
      try {
        const raw = strict
          ? await strictJson(jar, path)
          : await api<Row>(jar, path, "GET").catch(() => [] as Row[]);
        if (Array.isArray(raw)) map.set(id, raw as Row[]);
      } catch (cause) {
        if (strict && cause instanceof RegistrationSessionRejected) throw cause;
      }
    }),
  );
  return map;
}

export async function readRegistration(jar: Jar): Promise<ScrapedItem[]> {
  const [info, courses] = await Promise.all([
    apiObj(jar, INFO_PATH, "GET").catch(() => null),
    api<Row>(jar, COURSES_PATH, "GET").catch(() => [] as Row[]),
  ]);
  const schedules = await readCourseSchedules(jar, courses, false).catch(
    () => new Map<string, Row[]>(),
  );
  return registrationItems(info, courses, schedules);
}

async function strictJson(jar: Jar, path: string): Promise<unknown> {
  await requestPause();
  const res = await fetch(new URL(path, BASE).toString(), {
    method: "GET",
    redirect: "manual",
    headers: {
      ...jar.clientHeaders(),
      cookie: jar.header(),
      "content-type": "application/json; charset=utf-8",
      "x-requested-with": "XMLHttpRequest",
      accept: "application/json, text/javascript, */*; q=0.01",
    },
  });
  if (res.status >= 300 && res.status < 400) throw new RegistrationSessionRejected();
  const text = await res.text();
  if (/name="txtPass"|login\.aspx/i.test(text)) throw new RegistrationSessionRejected();
  if (res.status === 401 || res.status === 403) throw new RegistrationSessionRejected();
  if (!res.ok || !text.trim())
    throw new Error(`DULMS registration endpoint returned ${res.status}`);
  // A stale cookie jar answers "-1" with HTTP 200 instead of redirecting to the
  // login page; treat it as a rejected session so the caller re-authenticates.
  if (text.trim() === "-1") throw new RegistrationSessionRejected();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("DULMS registration endpoint returned invalid JSON");
  }
}

async function fetchSnapshot(jar: Jar): Promise<RegistrationSnapshot> {
  const [rawInfo, rawCourses] = await Promise.all([
    strictJson(jar, INFO_PATH),
    strictJson(jar, COURSES_PATH),
  ]);
  const info = (Array.isArray(rawInfo) ? rawInfo[0] : rawInfo) as Row | undefined;
  // Anything that is not a record means the portal answered without a valid
  // session (or with a sentinel); re-login instead of failing the whole check.
  if (!info || typeof info !== "object") throw new RegistrationSessionRejected();
  if (!Array.isArray(rawCourses)) throw new Error("DULMS registration courses are unavailable");
  const courses = rawCourses as Row[];
  const schedules = await readCourseSchedules(jar, courses, true);
  const items = registrationItems(info, courses, schedules);
  if (!items.some((item) => item.kind === "registration")) {
    throw new Error("DULMS registration snapshot is incomplete");
  }
  return {
    signature: registrationSignature(items),
    info,
    courses,
    items,
    options: registrationOptions(courses, schedules),
  };
}

/** Strict direct read used by the five-second detector; failures never become “zero courses”. */
export async function readRegistrationSnapshot(
  dulmsId: string,
  password: string,
): Promise<RegistrationSnapshot> {
  let session = await getDulmsSession(dulmsId, password);
  try {
    return await fetchSnapshot(session.jar);
  } catch (cause) {
    if (!(cause instanceof RegistrationSessionRejected)) throw cause;
    await dropSession(dulmsId);
    session = await getDulmsSession(dulmsId, password, true);
    return fetchSnapshot(session.jar);
  }
}

export function registrationSignature(items: readonly ScrapedItem[]): string {
  const normalised = items
    .map((item) => ({
      kind: item.kind,
      key: item.externalKey,
      course: item.course,
      title: item.title,
      dueAt: item.dueAt,
      status: item.status,
      score: item.score,
      extra: Object.fromEntries(Object.entries(item.extra).sort(([a], [b]) => a.localeCompare(b))),
    }))
    .sort((a, b) => `${a.kind}:${a.key}`.localeCompare(`${b.kind}:${b.key}`));
  const payload = JSON.stringify(normalised);
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${items.length}-${hash.toString(16).padStart(8, "0")}`;
}
