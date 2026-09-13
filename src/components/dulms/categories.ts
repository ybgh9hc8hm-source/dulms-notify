import {
  BellRing,
  Calculator,
  BookOpenCheck,
  CalendarClock,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  GraduationCap,
  ListChecks,
  Megaphone,
  Trophy,
  UserX,
} from "lucide-react";

import type { GroupMode } from "./item-types";

export interface Category {
  id: string;
  labelKey: string;
  icon: typeof ListChecks;
  kinds: string[];
  groupBy: GroupMode;
  emptyKey: string;
  /** Trial category: hidden in the sidebar until it has data. */
  betaOnly?: boolean;
}

export const CATEGORIES: Category[] = [
  {
    id: "exams",
    labelKey: "cat.exams",
    icon: GraduationCap,
    kinds: ["exam"],
    groupBy: "course",
    emptyKey: "cat.exams.empty",
    betaOnly: true,
  },
  {
    id: "quizzes",
    labelKey: "cat.quizzes",
    icon: ListChecks,
    kinds: ["quiz"],
    groupBy: "course",
    emptyKey: "cat.quizzes.empty",
  },

  {
    id: "assignments",
    labelKey: "cat.assignments",
    icon: BookOpenCheck,
    kinds: ["assignment"],
    groupBy: "course",
    emptyKey: "cat.assignments.empty",
  },

  {
    id: "gradebook",
    labelKey: "cat.gradebook",
    icon: ClipboardList,
    kinds: ["gradebook"],
    groupBy: "course",
    emptyKey: "cat.gradebook.empty",
  },
  {
    id: "gpa",
    labelKey: "cat.gpa",
    icon: Calculator,
    kinds: [],
    groupBy: "none",
    emptyKey: "cat.gpa",
  },
  {
    id: "finalResult",
    labelKey: "cat.finalResult",
    icon: Trophy,
    kinds: ["finalResult"],
    groupBy: "none",
    emptyKey: "cat.finalResult.empty",
  },
  {
    id: "schedule",
    labelKey: "cat.schedule",
    icon: CalendarClock,
    kinds: ["schedule"],
    groupBy: "none",
    emptyKey: "cat.schedule.empty",
  },
  {
    id: "absence",
    labelKey: "cat.absence",
    icon: UserX,
    kinds: ["absence"],
    groupBy: "course",
    emptyKey: "cat.absence.empty",
  },
  {
    id: "attendance",
    labelKey: "cat.attendance",
    icon: CalendarCheck,
    kinds: ["attendance"],
    groupBy: "none",
    emptyKey: "cat.attendance.empty",
  },
  {
    id: "warnings",
    labelKey: "cat.warnings",
    icon: BellRing,
    kinds: ["warning"],
    groupBy: "course",
    emptyKey: "cat.warnings.empty",
  },
  {
    id: "announcements",
    labelKey: "cat.announcements",
    icon: Megaphone,
    kinds: ["announcement", "notice"],
    groupBy: "none",
    emptyKey: "cat.announcements.empty",
  },
  {
    id: "registration",
    labelKey: "cat.registration",
    icon: CalendarClock,
    kinds: ["registration", "courseOffer"],
    groupBy: "none",
    emptyKey: "cat.registration.empty",
  },
  {
    id: "events",
    labelKey: "cat.events",
    icon: CalendarDays,
    kinds: ["event"],
    groupBy: "none",
    emptyKey: "cat.events.empty",
  },
];

/** Collapsible sidebar sections, ordered by day-to-day priority. */
export const CATEGORY_GROUPS: {
  id: string;
  labelKey: string;
  icon: typeof ListChecks;
  items: string[];
}[] = [
  {
    id: "elearning",
    labelKey: "nav.group.elearning",
    icon: BookOpenCheck,
    items: ["exams", "quizzes", "assignments"],
  },
  {
    id: "grades",
    labelKey: "nav.group.grades",
    icon: Trophy,
    items: ["gradebook", "finalResult", "gpa"],
  },
  {
    id: "attendance",
    labelKey: "nav.group.attendance",
    icon: CalendarCheck,
    items: ["absence", "warnings", "attendance"],
  },
  {
    id: "comm",
    labelKey: "nav.group.comm",
    icon: Megaphone,
    items: ["events", "announcements", "alerts"],
  },
  {
    id: "academicReg",
    labelKey: "nav.group.academicReg",
    icon: CalendarClock,
    items: ["schedule", "registration"],
  },
];
