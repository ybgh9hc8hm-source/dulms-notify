/** Portable secret vault: one master password, everything else encrypted in the database. */
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  Copy,
  Download,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  vaultDeleteSecret,
  vaultExport,
  vaultImport,
  vaultInit,
  vaultOverview,
  vaultSetSecret,
  vaultSync,
} from "@/lib/vault.functions";

type Status = {
  configured: boolean;
  passphraseSet: boolean;
  unlocked: boolean;
  error: string | null;
  items: {
    name: string;
    note: string | null;
    inVault: boolean;
    inEnv: boolean;
    critical: boolean;
    preview: string | null;
    updatedAt: string | null;
  }[];
};

interface Props {
  adminKey: string;
  password: string;
}

export function VaultPanel({ adminKey, password }: Props) {
  const overview = useServerFn(vaultOverview);
  const init = useServerFn(vaultInit);
  const setSecretFn = useServerFn(vaultSetSecret);
  const removeSecret = useServerFn(vaultDeleteSecret);
  const sync = useServerFn(vaultSync);
  const exportFn = useServerFn(vaultExport);
  const importFn = useServerFn(vaultImport);

  const [status, setStatus] = useState<Status | null>(null);
  const [bootstrap, setBootstrap] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [passphrase, setPassphrase] = useState("");
  const [currentPassphrase, setCurrentPassphrase] = useState("");
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [bundleText, setBundleText] = useState("");
  const [restorePass, setRestorePass] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await overview({ data: { key: adminKey, password } });
      if (res.ok) {
        setStatus(res.status as Status);
        setBootstrap(res.bootstrap);
      } else toast.error(res.message);
    } catch {
      toast.error("تعذر قراءة حالة الخزنة");
    } finally {
      setLoading(false);
    }
  }, [adminKey, password, overview]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res.ok) toast.success(res.message ?? "تم");
      else toast.error(res.message ?? "فشلت العملية");
      await refresh();
    } catch {
      toast.error("فشلت العملية");
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    setBusy(true);
    try {
      const res = await exportFn({ data: { key: adminKey, password } });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      const blob = new Blob([JSON.stringify(res.bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dulms-vault-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("تم تنزيل النسخة المشفّرة");
    } catch {
      toast.error("تعذر تصدير النسخة");
    } finally {
      setBusy(false);
    }
  };

  /** Copies the encrypted bundle to paste into the `VAULT_SEED_JSON` secret —
   * the carrier that survives a move to another account. Never stored in code. */
  const copySeedFile = async () => {
    setBusy(true);
    try {
      const res = await exportFn({ data: { key: adminKey, password } });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      await navigator.clipboard.writeText(JSON.stringify(res.bundle));
      toast.success("اتنسخت النسخة المشفّرة — الصقها في السر VAULT_SEED_JSON");
    } catch {
      toast.error("تعذر تجهيز ملف المشروع");
    } finally {
      setBusy(false);
    }
  };

  const missing = (status?.items ?? []).filter((i) => i.critical && !i.inVault);

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <ShieldCheck className="size-4 text-primary" />
          <h2 className="text-base font-bold">خزنة المشروع</h2>
          {loading ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <>
              <Badge variant={status?.configured ? "secondary" : "outline"}>
                {status?.configured ? "مهيأة" : "غير مهيأة"}
              </Badge>
              <Badge variant={status?.unlocked ? "secondary" : "outline"}>
                {status?.unlocked ? "مفتوحة" : "مقفولة"}
              </Badge>
              <Badge variant={status?.passphraseSet ? "secondary" : "outline"}>
                VAULT_PASSPHRASE {status?.passphraseSet ? "مضبوط" : "ناقص"}
              </Badge>
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="ms-auto"
            disabled={busy}
            onClick={() => void refresh()}
          >
            <RefreshCw className="size-4" /> تحديث
          </Button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          كل الأسرار (توكنات البوتات، مفاتيح الذكاء الاصطناعي، كلمة لوحة الإدارة، ومفاتيح تشفير
          بيانات الطلاب) متخزنة مشفّرة جوه قاعدة البيانات بكلمة سر واحدة من اختيارك. لما تنقل
          المشروع لحساب لوفابل جديد، مش هتحتاج تدخل غير سر واحد اسمه{" "}
          <code className="rounded bg-muted px-1">VAULT_PASSPHRASE</code> وكل حاجة ترجع لوحدها.
        </p>
        {status?.error && (
          <p className="mt-2 rounded-xl border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            {status.error}
          </p>
        )}
        {missing.length > 0 && (
          <p className="mt-2 rounded-xl border border-accent/40 bg-accent/10 p-2 text-xs">
            أسرار مهمة لسه مش محفوظة في الخزنة: {missing.map((m) => m.name).join("، ")}
          </p>
        )}
      </div>

      {/* Master passphrase */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Lock className="size-4" />
          <h3 className="text-sm font-bold">
            {status?.configured ? "تغيير كلمة سر الخزنة" : "تجهيز الخزنة"}
          </h3>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {status?.configured && (
            <div className="space-y-1.5">
              <Label className="text-xs">كلمة السر الحالية</Label>
              <Input
                type="password"
                value={currentPassphrase}
                onChange={(e) => setCurrentPassphrase(e.target.value)}
                placeholder="لو مضبوطة في VAULT_PASSPHRASE سيبها فاضية"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">كلمة السر الجديدة (10 حروف على الأقل)</Label>
            <Input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="اختر كلمة سر تحفظها كويس"
            />
          </div>
        </div>
        <Button
          className="mt-3"
          disabled={busy || passphrase.trim().length < 10}
          onClick={() =>
            void run(async () => {
              const res = await init({
                data: {
                  key: adminKey,
                  password,
                  passphrase,
                  ...(currentPassphrase ? { currentPassphrase } : {}),
                },
              });
              setPassphrase("");
              setCurrentPassphrase("");
              return res;
            })
          }
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
          {status?.configured ? "تغيير كلمة السر وإعادة التشفير" : "تجهيز الخزنة وسحب كل الأسرار"}
        </Button>
        <p className="mt-2 text-[11px] text-muted-foreground">
          بعد التجهيز، ضيف سر باسم VAULT_PASSPHRASE بنفس الكلمة دي في إعدادات المشروع — ده السر
          الوحيد اللي هتحتاجه بعد أي نقل.
        </p>
      </div>

      {/* Backup / restore */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-sm font-bold">نسخة احتياطية للنقل</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          النسخة مشفّرة بالكامل — من غير كلمة السر مش هينفع تتقرا. أهم زرار هنا «نسخ النسخة المشفّرة»:
          الصق الناتج في سر باسم VAULT_SEED_JSON في إعدادات المشروع (مش في الكود، عشان الريبو يبقى
          آمن لو بقى عام). لما تنقل المشروع لحساب جديد بداتابيز فاضية، السيستم بيفك النسخة دي
          أوتوماتيك بـ VAULT_PASSPHRASE ويرجّع كل الأسرار.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => void copySeedFile()}>
            <Copy className="size-4" /> نسخ النسخة المشفّرة (VAULT_SEED_JSON)
          </Button>
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void download()}>
            <Download className="size-4" /> تنزيل نسخة مشفّرة
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void run(() => sync({ data: { key: adminKey, password } }))}
          >
            <RefreshCw className="size-4" /> سحب الأسرار من البيئة للخزنة
          </Button>
        </div>

        <Separator className="my-4" />
        <Label className="text-xs">استرجاع نسخة (الصق محتوى الملف)</Label>
        <Textarea
          className="mt-1.5 h-28 font-mono text-[11px]"
          value={bundleText}
          onChange={(e) => setBundleText(e.target.value)}
          placeholder='{"format":"dulms-vault", ...}'
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input
            type="password"
            className="max-w-xs"
            value={restorePass}
            onChange={(e) => setRestorePass(e.target.value)}
            placeholder="كلمة سر الخزنة الخاصة بالنسخة"
          />
          <Button
            size="sm"
            disabled={busy || !bundleText.trim() || !restorePass}
            onClick={() =>
              void run(async () => {
                const res = await importFn({
                  data: { key: adminKey, password, bundle: bundleText, passphrase: restorePass },
                });
                if (res.ok) {
                  setBundleText("");
                  setRestorePass("");
                }
                return res;
              })
            }
          >
            <Upload className="size-4" /> استرجاع
          </Button>
        </div>
      </div>

      {/* Inventory */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-sm font-bold">جرد الأسرار</h3>
        <p className="mt-1 text-[11px] text-muted-foreground">
          أسرار لازم تفضل في إعدادات المنصة (مش في الخزنة): {bootstrap.join("، ")}
        </p>
        <ul className="mt-3 space-y-2">
          {(status?.items ?? []).map((item) => (
            <li
              key={item.name}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 p-2.5"
            >
              {item.inVault ? (
                <CheckCircle2 className="size-4 shrink-0 text-primary" />
              ) : (
                <XCircle className="size-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs">{item.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {item.note ?? "—"} {item.preview ? `• ${item.preview}` : ""}
                </p>
              </div>
              {item.critical && (
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  أساسي
                </Badge>
              )}
              <Badge
                variant={item.inEnv ? "secondary" : "outline"}
                className="shrink-0 text-[10px]"
              >
                {item.inEnv ? "في البيئة" : "من الخزنة"}
              </Badge>
              {item.inVault && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="حذف"
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      removeSecret({ data: { key: adminKey, password, name: item.name } }),
                    )
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>

        <Separator className="my-4" />
        <Label className="text-xs">إضافة / تحديث سر</Label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <Input
            className="max-w-[220px] font-mono text-xs"
            value={newName}
            onChange={(e) => setNewName(e.target.value.toUpperCase())}
            placeholder="SECRET_NAME"
          />
          <Input
            className="min-w-[200px] flex-1"
            type="password"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="القيمة"
          />
          <Button
            size="sm"
            disabled={busy || !newName.trim() || !newValue}
            onClick={() =>
              void run(async () => {
                const res = await setSecretFn({
                  data: { key: adminKey, password, name: newName.trim(), value: newValue },
                });
                if (res.ok) {
                  setNewName("");
                  setNewValue("");
                }
                return res;
              })
            }
          >
            حفظ
          </Button>
        </div>
      </div>
    </section>
  );
}
