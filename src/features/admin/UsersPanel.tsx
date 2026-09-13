import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BellRing,
  CheckCircle2,
  Link2Off,
  Loader2,
  MoreHorizontal,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Trash2,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type AdminAccount = {
  userId: string;
  dulmsId: string;
  name: string | null;
  faculty: string | null;
  program: string | null;
  level: string | null;
  status: string | null;
  cgpa: string | null;
  syncEnabled: boolean;
  telegramLinked: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  lastCheckAt?: string | null;
  checkFailures?: number | null;
  createdAt: string;
};

export type AccountAction =
  | "enable"
  | "disable"
  | "unlinkTelegram"
  | "syncNow"
  | "testMessage"
  | "directMessage"
  | "resetFailures"
  | "delete";

const ALL = "__all__";

function fmt(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ar-EG", {
    dateStyle: "short",
    timeStyle: "short",
    hour12: true,
    timeZone: "Africa/Cairo",
  });
}

function options(accounts: AdminAccount[], key: keyof AdminAccount) {
  const set = new Set<string>();
  for (const account of accounts) {
    const value = account[key];
    if (typeof value === "string" && value.trim()) set.add(value.trim());
  }
  return [...set].sort();
}

type SortKey = "recent" | "name" | "lastSync" | "failures";

export function UsersPanel({
  accounts,
  busy,
  pending = [],
  loading = false,
  onAction,
  onBulk,
}: {
  accounts: AdminAccount[];
  busy: boolean;
  pending?: string[];
  loading?: boolean;
  onAction: (dulmsId: string, action: AccountAction, text?: string) => void;
  onBulk: (dulmsIds: string[], action: AccountAction, text?: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [faculty, setFaculty] = useState(ALL);
  const [program, setProgram] = useState(ALL);
  const [level, setLevel] = useState(ALL);
  const [bot, setBot] = useState(ALL);
  const [sort, setSort] = useState<SortKey>("recent");
  const [selected, setSelected] = useState<string[]>([]);
  const [dialog, setDialog] = useState<{ mode: "one" | "bulk"; target?: string } | null>(null);
  const [message, setMessage] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = accounts.filter((account) => {
      if (q && !`${account.dulmsId} ${account.name ?? ""}`.toLowerCase().includes(q)) return false;
      if (faculty !== ALL && account.faculty !== faculty) return false;
      if (program !== ALL && account.program !== program) return false;
      if (level !== ALL && account.level !== level) return false;
      if (bot === "linked" && !account.telegramLinked) return false;
      if (bot === "unlinked" && account.telegramLinked) return false;
      if (bot === "paused" && account.syncEnabled) return false;
      if (bot === "failing" && account.lastSyncStatus !== "error") return false;
      return true;
    });
    const sorted = [...rows];
    sorted.sort((a, b) => {
      if (sort === "name") return (a.name ?? a.dulmsId).localeCompare(b.name ?? b.dulmsId, "ar");
      if (sort === "failures") return (b.checkFailures ?? 0) - (a.checkFailures ?? 0);
      if (sort === "lastSync")
        return new Date(b.lastSyncAt ?? 0).getTime() - new Date(a.lastSyncAt ?? 0).getTime();
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return sorted;
  }, [accounts, query, faculty, program, level, bot, sort]);

  // Rows are rendered in pages: each row mounts a dropdown menu, so painting
  // hundreds at once froze the panel once the user base grew.
  const PAGE = 40;
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [query, faculty, program, level, bot, sort]);
  const page = useMemo(() => filtered.slice(0, limit), [filtered, limit]);

  const facultyOptions = useMemo(() => options(accounts, "faculty"), [accounts]);
  const programOptions = useMemo(() => options(accounts, "program"), [accounts]);
  const levelOptions = useMemo(() => options(accounts, "level"), [accounts]);

  const visibleIds = useMemo(() => filtered.map((account) => account.dulmsId), [filtered]);
  const selectedVisible = selected.filter((id) => visibleIds.includes(id));
  const allSelected = visibleIds.length > 0 && selectedVisible.length === visibleIds.length;

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  const runBulk = (action: AccountAction) => {
    if (selectedVisible.length === 0) return;
    if (action === "delete" && !window.confirm(`حذف ${selectedVisible.length} حساب نهائيًا؟`))
      return;
    onBulk(selectedVisible, action);
    if (action === "delete") setSelected([]);
  };

  const submitMessage = () => {
    const text = message.trim();
    if (text.length < 2) return;
    if (dialog?.mode === "bulk") onBulk(selectedVisible, "directMessage", text);
    else if (dialog?.target) onAction(dialog.target, "directMessage", text);
    setDialog(null);
    setMessage("");
  };

  const filterSelect = (
    value: string,
    setValue: (next: string) => void,
    placeholder: string,
    items: string[],
  ) => (
    <Select value={value} onValueChange={setValue}>
      <SelectTrigger className="h-9 w-full sm:w-40">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder}: الكل</SelectItem>
        {items.map((item) => (
          <SelectItem key={item} value={item}>
            {item}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="بحث بالاسم أو كود الطالب"
              className="h-9 ps-9"
            />
          </div>
          <Badge variant="secondary" className="shrink-0 tabular-nums">
            {filtered.length}/{accounts.length}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {filterSelect(faculty, setFaculty, "الكلية", facultyOptions)}
          {filterSelect(program, setProgram, "البرنامج", programOptions)}
          {filterSelect(level, setLevel, "المستوى", levelOptions)}

          <Select value={bot} onValueChange={setBot}>
            <SelectTrigger className="h-9 w-full sm:w-40">
              <SelectValue placeholder="الحالة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>الحالة: الكل</SelectItem>
              <SelectItem value="linked">مربوط بتليجرام</SelectItem>
              <SelectItem value="unlinked">غير مربوط</SelectItem>
              <SelectItem value="paused">المزامنة موقوفة</SelectItem>
              <SelectItem value="failing">به أخطاء</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}>
            <SelectTrigger className="h-9 w-full sm:w-40">
              <SelectValue placeholder="الترتيب" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">الأحدث تسجيلًا</SelectItem>
              <SelectItem value="lastSync">آخر مزامنة</SelectItem>
              <SelectItem value="name">الاسم</SelectItem>
              <SelectItem value="failures">الأكثر أخطاءً</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="flex flex-wrap items-center gap-2 p-3">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={allSelected}
            onCheckedChange={(checked) => setSelected(checked ? visibleIds : [])}
            aria-label="تحديد الكل"
          />
          تحديد الكل
        </label>
        <span className="text-xs text-muted-foreground">
          محدد: <span className="tabular-nums">{selectedVisible.length}</span>
        </span>
        <div className="ms-auto flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy || selectedVisible.length === 0}
            onClick={() => runBulk("syncNow")}
          >
            <RefreshCw className="size-4" /> مزامنة
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || selectedVisible.length === 0}
            onClick={() => runBulk("enable")}
          >
            <Play className="size-4" /> تفعيل
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || selectedVisible.length === 0}
            onClick={() => runBulk("disable")}
          >
            <Pause className="size-4" /> إيقاف
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || selectedVisible.length === 0}
            onClick={() => {
              setMessage("");
              setDialog({ mode: "bulk" });
            }}
          >
            <Send className="size-4" /> رسالة
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || selectedVisible.length === 0}
            onClick={() => runBulk("resetFailures")}
          >
            <RotateCcw className="size-4" /> تصفير الأخطاء
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={busy || selectedVisible.length === 0}
            onClick={() => runBulk("delete")}
          >
            <Trash2 className="size-4" /> حذف
          </Button>
        </div>
      </Card>

      <ul className="space-y-2">
        {page.map((account) => {
          const checked = selected.includes(account.dulmsId);
          const rowBusy = pending.includes(account.dulmsId);
          return (
            <li key={account.userId}>
              <Card
                className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3 transition-colors ${
                  checked ? "border-primary/60 bg-primary/5" : ""
                }`}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggle(account.dulmsId)}
                  aria-label={`تحديد ${account.dulmsId}`}
                />
                <div className="min-w-0 space-y-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold">
                      {account.name ?? account.dulmsId}
                    </p>
                    <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                      {account.dulmsId}
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {account.faculty ?? "بدون كلية"} · {account.program ?? "بدون برنامج"} · مستوى{" "}
                    {account.level ?? "—"}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span>آخر مزامنة: {fmt(account.lastSyncAt)}</span>
                    <span>آخر فحص: {fmt(account.lastCheckAt)}</span>
                    {account.checkFailures ? (
                      <span className="text-destructive">أخطاء: {account.checkFailures}</span>
                    ) : null}
                  </p>
                  {account.lastSyncError ? (
                    <p className="flex items-center gap-1 truncate text-[11px] text-destructive">
                      <AlertCircle className="size-3 shrink-0" />
                      {account.lastSyncError.slice(0, 90)}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="hidden flex-col items-end gap-1 sm:flex">
                    <Badge variant={account.telegramLinked ? "default" : "secondary"}>
                      {account.telegramLinked ? "تليجرام" : "بدون بوت"}
                    </Badge>
                    <Badge variant={account.syncEnabled ? "outline" : "destructive"}>
                      {account.syncEnabled ? "مفعّل" : "موقوف"}
                    </Badge>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" disabled={rowBusy} aria-label="إجراءات">
                        {rowBusy ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <MoreHorizontal className="size-4" />
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() =>
                          onAction(account.dulmsId, account.syncEnabled ? "disable" : "enable")
                        }
                      >
                        {account.syncEnabled ? (
                          <Pause className="size-4" />
                        ) : (
                          <Play className="size-4" />
                        )}
                        {account.syncEnabled ? "إيقاف المزامنة" : "تفعيل المزامنة"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onAction(account.dulmsId, "syncNow")}>
                        <RefreshCw className="size-4" /> مزامنة الآن
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onAction(account.dulmsId, "testMessage")}>
                        <BellRing className="size-4" /> رسالة تجريبية
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          setMessage("");
                          setDialog({ mode: "one", target: account.dulmsId });
                        }}
                      >
                        <Send className="size-4" /> رسالة مخصصة
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onAction(account.dulmsId, "resetFailures")}>
                        <RotateCcw className="size-4" /> تصفير الأخطاء
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => onAction(account.dulmsId, "unlinkTelegram")}
                      >
                        <Link2Off className="size-4" /> فك ربط تليجرام
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onSelect={() => onAction(account.dulmsId, "delete")}
                      >
                        <Trash2 className="size-4" /> حذف الحساب
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Card>
            </li>
          );
        })}
        {filtered.length === 0 ? (
          <li>
            <Card className="flex flex-col items-center gap-2 p-10 text-center">
              {loading ? (
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              ) : (
                <Users className="size-6 text-muted-foreground" />
              )}
              <p className="text-sm text-muted-foreground">
                {loading ? "جارٍ تحميل الحسابات…" : "لا توجد حسابات مطابقة للفلاتر"}
              </p>
            </Card>
          </li>
        ) : null}
        {filtered.length > page.length ? (
          <li>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setLimit((current) => current + PAGE)}
            >
              عرض المزيد ({filtered.length - page.length} متبقي)
            </Button>
          </li>
        ) : null}
      </ul>

      <Dialog open={dialog !== null} onOpenChange={(open) => (open ? null : setDialog(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === "bulk"
                ? `رسالة إلى ${selectedVisible.length} حساب`
                : `رسالة إلى ${dialog?.target ?? ""}`}
            </DialogTitle>
            <DialogDescription>تُرسل عبر بوت تليجرام بنفس تنسيق رسائل النظام.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="admin-dm">نص الرسالة</Label>
            <Textarea
              id="admin-dm"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="اكتب الرسالة…"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              إلغاء
            </Button>
            <Button onClick={submitMessage} disabled={busy || message.trim().length < 2}>
              <CheckCircle2 className="size-4" /> إرسال
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
