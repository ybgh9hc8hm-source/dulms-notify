/** Landing view of the dashboard: student card + at-a-glance counters. */
import { StudentHero, type StudentProfile } from "@/components/dulms/StudentHero";
import { formatDateLocalized, useI18n } from "@/lib/i18n";

interface Props {
  profile: StudentProfile | null;
  dulmsId: string;
  lastSyncAt: string | null;
  totalItems: number;
  unread: number;
}

export function OverviewSummary({ profile, dulmsId, lastSyncAt, totalItems, unread }: Props) {
  const { t, lang } = useI18n();

  return (
    <>
      <h1 className="text-title-1">{t("dash.overviewTitle")}</h1>
      <StudentHero profile={profile} />
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        <div className="card-elevated min-w-0 p-3 sm:p-4">
          <p className="text-xs text-muted-foreground">{t("dash.studentId")}</p>
          <p className="mt-1 truncate font-bold" dir="ltr">
            {dulmsId}
          </p>
        </div>
        <div className="card-elevated min-w-0 p-3 sm:p-4">
          <p className="text-xs text-muted-foreground">{t("dash.lastSync")}</p>
          <p className="mt-1 break-words text-sm font-semibold">
            {formatDateLocalized(lastSyncAt, lang) ?? t("dash.never")}
          </p>
        </div>
        <div className="card-elevated col-span-2 min-w-0 p-3 sm:col-span-1 sm:p-4">
          <p className="text-xs text-muted-foreground">{t("dash.itemsUnread")}</p>
          <p className="mt-1 font-bold text-primary">
            {totalItems} / {unread}
          </p>
        </div>
      </section>
    </>
  );
}
