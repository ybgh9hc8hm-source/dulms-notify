/** Operator-only view of every linked student's DULMS id and stored password. */
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Eye, EyeOff, KeyRound, Loader2, Send, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  adminCredentialRecovery,
  adminKeyringStatus,
  adminListCredentials,
  adminRevealCredential,
  adminReencryptCredentials,
} from "@/lib/admin.functions";

type KeyInfo = { version: number; source: "database" | "environment" };

type Row = {
  userId: string;
  dulmsId: string;
  name: string | null;
  email: string;
  passwordAvailable: boolean;
  telegramLinked: boolean;
  createdAt: string;
  lastSyncAt: string | null;
};

interface Props {
  adminKey: string;
  password: string;
}

export function CredentialsPanel({ adminKey, password }: Props) {
  const list = useServerFn(adminListCredentials);
  const reencrypt = useServerFn(adminReencryptCredentials);
  const recover = useServerFn(adminCredentialRecovery);
  const keyring = useServerFn(adminKeyringStatus);
  const reveal = useServerFn(adminRevealCredential);
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [migrating, setMigrating] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void list({ data: { key: adminKey, password } })
      .then((res) => {
        if (!alive) return;
        if (res.ok) setRows(res.rows as Row[]);
        else toast.error(res.message);
      })
      .catch(() => toast.error("تعذر تحميل بيانات الدخول"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [adminKey, password, list]);

  useEffect(() => {
    let alive = true;
    void keyring({ data: { key: adminKey, password } })
      .then((res) => {
        if (alive && res.ok) setKeys(res.keys as KeyInfo[]);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [adminKey, password, keyring]);

  const filtered = rows.filter((row) =>
    query.trim()
      ? `${row.dulmsId} ${row.name ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())
      : true,
  );

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("تم النسخ");
    } catch {
      toast.error("تعذر النسخ من المتصفح");
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-3">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-accent" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          بيانات حساسة — تظهر لك وحدك بعد فتح اللوحة. الحسابات اللي بتظهر «تعذر فك التشفير» متخزنة
          بمفتاح تشفير قديم ومحتاجة الطالب يسجل دخول مرة تانية.
        </p>
      </div>

      {keys.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 p-3 text-xs">
          <span className="text-muted-foreground">مفاتيح التشفير:</span>
          {keys.map((k) => (
            <Badge
              key={k.version}
              variant={k.source === "database" ? "secondary" : "outline"}
              className="tabular-nums"
            >
              v{k.version} — {k.source === "database" ? "محفوظ في قاعدة البيانات ✔" : "بيئة فقط ⚠"}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث بكود الطالب أو الاسم"
          className="h-10"
        />
        <Badge variant="secondary" className="shrink-0 tabular-nums">
          {filtered.length}
        </Badge>
        <Button
          size="sm"
          variant="secondary"
          className="shrink-0"
          disabled={migrating}
          onClick={() => {
            setMigrating(true);
            void reencrypt({ data: { key: adminKey, password } })
              .then((res) => {
                if (res.ok) toast.success(res.message);
                else toast.error(res.message);
              })
              .catch(() => toast.error("تعذر تحديث التشفير"))
              .finally(() => setMigrating(false));
          }}
        >
          {migrating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <KeyRound className="size-4" />
          )}
          تحديث التشفير
        </Button>
        <Button
          size="sm"
          className="shrink-0"
          disabled={inviting}
          onClick={() => {
            setInviting(true);
            void recover({ data: { key: adminKey, password, send: true } })
              .then((res) => {
                if (res.ok) toast.success(res.message);
                else toast.error(res.message);
              })
              .catch(() => toast.error("تعذر إرسال دعوة إعادة الدخول"))
              .finally(() => setInviting(false));
          }}
        >
          {inviting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          دعوة المتأثرين للدخول
        </Button>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> جارٍ التحميل…
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد حسابات مطابقة.</p>
      ) : (
        <ul className="space-y-2.5">
          {filtered.map((row) => {
            const revealedPassword = revealed[row.userId];
            return (
              <li key={row.userId} className="rounded-2xl border border-border bg-card p-3">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{row.name ?? row.dulmsId}</p>
                    <p className="truncate text-xs text-muted-foreground tabular-nums">
                      {row.dulmsId}
                    </p>
                  </div>
                  <Badge
                    variant={row.telegramLinked ? "secondary" : "outline"}
                    className="shrink-0"
                  >
                    {row.telegramLinked ? "تليجرام متصل" : "بدون تليجرام"}
                  </Badge>
                </div>

                <div className="mt-2.5 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-2.5 py-2 text-xs">
                    {row.passwordAvailable
                      ? (revealedPassword ?? "••••••••••••••")
                      : "تعذر فك التشفير — يحتاج إعادة تسجيل دخول"}
                  </code>
                  {row.passwordAvailable ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="إظهار"
                        disabled={revealing === row.userId}
                        onClick={async () => {
                          if (revealedPassword) {
                            setRevealed((current) => {
                              const next = { ...current };
                              delete next[row.userId];
                              return next;
                            });
                            return;
                          }
                          setRevealing(row.userId);
                          try {
                            const result = await reveal({
                              data: { key: adminKey, password, userId: row.userId },
                            });
                            if (!result.ok || !result.password) toast.error(result.message);
                            else
                              setRevealed((current) => ({
                                ...current,
                                [row.userId]: result.password,
                              }));
                          } finally {
                            setRevealing(null);
                          }
                        }}
                      >
                        {revealing === row.userId ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : revealedPassword ? (
                          <EyeOff className="size-4" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="نسخ"
                        disabled={!revealedPassword}
                        onClick={() => revealedPassword && void copy(revealedPassword)}
                      >
                        <Copy className="size-4" />
                      </Button>
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
