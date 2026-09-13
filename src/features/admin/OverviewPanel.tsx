import { Card } from "@/components/ui/card";

export type Overview = {
  stats: {
    users: number;
    accounts: number;
    syncEnabled: number;
    botUsers: number;
    items: number;
    itemsArchived: number;
    notifications24h: number;
    syncErrors24h: number;
    failingAccounts: number;
    seatsUsed: number;
    seatLimit: number;
    registrationOpen: boolean;
  };
  breakdown: {
    faculty: { label: string; count: number }[];
    program: { label: string; count: number }[];
    level: { label: string; count: number }[];
    status: { label: string; count: number }[];
  };
  capacity?: {
    ceiling: number;
    sentinelCapacity: number;
    personalCapacity: number;
    effectiveInterval: number;
    personalInterval: number;
    baseInterval: number;
    utilization: number;
    cover: number;
    passengers: number;
    compression: number;
    maxStudentsServable: number;
    recommendedSeats: number;
    shardsNeeded: number;
    outboxPending: number;
  };
  slo?: {
    detectP50: number;
    detectP95: number;
    deliveryP50: number;
    deliveryP95: number;
    deliverySamples: number;
    pending: number;
    dead: number;
    sent: number;
    oldestPendingSeconds: number;
  };
  breaker?: {
    factor: number;
    open: boolean;
    reason: string | null;
    errorRate: number;
    blockRate: number;
    p95: number | null;
  };
};

function latency(seconds: number): string {
  if (seconds <= 0) return "—";
  if (seconds < 90) return `${seconds} ثانية`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} دقيقة`;
  return `${(seconds / 3600).toFixed(1)} ساعة`;
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </Card>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0) || 1;
  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <ul className="space-y-2">
        {rows.slice(0, 12).map((row) => (
          <li key={row.label} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate">{row.label}</span>
              <span className="tabular-nums text-muted-foreground">{row.count}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.round((row.count / total) * 100)}%` }}
              />
            </div>
          </li>
        ))}
        {rows.length === 0 ? (
          <li className="text-xs text-muted-foreground">لا توجد بيانات</li>
        ) : null}
      </ul>
    </Card>
  );
}

export function OverviewPanel({ overview }: { overview: Overview | null }) {
  if (!overview) {
    return <p className="text-sm text-muted-foreground">جارٍ تحميل الإحصائيات…</p>;
  }
  const { stats, breakdown, capacity, slo, breaker } = overview;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="مستخدمو الموقع"
          value={stats.users}
          hint={`${stats.accounts} حساب دالمز مربوط`}
        />
        <Stat
          label="المزامنة المفعّلة"
          value={stats.syncEnabled}
          hint={
            stats.accounts > 0
              ? `${Math.round((stats.syncEnabled / stats.accounts) * 100)}% من الحسابات`
              : "لا توجد حسابات"
          }
        />
        <Stat label="مستخدمو البوت" value={stats.botUsers} hint="حسابات مربوطة بتليجرام" />
        <Stat
          label="المقاعد"
          value={
            stats.seatLimit > 0 ? `${stats.seatsUsed}/${stats.seatLimit}` : `${stats.seatsUsed}/∞`
          }
          hint={stats.registrationOpen ? "التسجيل مفتوح" : "التسجيل مغلق"}
        />
        <Stat
          label="العناصر النشطة"
          value={stats.items}
          hint={`${stats.itemsArchived} عنصر مؤرشف`}
        />
        <Stat label="إشعارات آخر ٢٤ ساعة" value={stats.notifications24h} />
        <Stat label="أخطاء مزامنة ٢٤ ساعة" value={stats.syncErrors24h} />
        <Stat label="حسابات متعثرة" value={stats.failingAccounts} hint="فشل مزامنة أو فحص" />
      </div>

      {capacity ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="زمن الأخبار المشتركة"
            value={latency(capacity.effectiveInterval)}
            hint={`الهدف ${latency(capacity.baseInterval)}`}
          />
          <Stat
            label="زمن البيانات الشخصية"
            value={latency(capacity.personalInterval)}
            hint={`${capacity.personalCapacity} طلب/دقيقة للمسح الشخصي`}
          />
          <Stat
            label="مجموعة المراقبة"
            value={`${capacity.cover} / ${capacity.cover + capacity.passengers}`}
            hint={`كل حساب مراقَب يخدم ${capacity.compression}× طالب`}
          />
          <Stat
            label="استهلاك سقف الطلبات"
            value={`${Math.round(capacity.utilization * 100)}%`}
            hint={`${capacity.sentinelCapacity}/${capacity.ceiling} طلب/دقيقة للحارس`}
          />
          <Stat
            label="السعة القصوى"
            value={capacity.maxStudentsServable}
            hint={`المقاعد الموصى بها ${capacity.recommendedSeats}`}
          />
          <Stat
            label="قائمة الإرسال"
            value={capacity.outboxPending}
            hint={`${capacity.shardsNeeded} عامل مطلوب/دقيقة`}
          />
        </div>
      ) : null}

      {slo ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="زمن الاكتشاف ← الإشعار (p50)"
            value={slo.detectP50 ? `${Math.round(slo.detectP50)} ms` : "—"}
            hint={slo.detectP95 ? `p95 ${Math.round(slo.detectP95)} ms` : "لا توجد عينات"}
          />
          <Stat
            label="زمن التسليم للتليجرام (p50)"
            value={slo.deliveryP50 ? `${(slo.deliveryP50 / 1000).toFixed(1)} ث` : "—"}
            hint={
              slo.deliveryP95 ? `p95 ${(slo.deliveryP95 / 1000).toFixed(1)} ث` : "لا توجد عينات"
            }
          />
          <Stat
            label="رسائل مُسلَّمة (٦ ساعات)"
            value={slo.sent}
            hint={`قيد الانتظار الآن ${slo.pending} • فشل نهائي (الكل) ${slo.dead}`}
          />
          <Stat
            label="أقدم رسالة منتظرة"
            value={slo.oldestPendingSeconds ? latency(slo.oldestPendingSeconds) : "—"}
            hint={
              breaker
                ? breaker.open
                  ? `قاطع الحماية مفتوح: ${breaker.reason ?? "دالمز غير مستقر"}`
                  : `صحة دالمز ${Math.round(breaker.factor * 100)}%${breaker.reason ? ` • ${breaker.reason}` : ""}`
                : ""
            }
          />
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <Breakdown title="الكليات" rows={breakdown.faculty} />
        <Breakdown title="البرامج / الأقسام" rows={breakdown.program} />
        <Breakdown title="المستويات" rows={breakdown.level} />
        <Breakdown title="الحالة الأكاديمية" rows={breakdown.status} />
      </div>
    </div>
  );
}
