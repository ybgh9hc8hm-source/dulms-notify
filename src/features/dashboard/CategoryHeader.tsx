/** Header of a single category view: back, icon, title, count, search. */
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";

interface Props {
  icon: LucideIcon;
  label: string;
  count: number;
  query: string;
  onQueryChange: (value: string) => void;
  onBack: () => void;
}

export function CategoryHeader({ icon: Icon, label, count, query, onQueryChange, onBack }: Props) {
  const { t } = useI18n();

  return (
    <section className="card-elevated overflow-hidden p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          size="icon"
          className="shrink-0 rounded-xl"
          onClick={onBack}
          aria-label={t("common.back")}
        >
          <ArrowRight className="size-4 ltr:rotate-180" />
        </Button>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold leading-tight">{label}</h1>
          <p className="text-xs text-muted-foreground">{count}</p>
        </div>
      </div>
      <div className="relative mt-4">
        <Search className="pointer-events-none absolute inset-y-0 end-3 my-auto size-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t("common.search")}
          className="pe-10"
        />
      </div>
    </section>
  );
}
