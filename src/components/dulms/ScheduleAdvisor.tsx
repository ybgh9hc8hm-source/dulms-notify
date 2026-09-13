import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CalendarRange, Clock, Loader2 } from "lucide-react";

import { AICoreIcon } from "@/components/ai-elements/AICoreIcon";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  applyRecommendedSchedule,
  recommendRegistrationSchedule,
} from "@/lib/registration-watch.functions";

type Pick = {
  courseId: string;
  courseCode: string | null;
  courseName: string;
  groupId: string;
  groupName: string;
  subgroupId: string;
  subgroupName: string | null;
  label: string;
  open: boolean;
  free: number;
  slots: { day: number; start: number; end: number; label: string }[];
};

type Recommendation = {
  picks: Pick[];
  metrics: {
    days: number;
    idleDays: number;
    gapMinutes: number;
    campusMinutes: number;
    conflicts: number;
    dayNames: string[];
  };
  skipped: { courseId: string; courseName: string; reason: string }[];
};

const DAYS = ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

function clock(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = `${minutes % 60}`.padStart(2, "0");
  const suffix = hour < 12 ? "AM" : "PM";
  return `${hour % 12 === 0 ? 12 : hour % 12}:${minute} ${suffix}`;
}

function duration(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** Suggests the most compact timetable the current offer allows. */
export function ScheduleAdvisor({ onChanged }: { onChanged: () => void }) {
  const recommend = useServerFn(recommendRegistrationSchedule);
  const apply = useServerFn(applyRecommendedSchedule);
  const [result, setResult] = useState<Recommendation | null>(null);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [autoRegister, setAutoRegister] = useState(true);
  const [loading, setLoading] = useState<"build" | "apply" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function build() {
    setLoading("build");
    setMessage(null);
    try {
      const data = await recommend({ data: { onlyOpen, courseIds: [] } });
      setResult(data as unknown as Recommendation);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Could not build a schedule.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <section className="mt-5" aria-labelledby="schedule-advisor-heading">
      <div className="rounded-xl border border-border/60 bg-card/70 p-3.5">
        <div className="flex items-start gap-3">
          <span className="relative grid shrink-0 place-items-center">
            <AICoreIcon size={44} ariaLabel="Best schedule advisor" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="schedule-advisor-heading" className="text-sm font-bold">
              Best schedule advisor
            </h2>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Picks one group per course so you attend the fewest days, back-to-back, with the
              smallest gaps and no clashes.
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-medium">
            <Switch
              checked={onlyOpen}
              onCheckedChange={setOnlyOpen}
              aria-label="Open groups only"
            />
            Open groups only
          </label>
          <Button size="sm" onClick={() => void build()} disabled={loading !== null}>
            {loading === "build" ? <Loader2 className="animate-spin" /> : <CalendarRange />}
            Suggest best schedule
          </Button>
        </div>

        {message && (
          <p role="alert" className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs">
            {message}
          </p>
        )}

        {result && (
          <div className="mt-4 space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Metric label="Days on campus" value={`${result.metrics.days}`} />
              <Metric
                label="Idle days in between"
                value={result.metrics.idleDays === 0 ? "None" : `${result.metrics.idleDays}`}
              />
              <Metric label="Waiting between classes" value={duration(result.metrics.gapMinutes)} />
              <Metric label="Total time on campus" value={duration(result.metrics.campusMinutes)} />
            </div>
            {result.metrics.dayNames.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {result.metrics.dayNames.join(" • ")}
                {result.metrics.conflicts > 0
                  ? ` • ${result.metrics.conflicts} clash(es) could not be avoided`
                  : " • no clashes"}
              </p>
            )}

            {result.picks.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No published timetables to build a schedule from yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {result.picks.map((pick) => (
                  <li
                    key={`${pick.courseId}-${pick.groupId}-${pick.subgroupId}`}
                    className="rounded-lg border border-border/50 bg-secondary/20 p-2.5"
                  >
                    <p className="break-words text-xs font-bold">
                      {[pick.courseCode, pick.courseName].filter(Boolean).join(" — ")}
                    </p>
                    <p className="mt-0.5 text-[11px] font-medium text-foreground/80">
                      {pick.label} • {pick.open ? `${pick.free} seats` : "closed for now"}
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {pick.slots.map((slot) => (
                        <li
                          key={`${slot.day}-${slot.start}`}
                          className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                        >
                          <Clock className="size-3" />
                          <span className="font-medium">
                            {DAYS[slot.day] ?? `Day ${slot.day}`} {clock(slot.start)} –{" "}
                            {clock(slot.end)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}

            {result.skipped.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Not included: {result.skipped.map((course) => course.courseName).join(", ")}
              </p>
            )}

            {result.picks.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 border-t border-border/50 pt-3">
                <label className="flex items-center gap-2 text-xs font-medium">
                  <Switch
                    checked={autoRegister}
                    onCheckedChange={setAutoRegister}
                    aria-label="Register automatically"
                  />
                  Register automatically
                </label>
                <Button
                  size="sm"
                  disabled={loading !== null}
                  onClick={async () => {
                    setLoading("apply");
                    setMessage(null);
                    try {
                      const outcome = await apply({
                        data: {
                          autoRegister,
                          picks: result.picks.map((pick) => ({
                            courseId: pick.courseId,
                            groupId: pick.groupId,
                            subgroupId: pick.subgroupId,
                          })),
                        },
                      });
                      const failed = outcome.results.filter((row) => !row.ok);
                      setMessage(
                        failed.length === 0
                          ? "Monitoring started for the whole suggested schedule."
                          : `${outcome.results.length - failed.length} added, ${failed.length} failed: ${failed[0]?.message ?? ""}`,
                      );
                      onChanged();
                    } catch (cause) {
                      setMessage(
                        cause instanceof Error ? cause.message : "Could not apply the schedule.",
                      );
                    } finally {
                      setLoading(null);
                    }
                  }}
                >
                  {loading === "apply" ? <Loader2 className="animate-spin" /> : null}
                  Monitor all suggested groups
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-secondary/20 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-bold">{value}</p>
    </div>
  );
}
