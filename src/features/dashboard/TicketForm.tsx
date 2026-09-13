/** Structured support-ticket form (site channel), separate from the AI chat. */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Ticket } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supportOpenTicket } from "@/lib/support.functions";
import { TICKET_KINDS, type TicketFormKind } from "@/lib/ticket-form";

export function TicketFormDialog({
  open,
  onOpenChange,
  remaining,
  limit,
  resetLabel,
  onFiled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  remaining: number;
  limit: number;
  resetLabel: string;
  onFiled: (reply: string) => void;
}) {
  const openTicket = useServerFn(supportOpenTicket);
  const [kind, setKind] = useState<TicketFormKind>("bug");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = title.trim().length >= 3 && details.trim().length >= 10;
  const exhausted = remaining <= 0;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await openTicket({
        data: { kind, title: title.trim(), details: details.trim() },
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setTitle("");
      setDetails("");
      setKind("bug");
      onOpenChange(false);
      onFiled(res.reply);
    } catch {
      setError("حصل خطأ في الاتصال، جرّب تاني.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader className="text-start">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Ticket className="size-4" /> استمارة تذكرة دعم
          </DialogTitle>
          <DialogDescription className="text-xs">
            التذكرة بتوصل للفريق مباشرة ورصيدها مستقل عن أسئلة المساعد.
            {limit <= 0
              ? " عدد التذاكر بلا حدود."
              : exhausted
                ? ` خلص رصيد التذاكر — يتجدد ${resetLabel}.`
                : ` متبقي ${remaining}/${limit}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-start">
          <div className="space-y-1.5">
            <Label className="text-xs">نوع التذكرة</Label>
            <Select value={kind} onValueChange={(value) => setKind(value as TicketFormKind)}>
              <SelectTrigger className="text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TICKET_KINDS.map((item) => (
                  <SelectItem key={item.value} value={item.value} className="text-xs">
                    {item.emoji} {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">العنوان</Label>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="عنوان قصير للمشكلة أو الاقتراح"
              maxLength={120}
              className="text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">التفاصيل</Label>
            <Textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="اشرح بالتفصيل: إيه اللي حصل، إمتى، وأي رسالة خطأ ظهرت…"
              maxLength={2000}
              className="min-h-28 text-xs leading-6"
            />
            <p className="text-[10px] text-muted-foreground">{details.trim().length}/2000</p>
          </div>

          {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-start">
          <Button size="sm" onClick={() => void submit()} disabled={!valid || busy || exhausted}>
            {busy ? "جاري الإرسال…" : "إرسال التذكرة"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
