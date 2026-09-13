import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BellRing, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { CategoryCharts } from "@/components/dulms/CategoryCharts";
import { DashboardSidebar } from "@/components/dulms/DashboardSidebar";
import { ItemSections } from "@/components/dulms/ItemSections";
import { CATEGORIES } from "@/components/dulms/categories";
import type { ItemRow } from "@/components/dulms/item-types";
import type { StudentProfile } from "@/components/dulms/StudentHero";
import { AlertsPanel } from "@/features/dashboard/AlertsPanel";
import { GpaPanel } from "@/features/dashboard/GpaPanel";
import { CategoryHeader } from "@/features/dashboard/CategoryHeader";
import { DashboardHeader } from "@/features/dashboard/DashboardHeader";
import { OverviewSummary } from "@/features/dashboard/OverviewSummary";
import { SupportChat } from "@/features/dashboard/SupportChat";
import { TelegramGate } from "@/features/dashboard/TelegramGate";
import {
  RegistrationWatchPanel,
  type RegistrationWatchRow,
} from "@/components/dulms/RegistrationWatchPanel";
import { ScheduleAdvisor } from "@/components/dulms/ScheduleAdvisor";

import { useDesktopNotifications } from "@/features/dashboard/use-desktop-notifications";
import { useOverview } from "@/features/dashboard/use-overview";
import { supabase } from "@/integrations/supabase/client";
import { markNotificationsRead } from "@/lib/dulms.functions";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/dashboard")({
  validateSearch: (search: Record<string, unknown>): { cat?: string } =>
    typeof search["cat"] === "string" && search["cat"] ? { cat: search["cat"] as string } : {},
  head: () => ({
    meta: [
      { title: "Dashboard — DULMS Notify" },
      {
        name: "description",
        content: "All your DULMS quizzes, assignments, grades, and schedule in one place.",
      },
      { property: "og:title", content: "Dashboard — DULMS Notify" },
      { property: "og:description", content: "Follow DULMS quizzes, assignments and grades." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const { user } = Route.useRouteContext();

  const { data, isPending, invalidate } = useOverview(user.id);
  const { cat } = Route.useSearch();
  const active = cat ?? "";
  const [query, setQuery] = useState("");

  const markRead = useServerFn(markNotificationsRead);

  const openCategory = (id: string) =>
    navigate({ to: "/dashboard", search: id ? { cat: id } : {} });
  const closeCategory = () => navigate({ to: "/dashboard", search: {} });

  const items = useMemo(() => (data?.items ?? []) as ItemRow[], [data?.items]);
  const notifications = data?.notifications ?? [];
  const unread = notifications.filter((n) => !n.read_at).length;
  const account = data?.account ?? null;
  const studentProfile = (account?.profile ?? null) as StudentProfile | null;

  useDesktopNotifications(notifications, {
    title: t("dash.newItemsTitle"),
    body: (n) => t("dash.newItemsBody", { n }),
  });

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const category of CATEGORIES) {
      map[category.id] = items.filter((item) => category.kinds.includes(item.kind)).length;
    }
    return map;
  }, [items]);

  const fallbackCategory = CATEGORIES.find((category) => !category.betaOnly) ?? CATEGORIES[0]!;
  const activeCategory = CATEGORIES.find((category) => category.id === active) ?? fallbackCategory;

  const activeItems = useMemo(() => {
    const filtered = items.filter((item) => activeCategory.kinds.includes(item.kind));
    if (activeCategory.id !== "registration") return filtered;
    return [...filtered].sort((a: ItemRow, b: ItemRow) => {
      const rank = (kind: string) => (kind === "courseOffer" ? 0 : 1);
      return rank(a.kind) - rank(b.kind);
    });
  }, [items, activeCategory]);
  const isAlerts = cat === "alerts";
  const isGpa = cat === "gpa";
  const isRegistration = cat === "registration";

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <SidebarProvider>
      <TelegramGate onSignOut={() => void signOut()} />
      <div className="flex min-h-screen w-full max-w-full overflow-x-hidden">
        {account && (
          <DashboardSidebar
            active={active}
            onSelect={openCategory}
            counts={counts}
            unread={unread}
          />
        )}
        <SidebarInset className="min-w-0 flex-1 pb-16">
          <DashboardHeader hasAccount={Boolean(account)} onSignOut={() => void signOut()} />

          <main className="mx-auto min-h-[70vh] w-full max-w-6xl space-y-5 px-2 py-4 pb-24 sm:px-4 sm:py-6">
            {isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}

            {account && items.length === 0 && !account.last_sync_error && (
              <section className="card-elevated flex items-start gap-3 p-5">
                <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-primary" />
                <div>
                  <p className="font-semibold">{t("dash.firstSyncTitle")}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t("dash.firstSyncBody")}</p>
                </div>
              </section>
            )}

            {!isPending && !account && (
              <section className="card-elevated p-6">
                <p className="text-sm text-muted-foreground">{t("dash.notLinked")}</p>
                <Button className="mt-4" onClick={() => void signOut()}>
                  {t("dash.reSignIn")}
                </Button>
              </section>
            )}

            {account && !cat && (
              <OverviewSummary
                profile={studentProfile}
                dulmsId={account.dulms_id}
                lastSyncAt={account.last_sync_at}
                totalItems={items.length}
                unread={unread}
              />
            )}

            {account?.last_sync_status === "auth_error" && (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
                {t("dash.authError")}
              </p>
            )}

            {account && cat && (
              <>
                <CategoryHeader
                  icon={isAlerts ? BellRing : activeCategory.icon}
                  label={isAlerts ? t("cat.alerts") : t(activeCategory.labelKey)}
                  count={isAlerts ? notifications.length : activeItems.length}
                  query={query}
                  onQueryChange={setQuery}
                  onBack={closeCategory}
                />

                {isGpa ? (
                  <GpaPanel profile={studentProfile} items={items} />
                ) : isAlerts ? (
                  <AlertsPanel
                    notifications={notifications}
                    unread={unread}
                    onMarkAllRead={async () => {
                      await markRead();
                      invalidate();
                    }}
                  />
                ) : (
                  <section>
                    <CategoryCharts categoryId={activeCategory.id} items={activeItems} />
                    {isRegistration && (
                      <>
                        <ScheduleAdvisor onChanged={invalidate} />
                        <RegistrationWatchPanel
                          watches={(data?.registrationWatches ?? []) as RegistrationWatchRow[]}
                          onChanged={invalidate}
                        />
                      </>
                    )}

                    <ItemSections
                      items={activeItems}
                      empty={t(activeCategory.emptyKey)}
                      groupBy={activeCategory.groupBy}
                      query={query}
                      onChanged={isRegistration ? invalidate : undefined}
                    />
                  </section>
                )}
              </>
            )}
          </main>
        </SidebarInset>
      </div>
      <SupportChat />
    </SidebarProvider>
  );
}
