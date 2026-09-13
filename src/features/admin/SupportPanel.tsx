/**
 * AI Assistant & Support control centre.
 *
 * Three tabs:
 *  الإعدادات   → master switches, model, sampling, memory, operator knowledge
 *  الوارد      → suggestions / bug reports / notes captured from students
 *  النشاط      → usage stats and the newest conversation turns
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Bot,
  Bug,
  Inbox,
  Lightbulb,
  Loader2,
  MessageCircle,
  RefreshCw,
  Save,
  Search,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  adminSaveSupportConfig,
  adminSupportOverview,
  adminTicketAction,
} from "@/lib/admin.functions";

export type SupportConfig = {
  enabled: boolean;
  webEnabled: boolean;
  telegramEnabled: boolean;
  model: string;
  temperature: number;
  maxTokens: number;
  historyTurns: number;
  accountAccess: boolean;
  ticketsEnabled: boolean;
  knowledge: string;
  welcome: string;
  offlineMessage: string;
};

type Ticket = {
  id: string;
  user_id: string | null;
  dulms_id: string | null;
  channel: string;
  chat_id: string | null;
  kind: string;
  title: string;
  body: string;
  status: string;
  priority: string;
  admin_note: string | null;
  created_at: string;
};

type RecentMessage = {
  id: string;
  user_id: string | null;
  channel: string;
  role: string;
  content: string;
  created_at: string;
};

type Stats = {
  questions7d: number;
  answers7d: number;
  web7d: number;
  telegram7d: number;
  openTickets: number;
  suggestions: number;
  bugs: number;
};

type TabId = "settings" | "inbox" | "activity";

const TABS: { id: TabId; label: string; icon: typeof Bot }[] = [
  { id: "settings", label: "الإعدادات", icon: Sparkles },
  { id: "inbox", label: "الوارد", icon: Inbox },
  { id: "activity", label: "النشاط", icon: MessageCircle },
];

const KIND_LABEL: Record<string, string> = {
  suggestion: "اقتراح",
  bug: "بلاغ خطأ",
  question: "سؤال",
  note: "ملاحظة",
};

const STATUS_LABEL: Record<string, string> = {
  open: "جديد",
  in_progress: "قيد التنفيذ",
  resolved: "تم الحل",
  archived: "مؤرشف",
};

function when(iso: string) {
  return new Date(iso).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" });
}

export function SupportPanel({ adminKey, password }: { adminKey: string; password: string }) {
  const load = useServerFn(adminSupportOverview);
  const saveConfig = useServerFn(adminSaveSupportConfig);
  const ticketAction = useServerFn(adminTicketAction);

  const [tab, setTab] = useState<TabId>("settings");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<SupportConfig | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [recent, setRecent] = useState<RecentMessage[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const res = await load({ data: { key: adminKey, password } });
      if (!res.ok) {
        toast.error(res.message ?? "تعذّر التحميل");
        return;
      }
      setConfig(res.support as SupportConfig);
      setModels(res.models ?? []);
      setTickets((res.tickets ?? []) as Ticket[]);
      setRecent((res.recent ?? []) as RecentMessage[]);
      setStats(res.stats as Stats);
    } catch {
      toast.error("تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }, [adminKey, load, password]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const patch = (next: Partial<SupportConfig>) =>
    setConfig((current) => (current ? { ...current, ...next } : current));

  async function persist() {
    if (!config) return;
    setSaving(true);
    try {
      const res = await saveConfig({ data: { key: adminKey, password, support: config } });
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    } finally {
      setSaving(false);
    }
  }

  async function act(id: string, action: string, text?: string) {
    const res = await ticketAction({ data: { key: adminKey, password, id, action, text } });
    if (res.ok) {
      toast.success(res.message);
      await refresh();
    } else {
      toast.error(res.message);
    }
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tickets.filter((ticket) => {
      if (statusFilter !== "all" && ticket.status !== statusFilter) return false;
      if (!needle) return true;
      return `${ticket.title} ${ticket.body} ${ticket.dulms_id ?? ""}`
        .toLowerCase()
        .includes(needle);
    });
  }, [query, statusFilter, tickets]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <Button
              key={item.id}
              size="sm"
              variant={active ? "default" : "outline"}
              onClick={() => setTab(item.id)}
            >
              <Icon className="size-4" />
              {item.label}
              {item.id === "inbox" && stats?.openTickets ? (
                <Badge variant="secondary">{stats.openTickets}</Badge>
              ) : null}
            </Button>
          );
        })}
        <Button size="sm" variant="ghost" className="ms-auto" onClick={() => void refresh()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          تحديث
        </Button>
      </div>

      {tab === "settings" && config ? (
        <Card className="space-y-5 p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <ToggleRow
              label="المساعد الذكي"
              hint="المفتاح الرئيسي للموقع والبوت"
              checked={config.enabled}
              onChange={(value) => patch({ enabled: value })}
            />
            <ToggleRow
              label="شات الموقع"
              hint="الزر العائم داخل لوحة الطالب"
              checked={config.webEnabled}
              onChange={(value) => patch({ webEnabled: value })}
            />
            <ToggleRow
              label="بوت الدعم"
              hint="بوت تليجرام المستقل"
              checked={config.telegramEnabled}
              onChange={(value) => patch({ telegramEnabled: value })}
            />
          </div>

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>النموذج</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={config.model}
                onChange={(event) => patch({ model: event.target.value })}
              >
                <option value="auto">تلقائي (أفضل نموذج مجاني متاح)</option>
                {models.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                عند فشل النموذج المختار يتم التبديل تلقائيًا لنموذج مجاني آخر.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <NumberField
                label="الحرارة"
                value={config.temperature}
                step={0.1}
                min={0}
                max={1.5}
                onChange={(value) => patch({ temperature: value })}
              />
              <NumberField
                label="حد الكلمات"
                value={config.maxTokens}
                step={50}
                min={150}
                max={4000}
                onChange={(value) => patch({ maxTokens: Math.round(value) })}
              />
              <NumberField
                label="ذاكرة الرسائل"
                value={config.historyTurns}
                step={1}
                min={2}
                max={40}
                onChange={(value) => patch({ historyTurns: Math.round(value) })}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <ToggleRow
              label="الوصول لبيانات الطالب"
              hint="قراءة الدرجات والغياب للرد الدقيق"
              checked={config.accountAccess}
              onChange={(value) => patch({ accountAccess: value })}
            />
            <ToggleRow
              label="تسجيل المقترحات والبلاغات"
              hint="تحويل رسائل الطلاب لتذاكر في الوارد"
              checked={config.ticketsEnabled}
              onChange={(value) => patch({ ticketsEnabled: value })}
            />
          </div>

          <Separator />

          <div className="space-y-1.5">
            <Label>معلومات إضافية للمساعد</Label>
            <Textarea
              rows={5}
              value={config.knowledge}
              placeholder="سياسات، مواعيد، إجابات جاهزة… يقرأها المساعد قبل كل رد."
              onChange={(event) => patch({ knowledge: event.target.value })}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>رسالة الترحيب</Label>
              <Textarea
                rows={3}
                value={config.welcome}
                onChange={(event) => patch({ welcome: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>رسالة الإيقاف</Label>
              <Textarea
                rows={3}
                value={config.offlineMessage}
                onChange={(event) => patch({ offlineMessage: event.target.value })}
              />
            </div>
          </div>

          <Button onClick={() => void persist()} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            حفظ الإعدادات
          </Button>
        </Card>
      ) : null}

      {tab === "inbox" ? (
        <div className="space-y-3">
          <Card className="flex flex-wrap items-center gap-2 p-3">
            <div className="relative min-w-52 flex-1">
              <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" />
              <Input
                className="ps-9"
                placeholder="ابحث في الطلبات…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            {["open", "in_progress", "resolved", "archived", "all"].map((status) => (
              <Button
                key={status}
                size="sm"
                variant={statusFilter === status ? "default" : "outline"}
                onClick={() => setStatusFilter(status)}
              >
                {status === "all" ? "الكل" : STATUS_LABEL[status]}
              </Button>
            ))}
          </Card>

          {filtered.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              لا توجد طلبات في هذا التصنيف.
            </Card>
          ) : null}

          {filtered.map((ticket) => (
            <Card key={ticket.id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={ticket.kind === "bug" ? "destructive" : "secondary"}>
                  {ticket.kind === "bug" ? (
                    <Bug className="size-3" />
                  ) : (
                    <Lightbulb className="size-3" />
                  )}
                  {KIND_LABEL[ticket.kind] ?? ticket.kind}
                </Badge>
                <Badge variant="outline">{STATUS_LABEL[ticket.status] ?? ticket.status}</Badge>
                <Badge variant="outline">{ticket.channel === "web" ? "الموقع" : "تليجرام"}</Badge>
                {ticket.dulms_id ? <Badge variant="outline">{ticket.dulms_id}</Badge> : null}
                <span className="ms-auto text-xs text-muted-foreground">
                  {when(ticket.created_at)}
                </span>
              </div>

              <div>
                <p className="font-semibold">{ticket.title}</p>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{ticket.body}</p>
              </div>

              {ticket.admin_note ? (
                <p className="rounded-md bg-muted/50 p-2 text-xs">📝 {ticket.admin_note}</p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void act(ticket.id, "in_progress")}
                >
                  قيد التنفيذ
                </Button>
                <Button size="sm" variant="outline" onClick={() => void act(ticket.id, "resolved")}>
                  تم الحل
                </Button>
                <Button size="sm" variant="outline" onClick={() => void act(ticket.id, "archived")}>
                  أرشفة
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setReplyFor(replyFor === ticket.id ? null : ticket.id);
                    setReplyText("");
                  }}
                >
                  <Send className="size-4" />
                  رد على الطالب
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => void act(ticket.id, "delete")}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              {replyFor === ticket.id ? (
                <div className="space-y-2">
                  <Textarea
                    rows={3}
                    placeholder="نص الرد الذي سيصل للطالب على تليجرام…"
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void act(ticket.id, "reply", replyText)}>
                      إرسال
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void act(ticket.id, "note", replyText)}
                    >
                      حفظ كملاحظة داخلية
                    </Button>
                  </div>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      ) : null}

      {tab === "activity" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="أسئلة (7 أيام)" value={stats?.questions7d ?? 0} />
            <StatCard label="ردود المساعد" value={stats?.answers7d ?? 0} />
            <StatCard label="من الموقع" value={stats?.web7d ?? 0} />
            <StatCard label="من تليجرام" value={stats?.telegram7d ?? 0} />
            <StatCard label="طلبات مفتوحة" value={stats?.openTickets ?? 0} />
            <StatCard label="اقتراحات" value={stats?.suggestions ?? 0} />
            <StatCard label="بلاغات أخطاء" value={stats?.bugs ?? 0} />
          </div>

          <Card className="divide-y p-0">
            {recent.map((message) => (
              <div key={message.id} className="space-y-1 p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant={message.role === "user" ? "secondary" : "outline"}>
                    {message.role === "user" ? "طالب" : "مساعد"}
                  </Badge>
                  <span>{message.channel === "web" ? "الموقع" : "تليجرام"}</span>
                  <span className="ms-auto">{when(message.created_at)}</span>
                </div>
                <p className="line-clamp-3 whitespace-pre-wrap text-sm">{message.content}</p>
              </div>
            ))}
            {recent.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">لا توجد محادثات بعد.</p>
            ) : null}
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function NumberField({
  label,
  value,
  step,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
    </Card>
  );
}
