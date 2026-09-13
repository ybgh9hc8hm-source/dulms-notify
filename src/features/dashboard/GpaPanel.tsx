/**
 * GPA page — deliberately simple. One screen answers three questions:
 * 1) Where do I stand? 2) What do I need to reach my goal? 3) My terms.
 * Advanced tools live behind one collapsed "More tools" section.
 */
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ItemRow } from "@/components/dulms/item-types";
import type { StudentProfile } from "@/components/dulms/StudentHero";
import {
  fmtGpa,
  gpaBand,
  gradePoints,
  GRADE_SCALE,
  planForTarget,
  simulate,
  type PlannedCourse,
} from "@/lib/gpa";
import {
  buildSemesters,
  forecastGraduation,
  retakeRanking,
  semesterOrder,
  type RawResultRow,
} from "@/lib/gpa-analysis";
import { useI18n } from "@/lib/i18n";

interface Props {
  profile: StudentProfile | null;
  items: readonly ItemRow[];
}

function num(value: unknown): number | null {
  const parsed = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function extraOf(item: ItemRow): Record<string, string> {
  return (item.extra ?? {}) as Record<string, string>;
}

function knownHoursMap(items: readonly ItemRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    if (item.kind !== "courseOffer") continue;
    const hours = num(extraOf(item)["الساعات المعتمدة"] ?? item.score);
    const code = (item.title ?? "").trim().toUpperCase();
    if (code && hours) map.set(code, hours);
  }
  return map;
}

function resultRows(items: readonly ItemRow[], profile: StudentProfile | null): RawResultRow[] {
  const history = new Map(
    (profile?.gpaHistory ?? []).map((entry) => [entry.semester, entry] as const),
  );
  const rows: RawResultRow[] = [];
  for (const item of items) {
    if (item.kind !== "finalResult") continue;
    const extra = extraOf(item);
    const semester = extra["الفصل"];
    const letter = (item.score ?? "").trim();
    if (!semester || gradePoints(letter) === null) continue;
    const entry = history.get(semester);
    const code = /^[A-Za-z]{2,4}\s?\d{2,4}/.exec((item.course ?? "").trim())?.[0];
    rows.push({
      code: code?.replace(/\s+/g, "") || null,
      name: item.title,
      letter,
      semester,
      sgpa: entry?.sgpa ?? num(extra["معدل الفصل SGPA"]),
      cgpa: entry?.cgpa ?? null,
    });
  }
  return rows;
}

function seedCourses(items: readonly ItemRow[]): PlannedCourse[] {
  const offers = items
    .filter((item) => item.kind === "courseOffer")
    .slice(0, 6)
    .map((item, index) => ({
      id: `offer-${index}`,
      name: item.course ?? item.title,
      hours: num(extraOf(item)["الساعات المعتمدة"] ?? item.score) ?? 3,
      letter: "B",
    }));
  if (offers.length) return offers;
  return [1, 2, 3].map((n) => ({ id: `row-${n}`, name: "", hours: 3, letter: "B" }));
}

export function GpaPanel({ profile, items }: Props) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const T = (a: string, e: string) => (ar ? a : e);

  const cgpa = num(profile?.cgpa);
  const passed = profile?.passedHours ?? null;
  const required = profile?.requiredHours ?? null;
  const band = cgpa !== null ? gpaBand(cgpa) : null;

  const semesters = useMemo(
    () => buildSemesters(resultRows(items, profile), passed, knownHoursMap(items)),
    [items, profile, passed],
  );
  const terms = useMemo(() => {
    const detailed = new Map(semesters.map((s) => [s.semester, s] as const));
    const labels = new Set([
      ...(profile?.gpaHistory ?? []).map((entry) => entry.semester),
      ...semesters.map((s) => s.semester),
    ]);
    return [...labels]
      .map((label) => {
        const entry = (profile?.gpaHistory ?? []).find((row) => row.semester === label);
        const record = detailed.get(label);
        return {
          label,
          sgpa: record?.sgpa ?? entry?.sgpa ?? null,
          cgpa: record?.cgpa ?? entry?.cgpa ?? null,
          courses: record?.courses ?? [],
        };
      })
      .sort((a, b) => semesterOrder(a.label) - semesterOrder(b.label));
  }, [semesters, profile]);

  const [target, setTarget] = useState("3");
  const courseSeed = useMemo(() => seedCourses(items), [items]);
  const [courses, setCourses] = useState<PlannedCourse[]>(courseSeed);
  useEffect(() => {
    setCourses(courseSeed);
  }, [courseSeed]);
  const plan = planForTarget(
    Number(target),
    required ? Math.max(required - (passed ?? 0), 1) : 18,
    cgpa,
    passed,
  );

  const [moreOpen, setMoreOpen] = useState(true);
  const sim = simulate(courses, cgpa, passed);
  const retakes = useMemo(
    () => retakeRanking(semesters, cgpa, passed).slice(0, 5),
    [semesters, cgpa, passed],
  );
  const forecast = forecastGraduation(cgpa, passed, required, 15, 3);
  const update = (id: string, patch: Partial<PlannedCourse>) =>
    setCourses((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const progressPct =
    passed !== null && required ? Math.min(100, Math.round((passed / required) * 100)) : null;

  return (
    <section className="mx-auto max-w-xl space-y-4">
      {/* 1 — Where do I stand */}
      <div className="card-elevated p-5 text-center">
        <p className="text-sm text-muted-foreground">{T("معدلك التراكمي", "Your CGPA")}</p>
        <p className="mt-1 text-5xl font-bold text-primary">{fmtGpa(cgpa)}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {band ? (ar ? band.ar : band.en) : "—"} · {T("من 4", "of 4")}
        </p>
        {progressPct !== null && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{T("ساعاتك نحو التخرج", "Hours to graduation")}</span>
              <span>
                {passed} / {required} ({progressPct}%)
              </span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full bg-primary" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* 2 — Simulator & repeats (the part in the screenshot) */}
      <div className="card-elevated overflow-hidden">
        <button
          type="button"
          onClick={() => setMoreOpen((open) => !open)}
          className="flex w-full items-center justify-between p-4 text-sm font-semibold"
        >
          {T("أدوات أكتر: محاكاة وإعادة مواد", "More tools: simulator & repeats")}
          <ChevronDown className={`size-4 transition-transform ${moreOpen ? "rotate-180" : ""}`} />
        </button>

        {moreOpen && (
          <div className="space-y-5 border-t border-border/60 p-4">
            {/* Simulator */}
            <div>
              <p className="text-sm font-medium">{T("جرّب الفصل الجاي", "Try next term")}</p>
              <div className="mt-2 space-y-2">
                {courses.map((row) => (
                  <div key={row.id} className="flex items-center gap-2">
                    <Input
                      className="min-w-0 flex-1"
                      value={row.name}
                      placeholder={T("المادة", "Course")}
                      onChange={(e) => update(row.id, { name: e.target.value })}
                    />
                    <select
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      value={row.letter}
                      onChange={(e) => update(row.id, { letter: e.target.value })}
                      aria-label={T("التقدير", "Grade")}
                    >
                      {GRADE_SCALE.map((grade) => (
                        <option key={grade.letter} value={grade.letter}>
                          {grade.letter}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={T("حذف", "Remove")}
                      onClick={() => setCourses((rows) => rows.filter((r) => r.id !== row.id))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={() =>
                  setCourses((rows) => [
                    ...rows,
                    { id: `row-${Date.now()}`, name: "", hours: 3, letter: "B" },
                  ])
                }
              >
                <Plus className="size-4" /> {T("مادة", "Add")}
              </Button>
              <p className="mt-3 rounded-lg bg-muted/50 p-3 text-sm">
                {T("معدل الفصل", "Term")}: <b>{fmtGpa(sim.sgpa)}</b> ·{" "}
                {T("التراكمي الجديد", "New CGPA")}:{" "}
                <b className="text-primary">{fmtGpa(sim.cgpa)}</b>
              </p>
            </div>

            {/* Retakes */}
            {retakes.length > 0 && (
              <div>
                <p className="text-sm font-medium">
                  {T("لو أعدت مادة دي هتكسب أكتر", "Repeats that pay off most")}
                </p>
                <div className="mt-2 space-y-1.5 text-sm">
                  {retakes.map((option) => (
                    <div
                      key={option.course.code ?? option.course.name}
                      className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2"
                    >
                      <span className="min-w-0 truncate">
                        {option.course.name}{" "}
                        <span className="text-xs text-muted-foreground">
                          ({option.course.letter})
                        </span>
                      </span>
                      <span className="shrink-0 text-xs">
                        <b className="text-primary">+{fmtGpa(option.gain)}</b>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Forecast */}
            {forecast && (
              <p className="rounded-lg bg-muted/50 p-3 text-sm">
                {T("لو مشيت بمعدل B، هتتخرج بعد", "At a B average you'll graduate in")}{" "}
                <b>{forecast.terms}</b> {T("فصول بمعدل", "terms with a CGPA of")}{" "}
                <b className="text-primary">{fmtGpa(forecast.projected)}</b>.
              </p>
            )}
          </div>
        )}
      </div>

      {/* 3 — Target calculator */}
      <div className="card-elevated p-5">
        <p className="font-semibold">{T("عايز توصل لكام؟", "What's your goal?")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {["2.5", "3", "3.5"].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTarget(value)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                target === value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {value}
            </button>
          ))}
          <Input
            type="number"
            step="0.1"
            min={0}
            max={4}
            className="h-8 w-20 rounded-full text-center"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            aria-label={T("هدف مخصص", "Custom goal")}
          />
        </div>
        <div className="mt-4 rounded-lg bg-muted/50 p-4 text-sm leading-7">
          {!plan ? (
            <p className="text-muted-foreground">{T("اختر هدفًا.", "Pick a goal.")}</p>
          ) : plan.alreadyReached ? (
            <p>{T("معدلك الحالي أعلى من الهدف ده بالفعل 🎉", "You already beat this goal 🎉")}</p>
          ) : plan.possible ? (
            <p>
              {T("عشان توصل لـ", "To reach")} <b>{target}</b>{" "}
              {T("في باقي ساعاتك، محتاج تاخد", "in your remaining hours, you need")}{" "}
              <b className="text-primary">
                {plan.requiredGrade ? plan.requiredGrade.letter : fmtGpa(plan.requiredSgpa)}
              </b>{" "}
              {T("في كل مادة تقريبًا.", "in almost every course.")}
            </p>
          ) : (
            <p>
              {T(
                "الهدف ده مش ممكن بالساعات المتبقية — أقصى حاجة تقدر توصلها",
                "This goal isn't reachable in your remaining hours — the best you can reach is",
              )}{" "}
              <b>{fmtGpa(plan.bestCgpa)}</b>
            </p>
          )}
        </div>
      </div>

      {/* 4 — My terms */}
      {terms.length > 0 && (
        <div className="card-elevated p-5">
          <p className="font-semibold">{T("فصولك", "Your terms")}</p>
          <div className="mt-3 space-y-3">
            {terms.map((term) => (
              <div key={term.label} className="rounded-lg bg-muted/50 p-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">{term.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {T("الفصل", "Term")} <b className="text-foreground">{fmtGpa(term.sgpa)}</b> ·{" "}
                    {T("التراكمي", "CGPA")} <b className="text-foreground">{fmtGpa(term.cgpa)}</b>
                  </span>
                </div>
                {term.courses.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {term.courses.map((course) => (
                      <div
                        key={`${term.label}-${course.code ?? course.name}`}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="min-w-0 truncate text-muted-foreground">
                          {course.name}
                        </span>
                        <b className="shrink-0">{course.letter}</b>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {T(
              "دالمز بيعرض مواد آخر فصل بس، فالفصول القديمة بتظهر بمعدلاتها الرسمية بس.",
              "DULMS only lists the latest term's courses, so older terms show their official averages only.",
            )}
          </p>
        </div>
      )}
    </section>
  );
}
