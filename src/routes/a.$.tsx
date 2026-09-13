import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  KeyRound,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  RefreshCw,
  Send,
  LifeBuoy,
  Wrench,
  ShieldAlert,
  Ticket,
  Users,
  KeySquare,
  Globe,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  adminAccountAction,
  adminBulkAction,
  adminGetSettings,
  adminListAccounts,
  adminLogout,
  adminOverview,
  adminSaveBotConfig,
  adminSaveLanding,
  adminSaveMaintenance,
  adminSaveRegistration,
  adminUploadHeroImage,
  adminUnlock,
} from "@/lib/admin.functions";
import { CredentialsPanel } from "@/features/admin/CredentialsPanel";
import { SupportPanel } from "@/features/admin/SupportPanel";
import { OverviewPanel, type Overview } from "@/features/admin/OverviewPanel";
import { UsersPanel, type AccountAction, type AdminAccount } from "@/features/admin/UsersPanel";
import { BotPanel, type BotConfig } from "@/features/admin/BotPanel";
import { AccessPanel, type RegistrationConfig } from "@/features/admin/AccessPanel";
import { MaintenancePanel, type MaintenanceConfig } from "@/features/admin/MaintenancePanel";
import { AlertChatCard } from "@/features/admin/AlertChatCard";
import { VaultPanel } from "@/features/admin/VaultPanel";
import { LandingPanel } from "@/features/admin/LandingPanel";
import type { LandingConfig } from "@/features/landing/fields";

export const Route = createFileRoute("/a/$")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "لوحة التحكم" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "صفحة إدارية خاصة." },
      { property: "og:title", content: "لوحة التحكم" },
      { property: "og:description", content: "صفحة إدارية خاصة." },
    ],
  }),
  component: AdminPanel,
});

type Settings = {
  bot: BotConfig;
  registration: RegistrationConfig;
  maintenance: MaintenanceConfig;
  landing: LandingConfig;
  defaults: { categories: Record<string, string>; sections: Record<string, string> };
};

type SectionId =
  | "overview"
  | "users"
  | "credentials"
  | "bot"
  | "support"
  | "access"
  | "maintenance"
  | "landing"
  | "vault";

const NAV: { id: SectionId; label: string; hint: string; icon: typeof Users }[] = [
  { id: "overview", label: "نظرة عامة", hint: "إحصائيات النظام", icon: LayoutDashboard },
  { id: "users", label: "المستخدمون", hint: "إدارة الحسابات والإجراءات", icon: Users },
  {
    id: "credentials",
    label: "بيانات الدخول",
    hint: "كود الطالب وكلمة المرور",
    icon: KeySquare,
  },
  {
    id: "landing",
    label: "الصفحة الرئيسية",
    hint: "الصورة والنصوص وكل العناصر",
    icon: Globe,
  },
  { id: "bot", label: "البوت والرسائل", hint: "تنسيق وإرسال جماعي", icon: Send },
  {
    id: "support",
    label: "الدعم والمقترحات",
    hint: "المساعد الذكي ووارد الطلاب",
    icon: LifeBuoy,
  },
  { id: "access", label: "التسجيل والمقاعد", hint: "فتح/غلق التسجيل", icon: Ticket },
  { id: "maintenance", label: "وضع الصيانة", hint: "إغلاق الموقع مؤقتًا", icon: Wrench },
  { id: "vault", label: "الخزنة والأسرار", hint: "نقل المشروع بكلمة سر واحدة", icon: ShieldCheck },
];

function AdminPanel() {
  const { _splat } = Route.useParams();
  const key = (_splat ?? "").replace(/^\/+|\/+$/g, "");

  const unlock = useServerFn(adminUnlock);
  const listAccounts = useServerFn(adminListAccounts);
  const overviewFn = useServerFn(adminOverview);
  const getSettings = useServerFn(adminGetSettings);
  const saveBot = useServerFn(adminSaveBotConfig);
  const saveRegistration = useServerFn(adminSaveRegistration);
  const saveMaintenance = useServerFn(adminSaveMaintenance);
  const saveLanding = useServerFn(adminSaveLanding);
  const uploadHero = useServerFn(adminUploadHeroImage);
  const accountAction = useServerFn(adminAccountAction);
  const bulkAction = useServerFn(adminBulkAction);
  const logout = useServerFn(adminLogout);

  // `password` holds either the typed password (during login) or the
  // long-lived session token once unlocked — both are accepted by the guard.
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [section, setSection] = useState<SectionId>("overview");
  const [navOpen, setNavOpen] = useState(false);

  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [pending, setPending] = useState<string[]>([]);

  const storageKey = `dn_admin_session_v1:${key}`;

  /** Restores an existing admin session (no expiry) on every page load. */
  useEffect(() => {
    let cancelled = false;
    const token = typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;
    if (!token) {
      setRestoring(false);
      return;
    }
    void (async () => {
      const res = await unlock({ data: { key, password: token } });
      if (cancelled) return;
      if (res.ok) {
        setPassword(token);
        setUnlocked(true);
        await loadAll(token);
      } else {
        window.localStorage.removeItem(storageKey);
      }
      setRestoring(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  function signOut() {
    const token = password;
    if (token) void logout({ data: { key, password: token } });
    if (typeof window !== "undefined") window.localStorage.removeItem(storageKey);
    setUnlocked(false);
    setPassword("");
    setAccounts([]);
    setOverview(null);
    setSettings(null);
    toast.success("تم تسجيل الخروج من اللوحة");
  }

  async function loadAll(pass: string) {
    // A failed section must never leave its spinner running forever: every job
    // reports its own failure so the operator knows what to retry.
    const report = (label: string) => (cause: unknown) => {
      const detail = cause instanceof Error ? cause.message : "";
      toast.error(
        `تعذّر تحميل ${label}`,
        detail ? { description: detail.slice(0, 140) } : undefined,
      );
    };
    // Each section resolves on its own so a slow call never blocks the rest.
    const jobs = [
      listAccounts({ data: { key, password: pass } })
        .then((res) => {
          if (res.ok) setAccounts(res.accounts as AdminAccount[]);
          else report("المستخدمين")(new Error(res.message));
        })
        .catch(report("المستخدمين")),
      overviewFn({ data: { key, password: pass } })
        .then((res) => {
          if (!res.ok) {
            report("الإحصائيات")(new Error(res.message));
            return;
          }
          setOverview({
            stats: res.stats,
            breakdown: res.breakdown,
            capacity: res.capacity,
            slo: res.slo,
          });
        })
        .catch(report("الإحصائيات")),
      getSettings({ data: { key, password: pass } })
        .then((res) => {
          if (!res.ok) {
            report("الإعدادات")(new Error(res.message));
            return;
          }
          setSettings({
            bot: res.bot as BotConfig,
            registration: res.registration as RegistrationConfig,
            maintenance: res.maintenance as MaintenanceConfig,
            landing: res.landing as LandingConfig,
            defaults: res.defaults,
          });
        })
        .catch(report("الإعدادات")),
    ];
    await Promise.allSettled(jobs);
  }

  /** Refreshes account rows in place — no global busy flag, so the list never blanks. */
  async function refreshAccounts(pass: string) {
    const res = await listAccounts({ data: { key, password: pass } });
    if (res.ok) setAccounts(res.accounts as AdminAccount[]);
    const stats = await overviewFn({ data: { key, password: pass } });
    if (stats.ok) {
      setOverview({
        stats: stats.stats,
        breakdown: stats.breakdown,
        capacity: stats.capacity,
        slo: stats.slo,
      });
    }
  }

  async function run(job: () => Promise<void>) {
    setBusy(true);
    try {
      await job();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";
      toast.error(detail ? `فشل الإجراء: ${detail.slice(0, 120)}` : "حدث خطأ، حاول مرة أخرى");
    } finally {
      setBusy(false);
    }
  }

  /** Runs an account job while marking only the affected rows as pending. */
  async function runScoped(ids: string[], job: () => Promise<void>) {
    setPending((current) => [...current, ...ids]);
    try {
      await job();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";
      toast.error(detail ? `فشل الإجراء: ${detail.slice(0, 120)}` : "حدث خطأ، حاول مرة أخرى");
    } finally {
      setPending((current) => current.filter((id) => !ids.includes(id)));
    }
  }

  async function onUnlock(event: React.FormEvent) {
    event.preventDefault();
    await run(async () => {
      const res = await unlock({ data: { key, password } });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      const token = res.token ?? password;
      if (res.token && typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, res.token);
      }
      setPassword(token);
      setUnlocked(true);
      await loadAll(token);
    });
  }

  function handleAction(dulmsId: string, action: AccountAction, text?: string) {
    if (action === "delete" && !window.confirm(`حذف الحساب ${dulmsId} نهائيًا؟`)) return;
    void runScoped([dulmsId], async () => {
      const res = await accountAction({ data: { key, password, dulmsId, action, text } });
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
      await refreshAccounts(password);
    });
  }

  function handleBulk(dulmsIds: string[], action: AccountAction, text?: string) {
    if (action === "delete") {
      const confirmation = window.prompt(
        `اكتب DELETE ${dulmsIds.length} لتأكيد حذف الحسابات نهائيًا`,
      );
      if (confirmation !== `DELETE ${dulmsIds.length}`) return;
    }
    void runScoped(dulmsIds, async () => {
      const res = await bulkAction({ data: { key, password, dulmsIds, action, text } });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      if (res.failed > 0) {
        toast.warning(res.message, { description: res.errors.join(" • ").slice(0, 200) });
      } else {
        toast.success(res.message);
      }
      await refreshAccounts(password);
    });
  }

  if (!unlocked && restoring) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!unlocked) {
    return (
      <main className="flex min-h-screen items-center justify-center overflow-x-hidden px-4 py-10">
        <form
          onSubmit={onUnlock}
          className="w-full max-w-sm space-y-5 rounded-2xl border border-border bg-card/70 p-6 backdrop-blur"
        >
          <div className="space-y-1 text-center">
            <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldAlert className="size-5" />
            </div>
            <h1 className="text-lg font-bold">لوحة التحكم</h1>
            <p className="text-xs text-muted-foreground">الدخول بكلمة المرور الإدارية فقط</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-password">كلمة المرور</Label>
            <div className="relative">
              <Input
                id="admin-password"
                name="password"
                type={showPass ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                className="pe-10"
              />
              <button
                type="button"
                onClick={() => setShowPass((value) => !value)}
                className="absolute inset-y-0 end-0 flex w-10 items-center justify-center text-muted-foreground"
                aria-label="إظهار كلمة المرور"
              >
                {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
            دخول
          </Button>
        </form>
      </main>
    );
  }

  const active = NAV.find((item) => item.id === section) ?? NAV[0]!;

  const navList = (
    <nav className="space-y-1">
      {NAV.map((item) => {
        const Icon = item.icon;
        const isActive = item.id === section;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setSection(item.id);
              setNavOpen(false);
            }}
            className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-start transition-colors ${
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{item.label}</span>
              <span className="block truncate text-[11px] opacity-70">{item.hint}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );

  const sidebarBody = (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ShieldAlert className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">لوحة الأدمن</p>
          <p className="truncate text-[11px] text-muted-foreground">DULMS Notify</p>
        </div>
      </div>
      <Separator />
      {navList}
      <div className="mt-auto space-y-2">
        <Separator />
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>المستخدمون</span>
          <Badge variant="secondary" className="tabular-nums">
            {overview?.stats.accounts ?? accounts.length}
          </Badge>
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>مشتركو البوت</span>
          <Badge variant="secondary" className="tabular-nums">
            {overview?.stats.botUsers ?? 0}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground"
          onClick={signOut}
        >
          <LogOut className="size-4" /> تسجيل الخروج
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen w-full overflow-x-hidden bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 overflow-y-auto border-e border-border bg-card/40 p-4 lg:block">
        {sidebarBody}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur">
          <Sheet open={navOpen} onOpenChange={setNavOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="lg:hidden" aria-label="القائمة">
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 overflow-y-auto p-4">
              <SheetTitle className="sr-only">قائمة اللوحة</SheetTitle>
              {sidebarBody}
            </SheetContent>
          </Sheet>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold">{active.label}</h1>
            <p className="truncate text-[11px] text-muted-foreground">{active.hint}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={busy}
            onClick={() => void run(() => loadAll(password))}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            تحديث
          </Button>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 p-4 sm:p-6">
          {section === "overview" ? <OverviewPanel overview={overview} /> : null}

          {section === "users" ? (
            <UsersPanel
              accounts={accounts}
              busy={pending.length > 0}
              pending={pending}
              loading={busy && accounts.length === 0}
              onAction={handleAction}
              onBulk={handleBulk}
            />
          ) : null}

          {section === "credentials" ? (
            <CredentialsPanel adminKey={key} password={password} />
          ) : null}

          {section === "bot" ? (
            settings ? (
              <BotPanel
                adminKey={key}
                password={password}
                config={settings.bot}
                defaults={settings.defaults}
                busy={busy}
                onSave={(next) =>
                  void run(async () => {
                    const res = await saveBot({ data: { key, password, bot: next } });
                    if (res.ok) toast.success(res.message);
                    else toast.error(res.message);
                    await loadAll(password);
                  })
                }
              />
            ) : (
              <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
            )
          ) : null}

          {section === "access" ? (
            settings ? (
              <AccessPanel
                config={settings.registration}
                used={overview?.stats.seatsUsed ?? accounts.length}
                busy={busy}
                onSave={(next) =>
                  void run(async () => {
                    const res = await saveRegistration({
                      data: { key, password, registration: next },
                    });
                    if (res.ok) toast.success(res.message);
                    else toast.error(res.message);
                    await loadAll(password);
                  })
                }
              />
            ) : (
              <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
            )
          ) : null}

          {section === "maintenance" ? (
            settings ? (
              <div className="space-y-4">
                <MaintenancePanel
                  config={settings.maintenance}
                  busy={busy}
                  onSave={(next) =>
                    void run(async () => {
                      const res = await saveMaintenance({
                        data: { key, password, maintenance: next },
                      });
                      if (res.ok) toast.success(res.message);
                      else toast.error(res.message);
                      await loadAll(password);
                    })
                  }
                />
                <AlertChatCard adminKey={key} password={password} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
            )
          ) : null}

          {section === "landing" ? (
            settings ? (
              <LandingPanel
                config={settings.landing}
                busy={busy}
                onSave={(next) =>
                  void run(async () => {
                    const res = await saveLanding({ data: { key, password, landing: next } });
                    if (res.ok) toast.success(res.message);
                    else toast.error(res.message);
                    await loadAll(password);
                  })
                }
                onUploadHero={async (dataUrl) => {
                  const res = await uploadHero({ data: { key, password, dataUrl } });
                  if (res.ok) {
                    toast.success(res.message);
                    return res.url;
                  }
                  toast.error(res.message);
                  return null;
                }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
            )
          ) : null}

          {section === "support" ? <SupportPanel adminKey={key} password={password} /> : null}

          {section === "vault" ? <VaultPanel adminKey={key} password={password} /> : null}
        </main>
      </div>
    </div>
  );
}
