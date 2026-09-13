import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Wrench } from "lucide-react";
import type { ReactNode } from "react";

import { DeltaMark } from "@/components/brand/DeltaMark";
import { getMaintenance } from "@/lib/maintenance.functions";

/**
 * Wraps the whole app. When the operator flips maintenance mode on, every route
 * renders the maintenance screen — except the secret admin panel (`/a/...`),
 * so the operator can always sign in and switch it back off.
 */
export function MaintenanceGate({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const fetchMaintenance = useServerFn(getMaintenance);
  const isAdminRoute = pathname === "/a" || pathname.startsWith("/a/");

  const { data } = useQuery({
    queryKey: ["maintenance"],
    queryFn: () => fetchMaintenance(),
    enabled: !isAdminRoute,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  if (isAdminRoute || !data?.enabled) return <>{children}</>;

  return <MaintenanceScreen title={data.title} message={data.message} eta={data.eta} />;
}

export function MaintenanceScreen({
  title,
  message,
  eta,
}: {
  title: string;
  message: string;
  eta: string | null;
}) {
  return (
    <main
      dir="rtl"
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12"
    >
      <section className="glass-panel relative w-full max-w-lg rounded-3xl border border-border/60 p-8 text-center shadow-xl">
        <DeltaMark className="mx-auto size-16" />

        <div className="mx-auto mt-6 flex size-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
          <Wrench className="size-5" />
        </div>

        <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-foreground">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{message}</p>

        {eta ? (
          <p className="mx-auto mt-5 inline-flex rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary">
            العودة المتوقعة: {eta}
          </p>
        ) : null}

        <div className="mt-8 border-t border-border/60 pt-4 text-[11px] tracking-wide text-muted-foreground">
          DULMS Notify · التنبيهات على تليجرام تعمل كالمعتاد
        </div>
      </section>
    </main>
  );
}
