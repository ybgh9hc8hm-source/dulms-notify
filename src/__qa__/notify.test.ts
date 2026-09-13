import { describe, it, expect } from "vitest";
import { notifiableChange, type StoredRow } from "@/server/sync/change-rules";
import {
  formatMessage,
  formatBatch,
  categoryLabel,
  contextLine,
  detailLine,
  nowLine,
  sectionLabel,
} from "@/server/sync/message-format";
import { mapDulmsPageToSection } from "@/server/detect/sections";

const row = (o: Partial<StoredRow>): StoredRow => ({
  kind: "gradebook",
  external_key: "k1",
  title: "Midterm",
  status: null,
  score: null,
  due_at: null,
  extra: {},
  ...o,
});
const item = (o: Record<string, unknown>) =>
  ({
    kind: "gradebook",
    externalKey: "k1",
    course: "CS101",
    title: "Midterm",
    status: null,
    score: null,
    dueAt: null,
    extra: {},
    ...o,
  }) as never;

describe("edited items produce notifications", () => {
  it("grade edited (score changed)", () => {
    const c = notifiableChange(row({ score: "10/20" }), item({ score: "18/20" }));
    expect(c?.fields).toContain("score");
    expect(c?.priority).toBe(0);
  });
  it("grade added where there was none", () => {
    expect(notifiableChange(row({ score: null }), item({ score: "18/20" }))?.fields).toContain(
      "score",
    );
  });
  it("absence counter changed", () => {
    const c = notifiableChange(
      row({ kind: "absence", score: "2" }),
      item({ kind: "absence", score: "3" }),
    );
    expect(c).not.toBeNull();
  });
  it("absence noise field ignored", () => {
    const c = notifiableChange(
      row({ kind: "absence", extra: { "مصدر الرصد": "a" } }),
      item({ kind: "absence", extra: { "مصدر الرصد": "b" } }),
    );
    expect(c).toBeNull();
  });
  it("assignment status change", () => {
    expect(
      notifiableChange(
        row({ kind: "assignment", status: "لم يتم" }),
        item({ kind: "assignment", status: "تم التسليم" }),
      ),
    ).not.toBeNull();
  });
  it("assignment deadline change", () => {
    expect(
      notifiableChange(
        row({ kind: "assignment", due_at: "2026-09-01T10:00:00Z" }),
        item({ kind: "assignment", dueAt: "2026-09-05T10:00:00Z" }),
      ),
    ).not.toBeNull();
  });
  it("identical rows are silent", () => {
    expect(notifiableChange(row({ score: "18/20" }), item({ score: "18/20" }))).toBeNull();
  });
  it("formatting-only diff is silent", () => {
    expect(notifiableChange(row({ score: " 18/20 " }), item({ score: "18/20" }))).toBeNull();
  });
});

describe("message formatting", () => {
  const cfg = { showTime: true, header: null, footer: null, labels: {}, mutedKinds: [] };
  it("renders a complete grade message", () => {
    const msg = formatMessage(
      {
        category: categoryLabel("gradebook", cfg),
        context: contextLine("CS101", "Midterm 13:15"),
        detail: detailLine({ kind: "gradebook", score: "18/20", status: null, dueAt: null }),
        time: nowLine(),
      },
      cfg,
    );
    expect(msg).toContain("<b>Grades book</b>");
    expect(msg).toContain("Score: 18/20");
    expect(msg).toContain("1:15 PM"); // 24h rewritten
    expect(msg).not.toMatch(/undefined|null|NaN|\{\{|\}\}/);
    expect(msg).not.toMatch(/<blockquote>\s*<\/blockquote>/);
  });
  it("never emits empty placeholders when data is missing", () => {
    const msg = formatMessage(
      {
        category: categoryLabel("absence", cfg),
        context: contextLine(null, "غياب"),
        detail: detailLine({}),
        time: nowLine(),
      },
      cfg,
    );
    expect(msg).not.toMatch(/undefined|null|NaN/);
    expect(msg.split("\n").filter((l) => l.trim() === "")).toHaveLength(0);
  });
  it("batch summary counts per category", () => {
    const msg = formatBatch(["quiz", "quiz", "assignment"], "تحديثات جديدة", cfg);
    expect(msg).toContain("<b>Quizzes:</b> 2");
    expect(msg).toContain("<b>Assignments:</b> 1");
    expect(msg).toContain("3 updates");
  });
  it("escapes user content", () => {
    const msg = formatMessage(
      { category: "Grades book", context: contextLine("CS<1>", "a&b"), detail: null, time: null },
      cfg,
    );
    expect(msg).toContain("&lt;1&gt;");
    expect(msg).toContain("a&amp;b");
  });
  it("sentinel sections map to labelled sections", () => {
    expect(sectionLabel(mapDulmsPageToSection("/Grades/Index"))).toBeTruthy();
    expect(sectionLabel(mapDulmsPageToSection(null))).toBeTruthy();
  });
});
