/**
 * Schedule optimizer.
 *
 * Given the live registration offer (every lecture group and section the
 * portal exposes), it picks ONE group per course so the resulting weekly
 * timetable is as compact as humanly possible:
 *
 *   1. no two chosen meetings overlap            (hard constraint)
 *   2. the fewest possible distinct days on campus
 *   3. those days sit back-to-back — no idle day in the middle
 *   4. the smallest possible idle time between lectures inside a day
 *   5. the shortest total time spent on campus each day
 *   6. as a tie-break, the group with more free seats (easier to secure)
 *
 * The search is exact whenever the offer is small enough (the usual case:
 * a handful of courses with a few groups each) and falls back to a
 * best-first beam search when the combinatorics explode, so it always
 * answers in bounded time.
 */
import { dayLabel, type RegistrationOption } from "./registration";

export interface ScheduleSlot {
  day: number;
  start: number;
  end: number;
  label: string;
}

export interface GroupCandidate {
  courseId: string;
  courseCode: string | null;
  courseName: string;
  groupId: string;
  groupName: string;
  subgroupId: string;
  subgroupName: string | null;
  /** Human label, e.g. "Lecture C + Section 2". */
  label: string;
  slots: ScheduleSlot[];
  /** Smallest free-seat count across the meetings of this candidate. */
  free: number;
  /** True when every meeting is currently open for registration. */
  open: boolean;
}

export interface ScheduleMetrics {
  days: number;
  /** Idle days sitting between the first and the last campus day. */
  idleDays: number;
  /** Total idle minutes between consecutive meetings inside a day. */
  gapMinutes: number;
  /** Total minutes on campus (first start → last end, per day). */
  campusMinutes: number;
  conflicts: number;
  dayNames: string[];
}

export interface ScheduleRecommendation {
  picks: GroupCandidate[];
  metrics: ScheduleMetrics;
  /** Courses that had no usable candidate (no schedule data, or all closed). */
  skipped: { courseId: string; courseName: string; reason: string }[];
  exact: boolean;
}

const WEIGHT = {
  conflict: 1_000_000,
  day: 5_000,
  idleDay: 1_500,
  gapMinute: 1,
  campusMinute: 0.05,
  closed: 300,
  seat: 2,
};

/** All exhaustive combinations we are willing to enumerate before beaming. */
const EXACT_LIMIT = 200_000;
const BEAM_WIDTH = 400;

function slotOf(option: RegistrationOption): ScheduleSlot | null {
  if (option.dayIndex === null || option.startMinutes === null || option.endMinutes === null) {
    return null;
  }
  return {
    day: option.dayIndex,
    start: option.startMinutes,
    end: option.endMinutes,
    label: option.label,
  };
}

function mergeSlots(slots: ScheduleSlot[]): ScheduleSlot[] {
  const seen = new Set<string>();
  const unique: ScheduleSlot[] = [];
  for (const slot of slots) {
    const key = `${slot.day}-${slot.start}-${slot.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(slot);
  }
  return unique;
}

/**
 * One candidate per (lecture group × its section), because DULMS registers a
 * course as exactly one lecture group plus — when the course has them — one
 * section under that group.
 */
export function buildCandidates(
  options: readonly RegistrationOption[],
  onlyOpen = false,
): Map<string, GroupCandidate[]> {
  const byCourse = new Map<string, RegistrationOption[]>();
  for (const option of options) {
    const list = byCourse.get(option.courseId);
    if (list) list.push(option);
    else byCourse.set(option.courseId, [option]);
  }

  const result = new Map<string, GroupCandidate[]>();
  for (const [courseId, courseOptions] of byCourse) {
    const lectures = courseOptions.filter((option) => option.kind === "lecture");
    const sections = courseOptions.filter((option) => option.kind === "section");
    const requiresSection = sections.length > 0;
    const groupIds = new Set([
      ...lectures.map((option) => option.groupId),
      ...sections.map((option) => option.groupId),
    ]);

    const candidates: GroupCandidate[] = [];
    for (const groupId of groupIds) {
      const groupLectures = lectures.filter((option) => option.groupId === groupId);
      const groupSections = sections.filter((option) => option.groupId === groupId);
      // Never recommend a lecture by itself when this course requires a
      // section. A missing section under this lecture group is not registerable.
      if (groupLectures.length === 0 || (requiresSection && groupSections.length === 0)) continue;
      const base = groupLectures.length ? groupLectures : [];
      const head = base[0] ?? groupSections[0]!;

      const bySubgroup = new Map<string, RegistrationOption[]>();
      for (const section of groupSections) {
        const list = bySubgroup.get(section.subgroupId);
        if (list) list.push(section);
        else bySubgroup.set(section.subgroupId, [section]);
      }

      const variants: { subgroup: RegistrationOption[]; id: string; name: string | null }[] =
        !requiresSection
          ? [{ subgroup: [], id: "", name: null }]
          : [...bySubgroup.entries()].map(([id, rows]) => ({
              subgroup: rows,
              id,
              name: rows[0]!.subgroupName,
            }));

      for (const variant of variants) {
        const members = [...base, ...variant.subgroup];
        if (members.length === 0) continue;
        const open = members.every((member) => !member.blocked && member.free > 0);
        if (onlyOpen && !open) continue;
        const slots = mergeSlots(
          members.map(slotOf).filter((slot): slot is ScheduleSlot => slot !== null),
        );
        if (slots.length === 0) continue;
        candidates.push({
          courseId,
          courseCode: head.courseCode,
          courseName: head.courseName,
          groupId,
          groupName: head.groupName,
          subgroupId: variant.id,
          subgroupName: variant.name,
          label: [`Lecture ${head.groupName}`, variant.name ? `Section ${variant.name}` : null]
            .filter(Boolean)
            .join(" + "),
          slots,
          free: Math.min(...members.map((member) => member.free)),
          open,
        });
      }
    }
    if (candidates.length) result.set(courseId, candidates);
  }
  return result;
}

export function scheduleMetrics(picks: readonly GroupCandidate[]): ScheduleMetrics {
  const byDay = new Map<number, ScheduleSlot[]>();
  for (const pick of picks) {
    for (const slot of pick.slots) {
      const list = byDay.get(slot.day);
      if (list) list.push(slot);
      else byDay.set(slot.day, [slot]);
    }
  }

  let gapMinutes = 0;
  let campusMinutes = 0;
  let conflicts = 0;
  for (const slots of byDay.values()) {
    const sorted = [...slots].sort((a, b) => a.start - b.start || a.end - b.end);
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1]!;
      const current = sorted[index]!;
      if (current.start < previous.end) conflicts += 1;
      else gapMinutes += current.start - previous.end;
    }
    const first = sorted[0]!;
    const last = sorted.reduce((max, slot) => (slot.end > max.end ? slot : max), first);
    campusMinutes += Math.max(0, last.end - first.start);
  }

  const days = [...byDay.keys()].sort((a, b) => a - b);
  const idleDays = days.length ? days[days.length - 1]! - days[0]! + 1 - days.length : 0;
  return {
    days: days.length,
    idleDays,
    gapMinutes,
    campusMinutes,
    conflicts,
    dayNames: days.map(dayLabel),
  };
}

function cost(picks: readonly GroupCandidate[]): number {
  const metrics = scheduleMetrics(picks);
  const closed = picks.filter((pick) => !pick.open).length;
  const seats = picks.reduce((sum, pick) => sum + Math.min(pick.free, 20), 0);
  return (
    metrics.conflicts * WEIGHT.conflict +
    metrics.days * WEIGHT.day +
    metrics.idleDays * WEIGHT.idleDay +
    metrics.gapMinutes * WEIGHT.gapMinute +
    metrics.campusMinutes * WEIGHT.campusMinute +
    closed * WEIGHT.closed -
    seats * WEIGHT.seat
  );
}

/** Picks the best group per course; deterministic for a given offer. */
export function recommendSchedule(
  options: readonly RegistrationOption[],
  settings: { courseIds?: readonly string[] | undefined; onlyOpen?: boolean | undefined } = {},
): ScheduleRecommendation {
  const all = buildCandidates(options, settings.onlyOpen ?? false);
  const wanted = settings.courseIds?.length ? new Set(settings.courseIds) : null;

  const skipped: ScheduleRecommendation["skipped"] = [];
  const seenCourses = new Set<string>();
  for (const option of options) {
    if (seenCourses.has(option.courseId)) continue;
    seenCourses.add(option.courseId);
    if (wanted && !wanted.has(option.courseId)) continue;
    if (!all.has(option.courseId)) {
      skipped.push({
        courseId: option.courseId,
        courseName: option.courseCode ?? option.courseName,
        reason: settings.onlyOpen ? "لا يوجد جروب مفتوح بمواعيد معلنة" : "لا توجد مواعيد معلنة",
      });
    }
  }

  const groups = [...all.entries()]
    .filter(([courseId]) => !wanted || wanted.has(courseId))
    // Fewest choices first: it prunes the search space fastest.
    .sort((a, b) => a[1].length - b[1].length)
    .map(([, candidates]) =>
      [...candidates].sort((a, b) => a.slots.length - b.slots.length || b.free - a.free),
    );

  if (groups.length === 0) {
    return { picks: [], metrics: scheduleMetrics([]), skipped, exact: true };
  }

  const space = groups.reduce((product, list) => product * list.length, 1);
  const exact = space <= EXACT_LIMIT && Number.isFinite(space);

  let best: GroupCandidate[] | null = null;
  let bestCost = Number.POSITIVE_INFINITY;

  if (exact) {
    const current: GroupCandidate[] = [];
    const walk = (index: number) => {
      if (index === groups.length) {
        const value = cost(current);
        if (value < bestCost) {
          bestCost = value;
          best = [...current];
        }
        return;
      }
      // Partial cost is a usable bound: days, idle days and conflicts can only
      // grow as more meetings are added.
      const bound = cost(current) - current.length * WEIGHT.seat * 20;
      if (bound >= bestCost) return;
      for (const candidate of groups[index]!) {
        current.push(candidate);
        walk(index + 1);
        current.pop();
      }
    };
    walk(0);
  } else {
    let beam: GroupCandidate[][] = [[]];
    for (const list of groups) {
      const next: GroupCandidate[][] = [];
      for (const partial of beam) {
        for (const candidate of list) next.push([...partial, candidate]);
      }
      next.sort((a, b) => cost(a) - cost(b));
      beam = next.slice(0, BEAM_WIDTH);
    }
    best = beam[0] ?? null;
    if (best) bestCost = cost(best);
  }

  const picks = (best ?? []).slice().sort((a, b) => {
    const dayA = Math.min(...a.slots.map((slot) => slot.day));
    const dayB = Math.min(...b.slots.map((slot) => slot.day));
    if (dayA !== dayB) return dayA - dayB;
    return (
      Math.min(...a.slots.map((slot) => slot.start)) -
      Math.min(...b.slots.map((slot) => slot.start))
    );
  });

  return { picks, metrics: scheduleMetrics(picks), skipped, exact };
}

function clock(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = `${minutes % 60}`.padStart(2, "0");
  const suffix = hour < 12 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${minute} ${suffix}`;
}

/** Arabic plain-text timetable, used by the assistant and Telegram. */
export function formatRecommendation(result: ScheduleRecommendation): string {
  if (result.picks.length === 0) return "مفيش مواعيد معلنة كفاية لبناء جدول مقترح.";

  const rows: { day: number; start: number; text: string }[] = [];
  for (const pick of result.picks) {
    for (const slot of pick.slots) {
      rows.push({
        day: slot.day,
        start: slot.start,
        text: `${clock(slot.start)}–${clock(slot.end)} • ${pick.courseCode ?? pick.courseName} • ${pick.label}${pick.open ? "" : " (مقفول حاليًا)"}`,
      });
    }
  }
  rows.sort((a, b) => a.day - b.day || a.start - b.start);

  const lines: string[] = [];
  let currentDay: number | null = null;
  for (const row of rows) {
    if (row.day !== currentDay) {
      currentDay = row.day;
      lines.push(`\n📅 ${dayLabel(row.day)}`);
    }
    lines.push(`  • ${row.text}`);
  }

  const hours = (minutes: number) => `${Math.floor(minutes / 60)}س ${minutes % 60}د`;
  const summary = [
    `أيام الحضور: ${result.metrics.days} (${result.metrics.dayNames.join("، ")})`,
    result.metrics.idleDays > 0
      ? `أيام فاضية بين الأيام: ${result.metrics.idleDays}`
      : "الأيام كلها ورا بعض ✅",
    `إجمالي الانتظار بين المحاضرات: ${hours(result.metrics.gapMinutes)}`,
    `إجمالي الوقت في الكلية: ${hours(result.metrics.campusMinutes)}`,
    result.metrics.conflicts > 0 ? `⚠️ تعارضات: ${result.metrics.conflicts}` : "لا يوجد تعارض ✅",
  ];
  if (result.skipped.length) {
    summary.push(
      `مواد من غير مواعيد: ${result.skipped.map((course) => course.courseName).join("، ")}`,
    );
  }

  return [...summary, ...lines].join("\n");
}
