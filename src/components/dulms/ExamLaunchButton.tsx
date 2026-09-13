/**
 * Beta launcher for an online DULMS exam.
 *
 * DULMS refuses to create an attempt outside the exam appointment, so the
 * button does two things: it tries immediately, and — when we are still early —
 * it can keep retrying in the background and hand over the launch link the very
 * second the window opens (a few seconds earlier than a manual page refresh).
 */
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Loader2, PlayCircle, TimerReset } from "lucide-react";
import { toast } from "sonner";

import { openExam } from "@/lib/dulms.functions";
import { useI18n } from "@/lib/i18n";

/** Retry cadence while waiting for the appointment to open. */
const RETRY_MS = 4_000;
/** Start auto-retrying this long before the announced start time. */
const LEAD_MS = 30_000;

/**
 * DULMS prints times as `Aug 8, 2026 at 10:45 PM` in Cairo time, which
 * `Date.parse` refuses. ISO strings (exam rows) pass straight through.
 */
function parseDulmsTime(value: string | null): number {
  if (!value) return NaN;
  const direct = new Date(value).getTime();
  if (Number.isFinite(direct)) return direct;
  const match = /^(.+?)\s+at\s+(.+)$/i.exec(value.trim());
  if (!match) return NaN;
  return new Date(`${match[1]} ${match[2]} GMT+0300`).getTime();
}

export function ExamLaunchButton({ quizId, startAt }: { quizId: number; startAt: string | null }) {
  const { t } = useI18n();
  const launch = useServerFn(openExam);
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const attemptRef = useRef<(silent: boolean) => Promise<boolean>>(async () => false);

  attemptRef.current = async (silent: boolean) => {
    if (busy) return false;
    setBusy(true);
    try {
      const result = await launch({ data: { quizId } });
      setFallback(result.fallbackUrl);
      if (result.ok && result.url) {
        setUrl(result.url);
        setAuto(false);
        window.open(result.url, "_blank", "noopener,noreferrer");
        toast.success(t("exam.opened"));
        return true;
      }
      if (!silent) toast.info(result.message ?? t("exam.notYet"));
      return false;
    } catch (cause) {
      if (!silent) toast.error(cause instanceof Error ? cause.message : t("exam.failed"));
      return false;
    } finally {
      setBusy(false);
    }
  };

  // Background retry loop: only runs while the tab stays open, and only from
  // shortly before the announced start time.
  useEffect(() => {
    if (!auto) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (stopped) return;
      const startTs = parseDulmsTime(startAt);
      const startsIn = Number.isFinite(startTs) ? startTs - Date.now() : 0;
      if (startsIn <= LEAD_MS) {
        const opened = await attemptRef.current(true);
        if (opened || stopped) return;
      }
      timer = setTimeout(tick, Math.max(RETRY_MS, Math.min(startsIn - LEAD_MS, 60_000)));
    };
    void tick();

    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [auto, startAt]);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="press inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground active:scale-[0.97]"
        >
          <PlayCircle className="size-3.5" />
          {t("exam.start")}
        </a>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void attemptRef.current(false)}
          className="press inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60 active:scale-[0.97]"
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <PlayCircle className="size-3.5" />
          )}
          {t("exam.open")}
        </button>
      )}

      <button
        type="button"
        onClick={() => setAuto((value) => !value)}
        className={`press inline-flex items-center gap-1.5 rounded-full border-[0.5px] border-border px-3 py-1.5 text-xs font-semibold active:scale-[0.97] ${
          auto ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary/50"
        }`}
      >
        <TimerReset className="size-3.5" />
        {auto ? t("exam.autoOn") : t("exam.autoOff")}
      </button>

      <a
        href={fallback ?? `https://dulms.deltauniv.edu.eg/Quizzes/QuizAttempts?id=${quizId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="press inline-flex items-center gap-1.5 rounded-full border-[0.5px] border-border px-3 py-1.5 text-xs font-semibold text-primary active:scale-[0.97] hover:bg-secondary/50"
      >
        <ExternalLink className="size-3.5" />
        DULMS
      </a>
    </div>
  );
}
