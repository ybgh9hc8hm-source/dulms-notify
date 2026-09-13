import { useMemo, useState } from "react";
import { ChevronDown, SearchX } from "lucide-react";

import { ItemCard } from "./ItemCard";
import { groupItems, type GroupMode, type ItemRow } from "./item-types";
import { useI18n } from "@/lib/i18n";

interface Props {
  items: ItemRow[];
  empty: string;
  groupBy?: GroupMode;
  query?: string;
  onChanged?: (() => void) | undefined;
}

export function ItemSections({ items, empty, groupBy = "none", query = "", onChanged }: Props) {
  const { t } = useI18n();
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      [item.title, item.course, item.status, item.score].some((field) =>
        (field ?? "").toLowerCase().includes(q),
      ),
    );
  }, [items, query]);

  const groups = useMemo(
    () => groupItems(filtered, groupBy, (k) => t(`kind.${k}`), t),
    [filtered, groupBy, t],
  );

  if (filtered.length === 0) {
    return (
      <div className="card-elevated mt-4 flex flex-col items-center gap-2 p-8 text-center">
        <SearchX className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{query ? t("common.noResults") : empty}</p>
      </div>
    );
  }

  if (groups.length === 1 && groupBy === "none") {
    return (
      <div className="mt-4 space-y-3">
        {groups[0]!.items.map((item) => (
          <ItemCard key={item.id} item={item} onChanged={onChanged} />
        ))}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {groups.map((group, index) => (
        <GroupSection
          key={group.key}
          group={group}
          defaultOpen={index < 2 || !!query}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
}

function GroupSection({
  group,
  defaultOpen,
  onChanged,
}: {
  group: { label: string; items: ItemRow[] };
  defaultOpen: boolean;
  onChanged?: (() => void) | undefined;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="overflow-hidden rounded-2xl border border-border/60 bg-card/40">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-3 text-start transition-colors hover:bg-secondary/40 sm:px-4"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-bold">{group.label}</span>
          <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
            {group.items.length}
          </span>
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="space-y-2 border-t border-border/50 p-2 sm:p-3">
          {group.items.map((item) => (
            <ItemCard key={item.id} item={item} onChanged={onChanged} />
          ))}
        </div>
      )}
    </section>
  );
}
