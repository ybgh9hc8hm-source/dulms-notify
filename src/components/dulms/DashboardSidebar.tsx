import { useEffect, useState } from "react";
import { BellRing, ChevronDown, Home } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { CATEGORIES, CATEGORY_GROUPS } from "./categories";
import { useI18n } from "@/lib/i18n";

interface Props {
  active: string;
  onSelect: (id: string) => void;
  counts: Record<string, number>;
  unread: number;
}

function findGroupForActive(active: string) {
  return CATEGORY_GROUPS.find((g) => g.items.includes(active));
}

function initialOpenState(active: string): Record<string, boolean> {
  const activeGroup = findGroupForActive(active);
  const openId = activeGroup?.id ?? "elearning";
  return Object.fromEntries(CATEGORY_GROUPS.map((g) => [g.id, g.id === openId]));
}

export function DashboardSidebar({ active, onSelect, counts, unread }: Props) {
  const { t, dir } = useI18n();
  const { setOpenMobile, isMobile } = useSidebar();
  const [open, setOpen] = useState<Record<string, boolean>>(() => initialOpenState(active));

  useEffect(() => {
    setOpen(initialOpenState(active));
  }, [active]);

  const byId = new Map(CATEGORIES.map((c) => [c.id, c]));

  return (
    <Sidebar
      side={dir === "rtl" ? "right" : "left"}
      collapsible="offcanvas"
      className="border-sidebar-border [&_[data-sidebar=sidebar]]:glass-panel"
    >
      <SidebarHeader className="px-4 pb-2 pt-5">
        <p className="text-footnote font-semibold uppercase tracking-[0.06em]">{t("nav.title")}</p>
      </SidebarHeader>
      <SidebarContent className="gap-2 px-3 pb-6">
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={active === ""}
                  onClick={() => {
                    onSelect("");
                    if (isMobile) setOpenMobile(false);
                  }}
                  className="press h-11 rounded-xl bg-sidebar-accent/40 px-3 text-[1.0625rem] font-semibold active:scale-[0.98] data-[active=true]:bg-primary/18 data-[active=true]:text-primary"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                    <Home className="size-4" />
                  </span>
                  <span>{t("nav.home")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-2.5">
              {CATEGORY_GROUPS.map((group) => {
                const isOpen = !!open[group.id];
                const GroupIcon = group.icon;
                // Beta categories only appear once they actually have data.
                const visibleItems = group.items.filter((id) => {
                  const category = byId.get(id);
                  return !category?.betaOnly || (counts[id] ?? 0) > 0 || active === id;
                });
                if (visibleItems.length === 0) return null;
                const total = visibleItems.reduce(
                  (sum, id) => sum + (id === "alerts" ? unread : (counts[id] ?? 0)),
                  0,
                );
                const hasActive = visibleItems.includes(active);
                // A group with a single category is rendered as a plain entry —
                // no collapsible wrapper around one child.
                if (visibleItems.length === 1) {
                  const onlyId = visibleItems[0]!;

                  const category = byId.get(onlyId);
                  const label = category ? t(category.labelKey) : t(group.labelKey);
                  const isActive = active === onlyId;
                  return (
                    <SidebarMenuItem
                      key={group.id}
                      className={`overflow-hidden rounded-2xl transition-colors ${
                        isActive ? "bg-sidebar-accent/55" : "bg-sidebar-accent/20"
                      }`}
                    >
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => {
                          onSelect(onlyId);
                          if (isMobile) setOpenMobile(false);
                        }}
                        className="h-14 justify-between rounded-none bg-transparent px-3 text-[15px] font-bold hover:bg-sidebar-accent/40 data-[active=true]:text-primary"
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span
                            className={`flex size-8 shrink-0 items-center justify-center rounded-[0.65rem] ${
                              isActive
                                ? "bg-primary/20 text-primary"
                                : "bg-sidebar-accent/60 text-sidebar-foreground/80"
                            }`}
                          >
                            <GroupIcon className="size-4" />
                          </span>
                          <span className="truncate">{label}</span>
                        </span>
                        {total > 0 && (
                          <span className="min-w-6 shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-center text-[11px] font-semibold tabular-nums text-primary">
                            {total}
                          </span>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                }
                return (
                  <SidebarMenuItem
                    key={group.id}
                    className={`overflow-hidden rounded-2xl transition-colors ${
                      hasActive || isOpen ? "bg-sidebar-accent/55" : "bg-sidebar-accent/20"
                    }`}
                  >
                    <SidebarMenuButton
                      onClick={() =>
                        setOpen((s) => {
                          const willOpen = !s[group.id];
                          const next: Record<string, boolean> = Object.fromEntries(
                            CATEGORY_GROUPS.map((g) => [g.id, false]),
                          );
                          if (willOpen) next[group.id] = true;
                          return next;
                        })
                      }
                      className="h-14 justify-between rounded-none bg-transparent px-3 text-[0.9375rem] font-semibold hover:bg-sidebar-accent/40"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={`flex size-8 shrink-0 items-center justify-center rounded-[0.65rem] ${
                            hasActive
                              ? "bg-primary/20 text-primary"
                              : "bg-sidebar-accent/60 text-sidebar-foreground/80"
                          }`}
                        >
                          <GroupIcon className="size-4" />
                        </span>
                        <span className="truncate">{t(group.labelKey)}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {total > 0 && (
                          <span className="min-w-6 rounded-full bg-primary/15 px-2 py-0.5 text-center text-[11px] font-semibold tabular-nums text-primary">
                            {total}
                          </span>
                        )}
                        <ChevronDown
                          className={`size-4 opacity-70 transition-transform ${isOpen ? "rotate-180" : ""}`}
                        />
                      </span>
                    </SidebarMenuButton>
                    {isOpen && (
                      <div className="px-3 pb-2.5">
                        <SidebarMenuSub
                          className={`mx-0 mt-0 gap-0.5 border-0 py-0.5 ${
                            dir === "rtl"
                              ? "border-r border-sidebar-border/70 pr-3 pl-0"
                              : "border-l border-sidebar-border/70 pl-3 pr-0"
                          }`}
                        >
                          {visibleItems.map((id) => {
                            const category = byId.get(id);
                            const Icon = category?.icon ?? BellRing;
                            const label = category ? t(category.labelKey) : t("cat.alerts");
                            const count = id === "alerts" ? unread : (counts[id] ?? 0);
                            const isActive = active === id;
                            return (
                              <SidebarMenuSubItem key={id}>
                                <SidebarMenuSubButton
                                  isActive={isActive}
                                  className="h-9 justify-between rounded-lg border-0 bg-transparent px-2 text-[13.5px] font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground data-[active=true]:bg-primary/12 data-[active=true]:font-semibold data-[active=true]:text-primary"
                                  onClick={() => {
                                    onSelect(id);
                                    if (isMobile) setOpenMobile(false);
                                  }}
                                >
                                  <span className="flex min-w-0 items-center gap-2">
                                    <Icon
                                      className={`size-3.5 shrink-0 ${isActive ? "opacity-100" : "opacity-60"}`}
                                    />
                                    <span className="truncate">{label}</span>
                                  </span>
                                  <span
                                    className={`shrink-0 text-[11px] tabular-nums ${
                                      count > 0
                                        ? isActive
                                          ? "text-primary"
                                          : "text-sidebar-foreground/55"
                                        : "text-sidebar-foreground/30"
                                    }`}
                                  >
                                    {count}
                                  </span>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            );
                          })}
                        </SidebarMenuSub>
                      </div>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
