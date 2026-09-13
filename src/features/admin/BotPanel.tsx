/**
 * Full Telegram bot control centre.
 *
 * Five tabs, each self-contained:
 *  الحالة      → live bot identity, webhook health, one-click repair
 *  الرسائل     → message template (header/footer/time/batching) + preview
 *  التصنيفات   → per-kind Arabic label overrides and mute switches
 *  المشتركون   → who is linked, their Telegram username, per-user actions
 *  الإرسال     → targeted / broadcast messaging with a live preview
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Activity,
  BellOff,
  Bot,
  CheckCircle2,
  Copy,
  Link2,
  Link2Off,
  Loader2,
  MessageSquare,
  RefreshCw,
  Save,
  Search,
  Send,
  Tags,
  Users,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  adminBotMaintain,
  adminBotSend,
  adminBotStatus,
  adminBotSubscribers,
} from "@/lib/bot.functions";
import { LABEL_GROUPS, type LabelGroup } from "./bot-label-groups";

export type BotConfig = {
  enabled: boolean;
  showTime: boolean;
  header: string | null;
  footer: string | null;
  batchThreshold: number;
  labels: Record<string, string>;
  mutedKinds: string[];
};

type Defaults = { categories: Record<string, string>; sections: Record<string, string> };

type Status = Awaited<ReturnType<typeof adminBotStatus>> & { ok: true };
type Subscriber = {
  userId: string;
  dulmsId: string;
  name: string | null;
  chatId: string | null;
  linked: boolean;
  syncEnabled: boolean;
  lastSyncAt: string | null;
  username: string | null;
  telegramName: string | null;
};

type TabId = "status" | "message" | "labels" | "people" | "send";

const TABS: { id: TabId; label: string; icon: typeof Bot }[] = [
  { id: "status", label: "حالة البوت", icon: Activity },
  { id: "message", label: "شكل الرسائل", icon: MessageSquare },
  { id: "labels", label: "التصنيفات", icon: Tags },
  { id: "people", label: "المشتركون", icon: Users },
  { id: "send", label: "إرسال رسالة", icon: Send },
];

function fmt(value: string | null): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("ar-EG", { dateStyle: "short", timeStyle: "short" }).format(
      new Date(value),
    );
  } catch {
    return "—";
  }
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-all text-end font-medium">{children}</span>
    </div>
  );
}

export function BotPanel({
  adminKey,
  password,
  config,
  defaults,
  busy,
  onSave,
}: {
  adminKey: string;
  password: string;
  config: BotConfig;
  defaults: Defaults;
  busy: boolean;
  onSave: (next: BotConfig) => void;
}) {
  const statusFn = useServerFn(adminBotStatus);
  const maintainFn = useServerFn(adminBotMaintain);
  const subscribersFn = useServerFn(adminBotSubscribers);
  const sendFn = useServerFn(adminBotSend);

  const [tab, setTab] = useState<TabId>("status");
  const [draft, setDraft] = useState<BotConfig>(config);
  const [status, setStatus] = useState<Status | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [subs, setSubs] = useState<Subscriber[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [labelQuery, setLabelQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState<"all" | "enabled" | "selected">("all");
  const [sending, setSending] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => setDraft(config), [config]);

  const patch = (next: Partial<BotConfig>) => setDraft((current) => ({ ...current, ...next }));

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await statusFn({ data: { key: adminKey, password } });
      if (res.ok) setStatus(res as Status);
      else toast.error(res.message ?? "تعذر قراءة حالة البوت");
    } catch {
      toast.error("تعذر الاتصال بتليجرام");
    } finally {
      setStatusLoading(false);
    }
  }, [adminKey, password, statusFn]);

  const loadSubs = useCallback(
    async (withUsernames: boolean) => {
      setSubsLoading(true);
      try {
        const res = await subscribersFn({
          data: { key: adminKey, password, withUsernames },
        });
        if (res.ok) setSubs(res.subscribers as Subscriber[]);
        else toast.error(res.message);
      } catch {
        toast.error("تعذر تحميل المشتركين");
      } finally {
        setSubsLoading(false);
      }
    },
    [adminKey, password, subscribersFn],
  );

  useEffect(() => {
    void loadStatus();
    void loadSubs(false);
  }, [loadStatus, loadSubs]);

  /** Any key the server knows about but the taxonomy does not list yet. */
  const extraGroup = useMemo<LabelGroup | null>(() => {
    const known = new Set(LABEL_GROUPS.flatMap((group) => group.entries.map((e) => e.key)));
    const rest = Object.keys({ ...defaults.categories, ...defaults.sections })
      .filter((key) => !known.has(key))
      .sort();
    if (rest.length === 0) return null;
    return {
      id: "extra",
      name: "Other keys",
      nameAr: "مفاتيح أخرى",
      entries: rest.map((key) => ({
        key,
        name: defaults.categories[key] ?? defaults.sections[key] ?? key,
        hint: key,
      })),
    };
  }, [defaults]);

  const visibleGroups = useMemo(() => {
    const all = extraGroup ? [...LABEL_GROUPS, extraGroup] : LABEL_GROUPS;
    const term = labelQuery.trim().toLowerCase();
    if (!term) return all;
    return all
      .map((group) => ({
        ...group,
        entries: group.entries.filter((entry) => {
          const fallback = defaults.categories[entry.key] ?? defaults.sections[entry.key] ?? "";
          return `${group.name} ${group.nameAr} ${entry.key} ${entry.name} ${entry.hint} ${fallback} ${
            draft.labels[entry.key] ?? ""
          }`
            .toLowerCase()
            .includes(term);
        }),
      }))
      .filter((group) => group.entries.length > 0);
  }, [extraGroup, labelQuery, defaults, draft.labels]);

  const filteredSubs = subs.filter((row) => {
    const term = query.trim().toLowerCase();
    if (!term) return true;
    return `${row.dulmsId} ${row.name ?? ""} ${row.username ?? ""} ${row.chatId ?? ""}`
      .toLowerCase()
      .includes(term);
  });

  const linkedSubs = subs.filter((row) => row.linked);

  const audienceCount =
    target === "all"
      ? linkedSubs.length
      : target === "enabled"
        ? linkedSubs.filter((row) => row.syncEnabled).length
        : selected.length;

  const preview = [
    draft.header ? draft.header : null,
    draft.labels["gradebook"] ?? defaults.categories["gradebook"] ?? "الدرجات",
    "PHY101 — Physics",
    "الدرجة: 85/100",
    draft.showTime ? "١٣ أغسطس ٢٠٢٦، ٦:١٠ ص" : null,
    draft.footer ? draft.footer : null,
  ]
    .filter(Boolean)
    .join("\n");

  async function maintain(action: "setWebhook" | "setMenuButton" | "setSupportWebhook") {
    setWorking(true);
    try {
      const res = await maintainFn({ data: { key: adminKey, password, action } });
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
      await loadStatus();
    } catch {
      toast.error("تعذر تنفيذ الإجراء");
    } finally {
      setWorking(false);
    }
  }

  async function send() {
    if (target === "selected" && selected.length === 0) {
      toast.warning("اختر مشتركًا واحدًا على الأقل");
      return;
    }
    setSending(true);
    try {
      const res = await sendFn({
        data: { key: adminKey, password, text: message.trim(), target, userIds: selected },
      });
      if (res.ok) {
        toast.success(res.message);
        setMessage("");
      } else toast.error(res.message);
    } catch {
      toast.error("تعذر الإرسال");
    } finally {
      setSending(false);
    }
  }

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("تم النسخ");
    } catch {
      toast.error("تعذر النسخ");
    }
  };

  return (
    <section className="space-y-4">
      {/* master switch — always visible, it gates everything else */}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <div
            className={`flex size-10 items-center justify-center rounded-xl ${
              draft.enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            }`}
          >
            <Bot className="size-5" />
          </div>
          <div>
            <p className="text-sm font-bold">
              {status?.bot?.username ? `@${status.bot.username}` : "بوت تليجرام"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {draft.enabled ? "الإشعارات مفعّلة" : "الإشعارات موقوفة بالكامل"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="tabular-nums">
            {status?.counts.linked ?? linkedSubs.length} مشترك
          </Badge>
          <Switch
            checked={draft.enabled}
            aria-label="تفعيل البوت"
            onCheckedChange={(value) => {
              patch({ enabled: value });
              onSave({ ...draft, enabled: value });
            }}
          />
        </div>
      </Card>

      {/* tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = item.id === tab;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                active
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              <Icon className="size-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === "status" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="مشتركون مربوطون" value={status?.counts.linked ?? 0} />
            <Stat label="إجمالي الحسابات" value={status?.counts.accounts ?? 0} />
            <Stat label="تحديثات ٢٤ ساعة" value={status?.counts.updates24h ?? 0} />
            <Stat label="روابط ربط سارية" value={status?.counts.pendingLinkTokens ?? 0} />
          </div>

          <Card className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">الاتصال بتليجرام</h3>
              <Button variant="outline" size="sm" disabled={statusLoading} onClick={loadStatus}>
                {statusLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                تحديث
              </Button>
            </div>
            <Separator />
            <Row label="التوكن">
              {status?.tokenSet ? (
                <span className="inline-flex items-center gap-1 text-primary">
                  <CheckCircle2 className="size-4" /> مضبوط
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-destructive">
                  <XCircle className="size-4" /> غير مضبوط
                </span>
              )}
            </Row>
            <Row label="اسم البوت">{status?.bot?.name ?? status?.botError ?? "—"}</Row>
            <Row label="المعرّف">{status?.bot?.username ? `@${status.bot.username}` : "—"}</Row>
            <Row label="الويبهوك">
              {status?.webhook.matches ? (
                <span className="inline-flex items-center gap-1 text-primary">
                  <CheckCircle2 className="size-4" /> مسجّل بشكل صحيح
                </span>
              ) : (
                <span className="text-destructive">{status?.webhook.url ?? "غير مسجّل"}</span>
              )}
            </Row>
            <Row label="العنوان المتوقع">
              <span className="text-[11px]">{status?.webhook.expectedUrl ?? "—"}</span>
            </Row>
            <Row label="تحديثات معلّقة">{status?.webhook.pending ?? 0}</Row>
            {status?.webhook.lastError ? (
              <Row label="آخر خطأ">
                <span className="text-destructive text-[11px]">{status.webhook.lastError}</span>
              </Row>
            ) : null}
            <Row label="رابط الميني آب">
              <span className="text-[11px]">{status?.miniAppUrl ?? "—"}</span>
            </Row>
            <Row label="بوت الدعم">
              {status?.support.username ? (
                <span className="inline-flex items-center gap-1">
                  @{status.support.username}
                  {status.support.matches ? (
                    <CheckCircle2 className="size-4 text-primary" />
                  ) : (
                    <XCircle className="size-4 text-destructive" />
                  )}
                </span>
              ) : (
                <span className="text-destructive">{status?.support.error ?? "غير مضبوط"}</span>
              )}
            </Row>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={working}
                onClick={() => void maintain("setWebhook")}
              >
                {working ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Link2 className="size-4" />
                )}
                إعادة تسجيل الويبهوك
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={working}
                onClick={() => void maintain("setMenuButton")}
              >
                <Bot className="size-4" />
                تحديث زر الميني آب
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={working}
                onClick={() => void maintain("setSupportWebhook")}
              >
                <Link2 className="size-4" />
                تسجيل ويبهوك بوت الدعم
              </Button>

              {status?.miniAppUrl ? (
                <Button size="sm" variant="ghost" onClick={() => void copy(status.miniAppUrl)}>
                  <Copy className="size-4" /> نسخ رابط الميني آب
                </Button>
              ) : null}
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "message" ? (
        <Card className="space-y-4 p-4">
          <h3 className="text-sm font-semibold">قالب الرسالة</h3>

          <div className="flex items-center justify-between gap-3">
            <div>
              <Label htmlFor="bot-time">إظهار سطر الوقت</Label>
              <p className="text-[11px] text-muted-foreground">وقت وصول الإشعار أسفل الرسالة</p>
            </div>
            <Switch
              id="bot-time"
              checked={draft.showTime}
              onCheckedChange={(value) => patch({ showTime: value })}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="bot-header">سطر افتتاحي</Label>
              <Input
                id="bot-header"
                value={draft.header ?? ""}
                onChange={(event) => patch({ header: event.target.value || null })}
                placeholder="DULMS Notify"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bot-footer">سطر ختامي</Label>
              <Input
                id="bot-footer"
                value={draft.footer ?? ""}
                onChange={(event) => patch({ footer: event.target.value || null })}
                placeholder="اختياري"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bot-batch">حد التجميع</Label>
              <Input
                id="bot-batch"
                type="number"
                min={1}
                max={20}
                value={draft.batchThreshold}
                onChange={(event) =>
                  patch({
                    batchThreshold: Math.max(1, Math.min(20, Number(event.target.value) || 1)),
                  })
                }
              />
              <p className="text-[11px] text-muted-foreground">
                أكثر من {draft.batchThreshold} إشعار في دورة واحدة → رسالة ملخّص واحدة
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3">
            <p className="mb-1 text-xs text-muted-foreground">معاينة الرسالة</p>
            <pre className="whitespace-pre-wrap text-xs leading-6">{preview}</pre>
          </div>

          <Button onClick={() => onSave(draft)} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            حفظ
          </Button>
        </Card>
      ) : null}

      {tab === "labels" ? (
        <Card className="space-y-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">تسميات الأقسام والعناصر</h3>
              <p className="text-[11px] leading-5 text-muted-foreground">
                الأسماء ثابتة ومطابقة لأسماء الأقسام في الموقع بالإنجليزية ولا يمكن تعديلها يدويًا.
                التحكم المتاح هو تفعيل أو كتم إشعارات كل عنصر أو قسم كامل.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Badge variant={draft.mutedKinds.length > 0 ? "destructive" : "secondary"}>
                {draft.mutedKinds.length} مكتوم
              </Badge>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" />
            <Input
              className="ps-9"
              value={labelQuery}
              onChange={(event) => setLabelQuery(event.target.value)}
              placeholder="ابحث باسم القسم أو المفتاح (Quizzes، غياب، assignment…)"
            />
          </div>

          <div className="space-y-4">
            {visibleGroups.map((group) => {
              const keys = group.entries.map((entry) => entry.key);
              const mutedCount = keys.filter((key) => draft.mutedKinds.includes(key)).length;
              const allMuted = mutedCount === keys.length;
              return (
                <div key={group.id} className="overflow-hidden rounded-2xl border border-border">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold">{group.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{group.nameAr}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {mutedCount > 0 ? (
                        <span className="text-[11px] text-muted-foreground">
                          {mutedCount}/{keys.length} مكتوم
                        </span>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        onClick={() =>
                          patch({
                            mutedKinds: allMuted
                              ? draft.mutedKinds.filter((item) => !keys.includes(item))
                              : Array.from(new Set([...draft.mutedKinds, ...keys])),
                          })
                        }
                      >
                        {allMuted ? "تفعيل القسم" : "كتم القسم"}
                      </Button>
                    </div>
                  </div>

                  <div className="divide-y divide-border">
                    {group.entries.map((entry) => {
                      const fixed =
                        defaults.categories[entry.key] ??
                        defaults.sections[entry.key] ??
                        entry.name;
                      const muted = draft.mutedKinds.includes(entry.key);
                      return (
                        <div
                          key={entry.key}
                          className={`flex flex-wrap items-center gap-2 px-3 py-2.5 ${
                            muted ? "bg-muted/30 opacity-70" : ""
                          }`}
                        >
                          <div className="min-w-40 flex-1">
                            <p className="flex items-center gap-1.5 truncate text-xs font-semibold">
                              {muted ? (
                                <BellOff className="size-3.5 shrink-0 text-muted-foreground" />
                              ) : null}
                              {fixed}
                              {entry.section ? (
                                <Badge variant="outline" className="h-4 px-1 text-[9px]">
                                  صفحة
                                </Badge>
                              ) : null}
                            </p>
                            <p className="truncate text-[10px] text-muted-foreground">
                              {entry.hint}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="hidden rounded-md bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground sm:inline">
                              {entry.key}
                            </span>
                            <Switch
                              checked={!muted}
                              aria-label={`تفعيل ${entry.name}`}
                              onCheckedChange={(value) =>
                                patch({
                                  mutedKinds: value
                                    ? draft.mutedKinds.filter((item) => item !== entry.key)
                                    : [...draft.mutedKinds, entry.key],
                                })
                              }
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {visibleGroups.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">لا توجد نتائج مطابقة</p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => onSave({ ...draft, labels: {} })} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              حفظ
            </Button>
            <Button variant="ghost" onClick={() => patch({ mutedKinds: [] })}>
              إلغاء كل الكتم
            </Button>
          </div>
        </Card>
      ) : null}

      {tab === "people" ? (
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              المشتركون ({linkedSubs.length} مربوط من {subs.length})
            </h3>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={subsLoading}
                onClick={() => void loadSubs(true)}
              >
                {subsLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                جلب معرّفات تليجرام
              </Button>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" />
            <Input
              className="ps-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ابحث بالكود أو الاسم أو @اليوزر"
            />
          </div>

          <div className="grid gap-2">
            {filteredSubs.map((row) => (
              <div
                key={row.userId}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3"
              >
                <Checkbox
                  checked={selected.includes(row.userId)}
                  disabled={!row.linked}
                  aria-label={`اختيار ${row.dulmsId}`}
                  onCheckedChange={(value) =>
                    setSelected((current) =>
                      value ? [...current, row.userId] : current.filter((id) => id !== row.userId),
                    )
                  }
                />
                <div className="min-w-40 flex-1">
                  <p className="truncate text-sm font-medium">{row.name ?? row.dulmsId}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {row.dulmsId}
                    {row.username ? ` · @${row.username}` : ""}
                    {row.telegramName && !row.username ? ` · ${row.telegramName}` : ""}
                  </p>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  آخر مزامنة: {fmt(row.lastSyncAt)}
                </div>
                {row.linked ? (
                  <Badge variant="secondary" className="gap-1">
                    <Link2 className="size-3" /> مربوط
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 text-muted-foreground">
                    <Link2Off className="size-3" /> غير مربوط
                  </Badge>
                )}
                {row.chatId ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label="نسخ رقم المحادثة"
                    onClick={() => void copy(row.chatId!)}
                  >
                    <Copy className="size-4" />
                  </Button>
                ) : null}
              </div>
            ))}
            {!filteredSubs.length ? (
              <p className="py-6 text-center text-xs text-muted-foreground">لا توجد نتائج</p>
            ) : null}
          </div>

          {selected.length ? (
            <div className="flex items-center justify-between rounded-xl bg-primary/10 p-3 text-xs">
              <span>{selected.length} مختار</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setTarget("selected");
                    setTab("send");
                  }}
                >
                  <Send className="size-4" /> إرسال للمختارين
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                  إلغاء التحديد
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      {tab === "send" ? (
        <Card className="space-y-3 p-4">
          <h3 className="text-sm font-semibold">إرسال رسالة عبر البوت</h3>

          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "all", label: "كل المربوطين" },
                { id: "enabled", label: "المفعّلين فقط" },
                { id: "selected", label: `المختارون (${selected.length})` },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setTarget(option.id)}
                className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                  target === option.id
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <Textarea
            value={message}
            maxLength={2000}
            rows={5}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="نص الرسالة…"
          />

          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3">
            <p className="mb-1 text-xs text-muted-foreground">المعاينة كما ستصل</p>
            <pre className="whitespace-pre-wrap text-xs leading-6">
              {[draft.header ?? "إشعار إداري", message || "…", draft.footer]
                .filter(Boolean)
                .join("\n")}
            </pre>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted-foreground">
              ستصل إلى {audienceCount} مشترك · {message.length}/2000 حرف
            </p>
            <Button disabled={sending || message.trim().length < 2} onClick={() => void send()}>
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              إرسال
            </Button>
          </div>
        </Card>
      ) : null}
    </section>
  );
}
