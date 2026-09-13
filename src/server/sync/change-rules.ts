/**
 * Which field changes on an *already tracked* item deserve a notification.
 *
 * The full pull used to notify only on brand-new external keys, so an edited
 * grade or a new absence counter landed in the database silently. This module
 * decides — per kind — which diffs are meaningful to a student and which are
 * bookkeeping noise.
 *
 * It deliberately reuses the exact same normalisation helpers as the
 * diff/upsert decision (`sameInstant`, `canonicalJson`) so a formatting
 * artifact can never be mistaken for a real change.
 */
import type { ScrapedItem } from "../dulms.server";
import { REMOVED_KINDS } from "../dulms/parse";
import { canonicalJson, sameInstant } from "./diff";

export interface StoredRow {
  kind: string;
  external_key: string;
  title: string;
  status: string | null;
  score: string | null;
  due_at: string | null;
  extra: unknown;
  archived_at?: string | null;
}

export type ChangeField = "score" | "status" | "dueAt" | "title" | "extra";

export interface NotifiableChange {
  item: ScrapedItem;
  fields: ChangeField[];
  /** Lower sorts first. Grades are the most urgent thing a student can miss. */
  priority: number;
}

/** Extra keys that move on their own and never mean anything to a student. */
const IGNORED_EXTRA_KEYS: Record<string, readonly string[]> = {
  // "النوع" (lecture vs section) is a display label derived from the row, not news.
  absence: ["مصدر الرصد", "النوع"],
  attendance: ["مصدر الرصد", "النوع"],
  schedule: ["النوع"],
};

/** Fields that trigger a notification, per kind. `null` = notify on anything. */
const RULES: Record<string, readonly ChangeField[] | null> = {
  // Highest priority: a grade moved.
  gradebook: ["score"],
  finalResult: ["score", "status", "extra"],

  // Attendance counters live in status/score/extra.
  absence: ["status", "score", "extra"],
  attendance: ["status", "score", "extra"],

  // Coursework: state or grade or deadline.
  assignment: ["status", "score", "dueAt"],
  quiz: ["status", "score", "dueAt"],

  // Money: balance and payment state.

  // Room / time / day moves — the label refinement alone is not news.
  schedule: ["title", "status"],

  // Windows opening/closing.
  notice: ["title", "status"],

  // File replaced under the same key.
};

/** A closed assignment/quiz being described more precisely is not news. */
function isClosedRefinement(kind: string, before: string, after: string): boolean {
  if (kind !== "assignment" && kind !== "quiz") return false;
  return before.startsWith("انتهى") && after.startsWith("انتهى");
}

function normText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function extraWithout(value: unknown, ignored: readonly string[]): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return canonicalJson(value);
  const source = value as Record<string, unknown>;
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(source)) if (!ignored.includes(key)) copy[key] = source[key];
  return canonicalJson(copy);
}

function priorityOf(kind: string, fields: readonly ChangeField[]): number {
  if (/^(gradebook|grade|result|finalResult)$/.test(kind) && fields.includes("score")) return 0;
  if (kind === "gpa") return 1;
  if (/^(absence|attendance)$/.test(kind)) return 2;
  if (/^(assignment|quiz|exam|onlineExam|question)$/.test(kind)) return 3;
  if (/^(finance|payment)$/.test(kind)) return 4;
  return 5;
}

/** All real field diffs between a stored row and its freshly scraped version. */
function diffFields(row: StoredRow, item: ScrapedItem): ChangeField[] {
  const ignored = IGNORED_EXTRA_KEYS[item.kind] ?? [];
  const fields: ChangeField[] = [];
  if (normText(row.title) !== normText(item.title)) fields.push("title");
  if (normText(row.status) !== normText(item.status)) fields.push("status");
  if (normText(row.score) !== normText(item.score)) fields.push("score");
  if (!sameInstant(row.due_at, item.dueAt)) fields.push("dueAt");
  if (extraWithout(row.extra, ignored) !== extraWithout(item.extra, ignored)) fields.push("extra");
  return fields;
}

/**
 * Returns the notifiable change for one item, or null when the diff is
 * cosmetic for that kind (or there is no diff at all).
 */
export function notifiableChange(row: StoredRow, item: ScrapedItem): NotifiableChange | null {
  // `exam` is retired globally but re-enabled for beta accounts (see exam-beta.ts),
  // so items that reached storage are allowed to notify.
  if (item.kind !== "exam" && REMOVED_KINDS.has(item.kind)) return null;
  const fields = diffFields(row, item);
  if (fields.length === 0) return null;

  const rule = item.kind in RULES ? RULES[item.kind] : null; // unknown kind → notify on any change
  let relevant =
    rule === null || rule === undefined ? fields : fields.filter((f) => rule.includes(f));
  if (isClosedRefinement(item.kind, normText(row.status), normText(item.status))) {
    relevant = relevant.filter((f) => f !== "status");
  }
  if (relevant.length === 0) return null;

  return { item, fields: relevant, priority: priorityOf(item.kind, relevant) };
}
