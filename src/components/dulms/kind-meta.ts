import {
  BellRing,
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

const KIND_META: Record<string, { icon: typeof ListChecks }> = {
  quiz: { icon: ListChecks },
  assignment: { icon: BookOpenCheck },
  schedule: { icon: CalendarClock },
  absence: { icon: UserX },
  notice: { icon: BellRing },
  event: { icon: CalendarDays },
  announcement: { icon: Megaphone },
  gradebook: { icon: ClipboardList },
  finalResult: { icon: Trophy },
  attendance: { icon: CalendarCheck },
  warning: { icon: BellRing },
  exam: { icon: GraduationCap },
  registration: { icon: CalendarClock },
  courseOffer: { icon: BookOpenCheck },
  other: { icon: BellRing },
};

export function kindIcon(kind: string) {
  return (KIND_META[kind] ?? KIND_META["other"]!).icon;
}
