export interface ItemRow {
  id: string;
  kind: string;
  course: string | null;
  title: string;
  due_at: string | null;
  status: string | null;
  score: string | null;
  extra?: unknown;
  first_seen_at?: string | null;
  archived_at?: string | null;
}

export interface ItemGroup {
  key: string;
  label: string;
  items: ItemRow[];
}

export type GroupMode = "semester" | "planState" | "course" | "kind" | "none";

export type Translate = (key: string, vars?: Record<string, string | number>) => string;

function semesterLabel(raw: string | null, t: Translate): string {
  const text = raw ?? "";
  const season = /fall|spring|summer|winter/i.exec(text)?.[0]?.toLowerCase();
  const year = /\d{4}\s*[-/]\s*\d{4}|\d{4}/.exec(text)?.[0]?.replace(/\s/g, "");
  if (!season && !year) return t("group.uncategorizedSemester");
  const seasonLabel = season ? t(`group.sem.${season}`) : t("group.sem.generic");
  return [seasonLabel, year].filter(Boolean).join(" — ");
}

function planStateLabel(raw: string | null, t: Translate): string {
  const text = raw ?? "";
  if (/مسجَّلة|مسجلة|Registered/i.test(text)) return t("group.plan.registered");
  if (/Passed/i.test(text)) return t("group.plan.passed");
  if (/Failed/i.test(text)) return t("group.plan.failed");
  if (/متاحة للتسجيل|Available/i.test(text)) return t("group.plan.available");
  if (/غير متاحة|Unavailable/i.test(text)) return t("group.plan.unavailable");
  return t("group.plan.other");
}

function courseLabel(item: ItemRow, t: Translate): string {
  return item.course?.trim() || t("group.noCourse");
}

export function groupItems(
  items: ItemRow[],
  mode: GroupMode,
  kindLabel: (k: string) => string,
  t: Translate,
): ItemGroup[] {
  if (mode === "none" || items.length === 0) {
    return items.length ? [{ key: "all", label: t("common.all"), items }] : [];
  }

  const map = new Map<string, ItemRow[]>();
  for (const item of items) {
    const label =
      mode === "semester"
        ? semesterLabel(item.status ?? item.course, t)
        : mode === "planState"
          ? planStateLabel(item.status, t)
          : mode === "course"
            ? courseLabel(item, t)
            : kindLabel(item.kind);
    const bucket = map.get(label);
    if (bucket) bucket.push(item);
    else map.set(label, [item]);
  }

  const groups = [...map.entries()].map(([label, groupItemsList]) => ({
    key: label,
    label,
    items: groupItemsList,
  }));

  if (mode === "planState") {
    const order = [
      t("group.plan.registered"),
      t("group.plan.available"),
      t("group.plan.passed"),
      t("group.plan.failed"),
      t("group.plan.unavailable"),
      t("group.plan.other"),
    ];
    groups.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
  } else if (mode === "semester") {
    groups.sort((a, b) => b.label.localeCompare(a.label));
  } else {
    groups.sort((a, b) => b.items.length - a.items.length);
  }

  return groups;
}
