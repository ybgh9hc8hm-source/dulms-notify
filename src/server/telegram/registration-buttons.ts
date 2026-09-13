/**
 * Inline buttons that turn a "course registration is open" alert into a
 * one-tap choice: every offered group (with its day/time) is a button, and
 * tapping one starts a watch that registers immediately when the group is
 * open, or the moment it opens.
 */
import { registrationSelections, type RegistrationOption } from "../dulms/registration";
import type { TelegramButton } from "../telegram.server";

/** Telegram hard-caps callback_data at 64 bytes; DULMS ids are short numbers. */
export function watchCallbackData(option: {
  courseId: string;
  groupId: string;
  subgroupId: string;
}): string | null {
  const data = `rw:${option.courseId}:${option.groupId}:${option.subgroupId}`;
  return new TextEncoder().encode(data).length <= 64 ? data : null;
}

export function parseWatchCallbackData(
  data: string,
): { courseId: string; groupId: string; subgroupId: string } | null {
  if (!data.startsWith("rw:")) return null;
  const [, courseId, groupId, subgroupId = ""] = data.split(":");
  if (!courseId || !groupId) return null;
  return { courseId, groupId, subgroupId };
}

function buttonText(option: RegistrationOption): string {
  const seats = option.blocked ? "مغلق" : option.free > 0 ? `${option.free} مقعد` : "ممتلئ";
  const head = [option.courseCode ?? option.courseName, option.label].filter(Boolean).join(" — ");
  const text = `${head} • ${seats}`;
  return text.length > 62 ? `${text.slice(0, 61)}…` : text;
}

/** One button per group, open ones first, capped so Telegram accepts the markup. */
export function registrationChoiceKeyboard(
  options: readonly RegistrationOption[],
  limit = 24,
): TelegramButton[][] {
  const ranked = registrationSelections(options).sort((a, b) => {
    const openA = !a.blocked && a.free > 0 ? 0 : 1;
    const openB = !b.blocked && b.free > 0 ? 0 : 1;
    if (openA !== openB) return openA - openB;
    return (a.courseCode ?? a.courseName).localeCompare(b.courseCode ?? b.courseName);
  });

  const keyboard: TelegramButton[][] = [];
  for (const option of ranked) {
    if (keyboard.length >= limit) break;
    const data = watchCallbackData(option);
    if (!data) continue;
    keyboard.push([{ text: buttonText(option), callback_data: data }]);
  }
  return keyboard;
}
