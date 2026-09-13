import { useEffect, useState } from "react";
import { BellRing, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminGetAlertChat, adminSaveAlertChat } from "@/lib/admin.functions";

/**
 * The SLO watchdog computes breaches every tick but can only page someone when
 * a chat is stored in `app_settings.slo_alert`. This card is that switch.
 */
export function AlertChatCard({ adminKey, password }: { adminKey: string; password: string }) {
  const [chatId, setChatId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await adminGetAlertChat({ data: { key: adminKey, password } });
        if (alive && res.ok) setChatId(res.chatId ?? "");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [adminKey, password]);

  const save = async () => {
    setBusy(true);
    try {
      const res = await adminSaveAlertChat({ data: { key: adminKey, password, chatId } });
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    } catch (cause) {
      toast.error((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <BellRing className="size-4 text-muted-foreground" />
        <Label htmlFor="slo-chat">محادثة تنبيهات المشغّل (SLO)</Label>
      </div>
      <p className="text-xs text-muted-foreground">
        معرّف محادثة تيليجرام اللي هيوصلها إنذار لما زمن التسليم أو طابور الإشعارات يتجاوز الحد.
        اتركه فارغًا لإيقاف التنبيهات.
      </p>
      {!loading && !chatId.trim() ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
          ⚠️ قناة التنبيهات غير مضبوطة — أي تجاوز لمستوى الخدمة هيتسجّل في اللوج بس ومحدش هيتبلّغ.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Input
          id="slo-chat"
          className="max-w-xs"
          value={loading ? "" : chatId}
          placeholder={loading ? "جارٍ التحميل…" : "123456789"}
          disabled={loading}
          maxLength={40}
          onChange={(event) => setChatId(event.target.value)}
        />
        <Button onClick={() => void save()} disabled={busy || loading}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          حفظ واختبار
        </Button>
      </div>
    </Card>
  );
}
