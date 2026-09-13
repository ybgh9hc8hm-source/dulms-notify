import { useMemo } from "react";
import {
  Area,
  Bar,
  ComposedChart,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ItemRow } from "./item-types";
import { useI18n } from "@/lib/i18n";

/** Charts shown on top of a category page (GPA progress, program map). */
export function CategoryCharts({ categoryId, items }: { categoryId: string; items: ItemRow[] }) {
  return null;
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card-elevated mt-4 overflow-hidden p-4 sm:p-5">
      <h2 className="mb-3 text-sm font-bold">{title}</h2>
      {children}
    </section>
  );
}

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
  color: "var(--foreground)",
} as const;

/* ---------------------------------- GPA ---------------------------------- */

function parseGpa(score: string | null) {
  const c = /CGPA\s*([\d.]+)/i.exec(score ?? "")?.[1];
  const s = /SGPA\s*([\d.]+)/i.exec(score ?? "")?.[1];
  return { cgpa: c ? Number(c) : null, sgpa: s ? Number(s) : null };
}

function GpaChart({ items }: { items: ItemRow[] }) {
  const { lang } = useI18n();
  const ar = lang === "ar";

  const data = useMemo(() => {
    const seasonOrder: Record<string, number> = { fall: 0, winter: 1, spring: 2, summer: 3 };
    const rows = items
      .map((item) => {
        const { cgpa, sgpa } = parseGpa(item.score);
        const title = item.title ?? "";
        const year = Number(/\d{4}/.exec(title)?.[0] ?? 0);
        const season = /fall|spring|summer|winter/i.exec(title)?.[0]?.toLowerCase() ?? "";
        const shortTerm = title
          .replace(/(\d{4})\s*[-/]\s*(\d{4})/, "$2")
          .replace(/\s+/g, " ")
          .trim();
        return {
          term: shortTerm || title,
          cgpa,
          sgpa,
          sort: year * 10 + (seasonOrder[season] ?? 4),
        };
      })
      .filter((row) => row.cgpa !== null || row.sgpa !== null);
    return rows.sort((a, b) => a.sort - b.sort);
  }, [items]);

  if (data.length === 0) return null;

  const last = data[data.length - 1]!;

  return (
    <ChartCard title={ar ? "تطور المعدل التراكمي" : "GPA progression"}>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Stat label={ar ? "المعدل التراكمي" : "CGPA"} value={last.cgpa?.toFixed(3) ?? "—"} />
        <Stat label={ar ? "معدل الفصل" : "SGPA"} value={last.sgpa?.toFixed(3) ?? "—"} />
      </div>
      <div className="h-64 w-full" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: -18 }}>
            <defs>
              <linearGradient id="cgpaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="term"
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              interval={0}
              height={28}
              tickMargin={8}
              padding={{ left: 12, right: 12 }}
            />
            <YAxis
              domain={[0, 4]}
              ticks={[0, 1, 2, 3, 4]}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area
              type="monotone"
              dataKey="cgpa"
              name="CGPA"
              stroke="var(--primary)"
              strokeWidth={2.5}
              fill="url(#cgpaFill)"
              dot={{ r: 3 }}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="sgpa"
              name="SGPA"
              stroke="var(--chart-4)"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-secondary/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold text-primary">{value}</p>
    </div>
  );
}

/* -------------------------------- Program map ------------------------------ */

const STATE_COLORS = ["var(--primary)", "var(--chart-4)", "var(--chart-2)", "var(--chart-5)"];

function stateOf(status: string | null, ar: boolean) {
  const text = status ?? "";
  if (/Passed/i.test(text)) return ar ? "ناجح" : "Passed";
  if (/مسجَّلة|مسجلة|Registered/i.test(text)) return ar ? "مسجَّلة" : "Registered";
  if (/متاحة للتسجيل|Available/i.test(text)) return ar ? "متاحة" : "Available";
  return ar ? "غير متاحة" : "Unavailable";
}

function PlanCharts({ items }: { items: ItemRow[] }) {
  const { lang } = useI18n();
  const ar = lang === "ar";

  const { pie, groups, totalDone, totalReq } = useMemo(() => {
    const stateMap = new Map<string, number>();
    const groupMap = new Map<string, { done: number; req: number }>();
    const seen = new Set<string>();

    for (const item of items) {
      const key = `${item.course ?? ""}|${item.title}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const state = stateOf(item.status, ar);
      stateMap.set(state, (stateMap.get(state) ?? 0) + 1);

      const raw = (item.extra as Record<string, string> | null)?.["المجموعة"] ?? "";
      const [namePart, hoursPart] = raw.split("•").map((part) => part.trim());
      const match = /(\d+)\s*\/\s*(\d+)/.exec(hoursPart ?? "");
      if (namePart && match) {
        groupMap.set(namePart, { done: Number(match[1]), req: Number(match[2]) });
      }
    }

    const groupRows = [...groupMap.entries()]
      .filter(([, value]) => value.req > 0)
      .map(([name, value]) => ({
        name: name.replace(/Courses$/i, "").trim(),
        done: value.done,
        remaining: Math.max(0, value.req - value.done),
        req: value.req,
      }))
      .sort((a, b) => b.req - a.req);

    return {
      pie: [...stateMap.entries()].map(([name, value]) => ({ name, value })),
      groups: groupRows,
      totalDone: groupRows.reduce((sum, row) => sum + row.done, 0),
      totalReq: groupRows.reduce((sum, row) => sum + row.req, 0),
    };
  }, [items, ar]);

  if (pie.length === 0) return null;

  const percent = totalReq ? Math.round((totalDone / totalReq) * 100) : 0;

  return (
    <>
      <ChartCard title={ar ? "تقدّمك في خريطة البرنامج" : "Program map progress"}>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <Stat
            label={ar ? "ساعات مُنجزة" : "Completed hours"}
            value={`${totalDone} / ${totalReq}`}
          />
          <Stat label={ar ? "نسبة الإنجاز" : "Completion"} value={`${percent}%`} />
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="mt-4 h-56 w-full" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pie}
                dataKey="value"
                nameKey="name"
                innerRadius="55%"
                outerRadius="80%"
                paddingAngle={2}
                stroke="none"
              >
                {pie.map((entry, index) => (
                  <Cell key={entry.name} fill={STATE_COLORS[index % STATE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {groups.length > 0 && (
        <ChartCard title={ar ? "الساعات حسب المجموعة" : "Hours by requirement group"}>
          <div className="w-full" style={{ height: Math.max(180, groups.length * 44) }} dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={groups}
                layout="vertical"
                margin={{ top: 4, right: 12, bottom: 4, left: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  dataKey="done"
                  name={ar ? "مُنجزة" : "Completed"}
                  stackId="h"
                  fill="var(--primary)"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="remaining"
                  name={ar ? "متبقية" : "Remaining"}
                  stackId="h"
                  fill="var(--muted)"
                  radius={[0, 6, 6, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      )}
    </>
  );
}
