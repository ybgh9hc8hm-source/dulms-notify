/** Human-readable Arabic labels for every item kind we notify about. */
import { scoreText } from "./message-format";

const KIND_LABEL: Record<string, string> = {
  quiz: "كويز جديد",
  assignment: "تكليف جديد",
  schedule: "تحديث في الجدول",
  absence: "غياب جديد",
  notice: "تنبيه من DULMS",
  event: "حدث جديد في التقويم",
  announcement: "إعلان جديد",
  gradebook: "درجة في دفتر الدرجات",
  finalResult: "نتيجة نهائية",
  warning: "إنذار جديد",
  exam: "امتحان إلكتروني جديد",
  registration: "تحديث في تسجيل المواد",
  courseOffer: "مادة فتحت للتسجيل",
  other: "تحديث جديد",
};

function labelFor(kind: string): string {
  return KIND_LABEL[kind] ?? "تحديث جديد";
}

export function notificationTitle(kind: string, title: string): string {
  return `${labelFor(kind)}: ${title}`;
}

export function notificationBody(parts: {
  course?: string | null;
  status?: string | null;
  score?: string | null;
  dueAt?: string | null;
}): string {
  return [
    parts.course,
    parts.status,
    parts.score ? scoreText(parts.score) : null,
    parts.dueAt ? `الموعد: ${parts.dueAt}` : null,
  ]
    .filter(Boolean)
    .join(" • ");
}

/** Wording for an *update* to an item the student already knows about. */
const UPDATE_LABEL: Record<string, string> = {
  gradebook: "تحديث في الدرجة",
  finalResult: "تحديث في النتيجة النهائية",
  absence: "تحديث في الغياب",
  attendance: "تحديث في سجل الحضور",
  assignment: "تحديث في تكليف",
  quiz: "تحديث في كويز",
  notice: "تحديث في تنبيه",
  exam: "تحديث في امتحان",
  registration: "تحديث في باب التسجيل",
  courseOffer: "تحديث في مادة متاحة للتسجيل",
};

function updateLabelFor(kind: string, fields: readonly string[] = []): string {
  if (fields.includes("score") && /^(gradebook|grade|result|finalResult)$/.test(kind)) {
    return "تحديث في الدرجة";
  }
  return UPDATE_LABEL[kind] ?? "تحديث في عنصر";
}

export function updateTitle(kind: string, title: string, fields: readonly string[] = []): string {
  return `${updateLabelFor(kind, fields)}: ${title}`;
}
