import { GraduationCap, UserRound } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { getStudentPhoto } from "@/lib/dulms.functions";

export interface StudentProfile {
  name?: string | null;
  dulmsId?: string | null;
  photo?: string | null;
  /** Set by the overview read model when a photo exists but was not inlined. */
  hasPhoto?: boolean;
  faculty?: string | null;
  program?: string | null;
  guide?: string | null;
  status?: string | null;
  level?: string | null;
  cgpa?: string | null;
  sgpa?: string | null;
  passedHours?: number | null;
  requiredHours?: number | null;
  remainingHours?: number | null;
  registeredCourses?: string | null;
  gpaHistory?: { semester: string; sgpa: number | null; cgpa: number | null }[];
  planGroups?: { name: string; totalHours: number; passedHours: number }[];
}

/** Loads the multi-megabyte photo separately so the overview stays small. */
function useStudentPhoto(profile: StudentProfile | null) {
  const enabled = Boolean(profile && !profile.photo && profile.hasPhoto);
  const { data } = useQuery({
    // Scoped by student id on purpose: with a literal key, an hour-long cache
    // entry survives a sign-out on a shared device and the next account would
    // render the previous student's face.
    queryKey: ["student-photo", profile?.dulmsId ?? null],
    queryFn: () => getStudentPhoto(),
    enabled,
    staleTime: 60 * 60_000,
    gcTime: 60 * 60_000,
    refetchOnWindowFocus: false,
  });
  return profile?.photo ?? data?.photo ?? null;
}

function initials(name?: string | null) {
  if (!name) return "؟";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center rounded-2xl bg-secondary/35 px-2 py-4 text-center sm:py-5">
      <p
        className="text-[1.35rem] font-semibold leading-none tracking-[-0.02em] tabular-nums text-primary"
        dir="ltr"
      >
        {value}
      </p>
      <p className="text-caption mt-2 max-w-full leading-snug">{label}</p>
    </div>
  );
}

function HoursRing({
  passed,
  required,
  label,
}: {
  passed: number;
  required: number;
  label: string;
}) {
  const remaining = Math.max(required - passed, 0);
  const ratio = required > 0 ? Math.min(passed / required, 1) : 0;
  const size = 120;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="relative grid size-[120px] shrink-0 place-items-center">
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-secondary"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className="stroke-primary transition-[stroke-dashoffset] duration-700"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <p
          className="text-[1.7rem] font-semibold leading-none tracking-[-0.025em] tabular-nums"
          dir="ltr"
          style={{ unicodeBidi: "isolate" }}
        >
          {remaining}
        </p>
        <p className="mt-1 max-w-[80%] text-[10px] leading-snug text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export function StudentHero({ profile }: { profile: StudentProfile | null }) {
  const { t } = useI18n();
  const photo = useStudentPhoto(profile);
  if (!profile) return null;

  const stats: { value: string; label: string }[] = [];
  if (profile.level) stats.push({ value: profile.level, label: t("hero.level") });
  if (profile.passedHours !== null && profile.passedHours !== undefined)
    stats.push({ value: String(profile.passedHours), label: t("hero.passedHours") });
  if (profile.cgpa) stats.push({ value: profile.cgpa, label: t("hero.cgpa") });
  if (profile.sgpa) stats.push({ value: profile.sgpa, label: t("hero.sgpa") });

  const facts: { label: string; value: string }[] = [
    ...(profile.faculty ? [{ label: t("hero.faculty"), value: profile.faculty }] : []),
    ...(profile.program ? [{ label: t("hero.program"), value: profile.program }] : []),
    ...(profile.guide ? [{ label: t("hero.guide"), value: profile.guide }] : []),
    ...(profile.registeredCourses
      ? [{ label: t("hero.registered"), value: profile.registeredCourses }]
      : []),
  ];

  return (
    <section className="card-elevated w-full max-w-full overflow-hidden p-5 sm:p-6">
      <div className="flex min-w-0 items-center gap-4 sm:gap-5">
        <span className="grid size-[72px] shrink-0 place-items-center overflow-hidden rounded-full border border-primary/40 bg-secondary sm:size-24">
          {photo ? (
            <img
              src={photo}

              alt={profile.name ?? t("hero.studentAlt")}
              className="size-full object-cover"
              loading="lazy"
            />
          ) : (
            <span className="text-base font-bold text-primary sm:text-lg">
              {initials(profile.name)}
            </span>
          )}
        </span>
        <div className="min-w-0">
          <h2 className="text-title-3 break-words">{profile.name ?? t("hero.fallbackName")}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span dir="ltr" className="font-semibold">
              {profile.dulmsId}
            </span>
            {profile.status && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 font-bold text-primary">
                <span className="size-1.5 rounded-full bg-primary" />
                {profile.status}
              </span>
            )}
          </p>
        </div>
      </div>

      {stats.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl border border-primary/25 bg-primary/10 p-2">
          {stats.map((stat) => (
            <Stat key={stat.label} value={stat.value} label={stat.label} />
          ))}
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-[1fr_auto] sm:items-end">
        <dl className="grid min-w-0 gap-3 text-sm leading-relaxed sm:grid-cols-2">
          {facts.map((fact) => (
            <div key={fact.label} className="flex min-w-0 gap-2">
              <dt className="shrink-0 text-muted-foreground">{fact.label}:</dt>
              <dd className="min-w-0 break-words font-semibold">{fact.value}</dd>
            </div>
          ))}
          {facts.length === 0 && (
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <UserRound className="size-3.5" /> {t("hero.noAcademic")}
            </p>
          )}
        </dl>
        {profile.requiredHours &&
        profile.passedHours !== null &&
        profile.passedHours !== undefined ? (
          <div className="flex justify-center sm:justify-end">
            <HoursRing
              passed={profile.passedHours}
              required={profile.requiredHours}
              label={t("hero.hoursToGrad")}
            />
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <GraduationCap className="size-4" /> {t("hero.hoursMissing")}
          </p>
        )}
      </div>
    </section>
  );
}
