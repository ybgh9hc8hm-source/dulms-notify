import { notifiableChange } from "@/server/sync/change-rules";
import { expect, test } from "vitest";
type Partialish = Record<string, unknown> & { kind: string };

const base = (o: Partialish) => ({
  kind: o.kind,
  external_key: "k",
  title: (o["title"] as never) ?? "t",
  status: (o["status"] as never) ?? null,
  score: (o["score"] as never) ?? null,
  due_at: (o["due_at"] as never) ?? null,
  extra: (o["extra"] as never) ?? {},
});
const it_ = (o: Partialish) =>
  ({
    kind: o.kind,
    externalKey: "k",
    course: null,
    title: (o["title"] as never) ?? "t",
    dueAt: (o["dueAt"] as never) ?? null,
    status: (o["status"] as never) ?? null,
    score: (o["score"] as never) ?? null,
    extra: (o["extra"] as never) ?? {},
  }) as never;
test("grade score change notifies, priority 0", () => {
  const c = notifiableChange(
    base({ kind: "gradebook", score: "5 / 10" }),
    it_({ kind: "gradebook", score: "8 / 10" }),
  );
  expect(c?.priority).toBe(0);
  expect(c?.fields).toContain("score");
});
test("absence counter change notifies", () => {
  const c = notifiableChange(
    base({ kind: "attendance", status: "لا يوجد غياب حتى الآن", extra: { "محاضرات غياب": "0" } }),
    it_({ kind: "attendance", status: "غياب 1 من 5", extra: { "محاضرات غياب": "1" } }),
  );
  expect(c).not.toBeNull();
});
test("absence cosmetic source change silent", () => {
  const c = notifiableChange(
    base({ kind: "absence", status: "غياب", extra: { "مصدر الرصد": "a" } }),
    it_({ kind: "absence", status: "غياب", extra: { "مصدر الرصد": "b" } }),
  );
  expect(c).toBeNull();
});
test("date format artifact silent", () => {
  const c = notifiableChange(
    base({ kind: "assignment", due_at: "2026-07-22T00:00:00+00:00", extra: { a: "1", b: "2" } }),
    it_({ kind: "assignment", dueAt: "2026-07-22T00:00:00.000Z", extra: { b: "2", a: "1" } }),
  );
  expect(c).toBeNull();
});
test("gradebook status-only change silent", () => {
  const c = notifiableChange(
    base({ kind: "gradebook", status: "كويز • بانتظار الرصد", score: "—" }),
    it_({ kind: "gradebook", status: "كويز • تم الرصد", score: "—" }),
  );
  expect(c).toBeNull();
});
test("unknown kind falls back to any change", () => {
  const c = notifiableChange(
    base({ kind: "weirdkind", title: "a" }),
    it_({ kind: "weirdkind", title: "b" }),
  );
  expect(c).not.toBeNull();
});
