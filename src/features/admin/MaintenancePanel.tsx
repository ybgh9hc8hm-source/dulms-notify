import { useState } from "react";
import { Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MaintenanceScreen } from "@/components/MaintenanceGate";

export type MaintenanceConfig = {
  enabled: boolean;
  title: string;
  message: string;
  eta: string | null;
};

export function MaintenancePanel({
  config,
  busy,
  onSave,
}: {
  config: MaintenanceConfig;
  busy: boolean;
  onSave: (next: MaintenanceConfig) => void;
}) {
  const [draft, setDraft] = useState<MaintenanceConfig>(config);
  const [preview, setPreview] = useState(false);

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label htmlFor="maint-enabled">تفعيل وضع الصيانة</Label>
            <p className="text-xs text-muted-foreground">
              عند التفعيل تظهر صفحة الصيانة في كل صفحات الموقع، ويظل الدخول متاحًا من لوحة الأدمن
              فقط.
            </p>
          </div>
          <Switch
            id="maint-enabled"
            checked={draft.enabled}
            onCheckedChange={(value) => setDraft((current) => ({ ...current, enabled: value }))}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="maint-title">العنوان</Label>
            <Input
              id="maint-title"
              value={draft.title}
              maxLength={80}
              onChange={(event) =>
                setDraft((current) => ({ ...current, title: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="maint-eta">العودة المتوقعة (اختياري)</Label>
            <Input
              id="maint-eta"
              value={draft.eta ?? ""}
              maxLength={60}
              placeholder="خلال ساعة"
              onChange={(event) =>
                setDraft((current) => ({ ...current, eta: event.target.value || null }))
              }
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="maint-message">نص الرسالة</Label>
          <Textarea
            id="maint-message"
            rows={3}
            maxLength={400}
            value={draft.message}
            onChange={(event) =>
              setDraft((current) => ({ ...current, message: event.target.value }))
            }
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => onSave(draft)} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            حفظ
          </Button>
          <Button variant="outline" onClick={() => setPreview((value) => !value)}>
            {preview ? "إخفاء المعاينة" : "معاينة الصفحة"}
          </Button>
        </div>
      </Card>

      {preview ? (
        <Card className="overflow-hidden p-0">
          <div className="pointer-events-none max-h-[520px] overflow-hidden">
            <MaintenanceScreen
              title={draft.title}
              message={draft.message}
              eta={draft.eta?.trim() ? draft.eta : null}
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
