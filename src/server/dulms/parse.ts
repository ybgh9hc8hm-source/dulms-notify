/** Pure value/row helpers shared by every DULMS mapper. */
import type { ItemKind, Row, ScrapedItem } from "./types";

export function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return str(value[0]);
  const text = String(value)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .trim();
  return text.length ? text : null;
}

export function join(...parts: (string | null | undefined)[]): string | null {
  const list = parts.filter((p) => p && p.length) as string[];
  return list.length ? list.join(" • ") : null;
}

/** DULMS also writes dates as "04-07-2026 12:00 AM". */
export function toIsoLoose(value: unknown): string | null {
  const text = str(value);
  if (!text) return null;
  const dmy = text.match(/^(\d{2})-(\d{2})-(\d{4})(.*)$/);
  if (dmy) return toIso(`${dmy[3]}-${dmy[2]}-${dmy[1]}${dmy[4] ?? ""}`);
  return toIso(text);
}

export function arrayOf(row: Row | null, key: string): Row[] {
  const value = row?.[key];
  return Array.isArray(value) ? (value as Row[]) : [];
}

const CAIRO_TZ = "Africa/Cairo";

/** Offset (minutes) of Africa/Cairo at a given UTC instant — handles Egypt DST. */
function cairoOffsetMinutes(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CAIRO_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - utcMs) / 60_000);
}

/** Treat naive wall-clock components as Africa/Cairo local time. */
function cairoWallClockToIso(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
): string {
  const naive = Date.UTC(y, mo - 1, d, h, mi, s);
  let utc = naive - cairoOffsetMinutes(naive) * 60_000;
  utc = naive - cairoOffsetMinutes(utc) * 60_000;
  return new Date(utc).toISOString();
}

/** "Aug 8, 2026 at 10:45 PM" and "/Date(1785960865140)/" both show up. */
export function toIso(value: unknown): string | null {
  if (typeof value === "number") return new Date(value).toISOString();
  if (typeof value !== "string" || !value.trim()) return null;
  const dotnet = value.match(/\/Date\((-?\d+)\)\//);
  if (dotnet) return new Date(Number(dotnet[1])).toISOString();
  const cleaned = value
    .replace(/\bat\b/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const parsed = new Date(cleaned);
  if (Number.isNaN(parsed.getTime())) return null;

  // DULMS emits local Cairo wall-clock times without any zone marker; the worker
  // runs in UTC, so re-anchor those to Africa/Cairo instead of shifting them.
  const hasZone = /(?:Z|GMT|UTC|[+-]\d{2}:?\d{2})\s*$/i.test(cleaned);
  if (hasZone) return parsed.toISOString();
  return cairoWallClockToIso(
    parsed.getFullYear(),
    parsed.getMonth() + 1,
    parsed.getDate(),
    parsed.getHours(),
    parsed.getMinutes(),
    parsed.getSeconds(),
  );
}

export function courseLabel(code?: string | null, name?: string | null): string | null {
  const parts = [code, name].filter((v) => v && String(v).trim().length > 0);
  return parts.length ? parts.join(" — ") : null;
}

export function gradeText(grade: unknown, max: unknown): string | null {
  if (grade === null || grade === undefined || grade === "") return null;
  return max ? `${grade} / ${max}` : String(grade);
}
export function num(value: unknown): number | null {
  const text = str(value);
  if (!text) return null;
  const parsed = Number(text.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}
/** Categories permanently retired by the operator: never stored or notified. */
export const REMOVED_KINDS: ReadonlySet<string> = new Set([
  "profile",
  "onlineExam",
  "document",
  "desire",
  "spec",
  "plan",
  "result",
  "gpa",
  "payment",
  "finance",
  // "registration" أُعيدت بطلب المستخدم: باب التسجيل والمواد المتاحة.
  "proposal",
  // متوقفة عمدًا: تستهلك طلبات كتير وقيمتها للطالب ضعيفة كإشعار.
  "question",
  "course",
  "message",
  "questionnaire",
  "grade",
  "material",
  "exam",
  "discussion",
  "meeting",
]);

export function push(items: ScrapedItem[], item: ScrapedItem) {
  if (!item.title || !item.title.trim()) return;
  if (REMOVED_KINDS.has(item.kind)) return;
  items.push(item);
}

/** Fallback mapper for endpoints whose exact columns we can't rely on. */
export function generic(kind: ItemKind, prefix: string, rows: Row[]): ScrapedItem[] {
  return rows.flatMap((row, index) => {
    const entries = Object.entries(row).filter(
      ([, v]) => v !== null && v !== undefined && typeof v !== "object",
    );
    const idEntry = entries.find(([k]) => /id$/i.test(k) && typeof row[k] === "number");
    const titleEntry =
      entries.find(
        ([k, v]) => typeof v === "string" && /name|title|subject|text|explain|reason/i.test(k),
      ) ?? entries.find(([, v]) => typeof v === "string" && String(v).length > 2);
    const title = str(titleEntry?.[1]) ?? `${prefix} ${index + 1}`;
    const dateEntry = entries.find(([k]) => /date/i.test(k));
    const extra: Record<string, string> = {};
    for (const [k, v] of entries.slice(0, 10)) {
      if (k === titleEntry?.[0]) continue;
      const text = str(v);
      if (text) extra[k] = text.slice(0, 120);
    }
    return [
      {
        kind,
        externalKey:
          `${prefix}-${idEntry ? String(idEntry[1]) : `${index}-${title}`}`.toLowerCase(),
        course: null,
        title,
        dueAt: dateEntry ? toIsoLoose(dateEntry[1]) : null,
        status: null,
        score: null,
        extra,
      } satisfies ScrapedItem,
    ];
  });
}
