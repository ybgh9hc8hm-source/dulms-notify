import { useState } from "react";
import { Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export type RegistrationConfig = {
  open: boolean;
  seats: number;
  closedMessage: string;
  allowedIds: string[];
  allowlistOnly: boolean;
};

/** Operator types ids free-form (newlines, commas, spaces) — normalize here. */
function parseIds(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,;]+/)
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  );
}

export function AccessPanel({
  config,
  used,
  busy,
  onSave,
}: {
  config: RegistrationConfig;
  used: number;
  busy: boolean;
  onSave: (next: RegistrationConfig) => void;
}) {
  const [draft, setDraft] = useState<RegistrationConfig>({
    ...config,
    allowedIds: config.allowedIds ?? [],
    allowlistOnly: config.allowlistOnly ?? false,
  });
  const [idsText, setIdsText] = useState((config.allowedIds ?? []).join("\n"));
  const remaining = draft.seats > 0 ? Math.max(0, draft.seats - used) : null;
  const parsedIds = parseIds(idsText);

  return (
    <Card className="space-y-4 p-4">
      <h3 className="text-sm font-semibold">التسجيل والمقاعد</h3>

      <div className="flex items-center justify-between gap-3">
        <div>
          <Label htmlFor="reg-open">فتح تسجيل مستخدمين جدد</Label>
          <p className="text-xs text-muted-foreground">عند الإغلاق، يدخل الحسابات المسجّلة فقط.</p>
        </div>
        <Switch
          id="reg-open"
          checked={draft.open}
          onCheckedChange={(value) => setDraft((current) => ({ ...current, open: value }))}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="reg-seats">عدد المقاعد (0 = بلا حد)</Label>
          <Input
            id="reg-seats"
            type="number"
            min={0}
            value={draft.seats}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                seats: Math.max(0, Math.floor(Number(event.target.value) || 0)),
              }))
            }
          />
          <p className="text-[11px] text-muted-foreground">
            مستخدم حاليًا: {used}
            {remaining === null ? " · مقاعد غير محدودة" : ` · متبقٍ ${remaining}`}
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="reg-message">رسالة الإغلاق / الرفض</Label>
          <Textarea
            id="reg-message"
            rows={3}
            value={draft.closedMessage}
            onChange={(event) =>
              setDraft((current) => ({ ...current, closedMessage: event.target.value }))
            }
          />
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-border/60 p-3">
        <div>
          <h4 className="text-sm font-semibold">طلاب مسموح لهم بالاسم (أكواد DULMS)</h4>
          <p className="text-xs text-muted-foreground">
            أي كود هنا يعمل بنفس حالة الحساب الشغّال: يدخل حتى لو التسجيل مغلق أو المقاعد مكتملة أو
            الموقع في وضع الإيقاف الأمني، والبوتات تشتغل معه.
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="reg-allowed">كود لكل سطر (أو مفصولة بمسافة/فاصلة)</Label>
          <Textarea
            id="reg-allowed"
            rows={5}
            dir="ltr"
            className="font-mono text-sm"
            placeholder={"42510975\n42511000"}
            value={idsText}
            onChange={(event) => setIdsText(event.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">عدد الأكواد: {parsedIds.length}</p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div>
            <Label htmlFor="reg-allowlist-only">قصر الموقع على هذه الأكواد فقط</Label>
            <p className="text-xs text-muted-foreground">
              عند التشغيل، أي طالب غير موجود في القائمة يُمنع من الدخول تمامًا.
            </p>
          </div>
          <Switch
            id="reg-allowlist-only"
            checked={draft.allowlistOnly}
            onCheckedChange={(value) =>
              setDraft((current) => ({ ...current, allowlistOnly: value }))
            }
          />
        </div>
      </div>

      <Button onClick={() => onSave({ ...draft, allowedIds: parsedIds })} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        حفظ
      </Button>
    </Card>
  );
}
