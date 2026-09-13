/** Alerts (notifications) view. */
import { Button } from "@/components/ui/button";
import { formatDateLocalized, useI18n, type Lang } from "@/lib/i18n";
import { localizeDulms } from "@/lib/dulms-localize";

/** Stored alerts are "<Arabic label>: <scraped text>" — translate both halves. */
const ALERT_LABELS: Record<string, string> = {
  "كويز جديد": "New quiz",
  "تكليف جديد": "New assignment",
  "تحديث في الجدول": "Schedule update",
  "غياب جديد": "New absence",
  "تنبيه من DULMS": "DULMS notice",
  "حدث جديد في التقويم": "New calendar event",
  "إعلان جديد": "New announcement",
  "درجة في دفتر الدرجات": "Coursework grade",
  "نتيجة نهائية": "Final result",
  "إنذار جديد": "New academic warning",
  "تحديث جديد": "New update",
  "تحديث في الدرجة": "Grade updated",
  "تحديث في النتيجة النهائية": "Final result updated",
  "تحديث في الغياب": "Absence updated",
  "تحديث في سجل الحضور": "Attendance record updated",
  "تحديث في تكليف": "Assignment updated",
  "تحديث في كويز": "Quiz updated",
  "تحديث في تنبيه": "Notice updated",
  "تحديث في عنصر": "Item updated",
};

function localizeAlert(value: string, lang: Lang): string {
  if (lang === "ar") return value;
  const idx = value.indexOf(":");
  if (idx > 0) {
    const label = ALERT_LABELS[value.slice(0, idx).trim()];
    if (label) return `${label}: ${localizeDulms(value.slice(idx + 1).trim(), lang)}`;
  }
  return localizeDulms(value, lang);
}

export interface AlertRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
}

interface Props {
  notifications: readonly AlertRow[];
  unread: number;
  onMarkAllRead: () => void;
}

export function AlertsPanel({ notifications, unread, onMarkAllRead }: Props) {
  const { t, lang } = useI18n();

  return (
    <section className="space-y-3">
      {unread > 0 && (
        <Button variant="secondary" size="sm" onClick={onMarkAllRead}>
          {t("common.markAllRead")}
        </Button>
      )}
      {notifications.length === 0 && <p className="text-subhead">{t("dash.noAlerts")}</p>}
      {notifications.map((item) => (
        <article key={item.id} className="card-elevated overflow-hidden p-4">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <p className="text-headline break-words">{localizeAlert(item.title, lang)}</p>
            {!item.read_at && <span className="mt-2 size-2 rounded-full bg-primary" />}
          </div>
          {item.body && (
            <p className="text-subhead mt-1 break-words">{localizeAlert(item.body, lang)}</p>
          )}
          <p className="text-caption mt-2">{formatDateLocalized(item.created_at, lang)}</p>
        </article>
      ))}
    </section>
  );
}
