import { ExamLaunchButton } from "./ExamLaunchButton";
import { kindIcon } from "./kind-meta";
import type { ItemRow } from "./item-types";
import { Badge } from "@/components/ui/badge";
import { formatDateLocalized, useI18n } from "@/lib/i18n";
import { localizeDulms } from "@/lib/dulms-localize";
import { to12h } from "@/lib/time-format";
import { useState } from "react";
import { Archive, BellPlus, ChevronDown, ExternalLink, Loader2, Undo2 } from "lucide-react";

import { AICoreIcon } from "@/components/ai-elements/AICoreIcon";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import {
  cancelRegisteredCourse,
  createRegistrationWatch,
} from "@/lib/registration-watch.functions";

function extraEntries(extra: unknown) {
  if (!extra || typeof extra !== "object") return [];
  return Object.entries(extra as Record<string, unknown>).filter(
    ([k, v]) => !k.startsWith("_") && typeof v === "string" && v.trim().length > 0,
  ) as [string, string][];
}

export function ItemCard({
  item,
  onChanged,
}: {
  item: ItemRow;
  onChanged?: (() => void) | undefined;
}) {
  const { t, lang } = useI18n();
  const Icon = kindIcon(item.kind);
  const chips = extraEntries(item.extra);
  const statusParts = (item.status ?? "")
    .split("•")
    .map((part) => localizeDulms(part.trim(), lang))
    .filter(Boolean);

  const rawExtra = (item.extra ?? {}) as Record<string, unknown>;
  const pageUrl = typeof rawExtra["الصفحة"] === "string" ? (rawExtra["الصفحة"] as string) : null;
  const examQuizId =
    (item.kind === "exam" || item.kind === "quiz") && typeof rawExtra["_quizId"] === "string"
      ? Number(rawExtra["_quizId"])
      : null;

  if (item.kind === "courseOffer") {
    return <CourseOfferCard item={item} onChanged={onChanged} />;
  }

  return (
    <article className="card-elevated w-full max-w-full overflow-hidden p-4">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-[0.7rem] bg-primary/15">
          <Icon className="size-4 text-primary" />
        </span>
        <div className="min-w-0">
          <h3 className="text-headline break-words">{localizeDulms(to12h(item.title), lang)}</h3>
          {item.course && <p className="text-footnote mt-0.5 break-words">{item.course}</p>}

          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
            <Badge variant="secondary" className="shrink-0">
              {t(`kind.${item.kind}`)}
            </Badge>
            {item.archived_at && (
              <span
                title={t("item.archivedHint")}
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-semibold text-muted-foreground"
              >
                <Archive className="size-3" />
                {t("item.archived")}
              </span>
            )}
            {item.score && (
              <span className="rounded-full bg-primary/18 px-2 py-0.5 font-semibold text-primary">
                {item.score}
              </span>
            )}
            {item.due_at && (
              <span className="rounded-full bg-secondary/60 px-2 py-0.5 text-muted-foreground">
                {t("item.due")}: {formatDateLocalized(item.due_at, lang)}
              </span>
            )}
            {statusParts.map((part) => (
              <span
                key={part}
                className="max-w-full truncate rounded-full bg-secondary/60 px-2 py-0.5 text-muted-foreground"
              >
                {part}
              </span>
            ))}
          </div>

          {chips.length > 0 && (
            <dl className="mt-2 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
              {chips.map(([key, value]) => (
                <div key={key} className="flex min-w-0 gap-1">
                  <dt className="shrink-0 opacity-70">{localizeDulms(key, lang)}:</dt>
                  <dd className="min-w-0 break-words font-medium">{localizeDulms(value, lang)}</dd>
                </div>
              ))}
            </dl>
          )}

          {examQuizId ? (
            <ExamLaunchButton
              quizId={examQuizId}
              startAt={
                item.kind === "exam"
                  ? (item.due_at ?? null)
                  : typeof rawExtra["يبدأ"] === "string"
                    ? (rawExtra["يبدأ"] as string)
                    : null
              }
            />
          ) : null}

          {pageUrl && (
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={
                  pageUrl.startsWith("http")
                    ? pageUrl
                    : `https://dulms.deltauniv.edu.eg${pageUrl.startsWith("/") ? "" : "/"}${pageUrl}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="press inline-flex items-center gap-1.5 rounded-full border-[0.5px] border-border px-3 py-1.5 text-xs font-semibold text-primary active:scale-[0.97] hover:bg-secondary/50"
              >
                <ExternalLink className="size-3.5" />
                DULMS
              </a>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function CourseOfferCard({
  item,
  onChanged,
}: {
  item: ItemRow;
  onChanged?: (() => void) | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const createWatch = useServerFn(createRegistrationWatch);
  const cancelCourse = useServerFn(cancelRegisteredCourse);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const extra = (item.extra ?? {}) as Record<string, unknown>;
  const text = (key: string) => (typeof extra[key] === "string" ? extra[key].trim() : "");
  const structure = text("Structure");
  const seats = text("Seats");
  const details = [
    ["Open lectures", text("Open lectures")],
    ["Open sections", text("Open sections")],
    ["Prerequisite", text("Prerequisite")],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  const isOpen = /open for registration/i.test(item.status ?? "");
  const isRegistered = /already registered/i.test(item.status ?? "");
  const courseId = text("_courseId");
  const options = (() => {
    const raw = text("_registrationOptions");
    if (!raw) return [];
    try {
      return JSON.parse(raw) as Array<{
        courseId: string;
        courseCode: string | null;
        courseName: string;
        groupId: string;
        groupName: string;
        subgroupId: string;
        subgroupName: string | null;
        blocked: boolean;
        free: number;
        label: string;
      }>;
    } catch {
      return [];
    }
  })();
  const lectureGroups = [
    ...new Map(options.map((option) => [option.groupId, option.groupName])).entries(),
  ];
  const requiresSection = options.some((option) => Boolean(option.subgroupId));
  const visibleOptions = selectedGroupId
    ? options.filter((option) => option.groupId === selectedGroupId)
    : requiresSection
      ? []
      : options;

  return (
    <article className="w-full overflow-hidden border-b border-border/60 py-3 last:border-b-0">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={`mt-1 size-2 shrink-0 rounded-full ${isOpen ? "bg-success" : "bg-muted-foreground/50"}`}
          aria-label={isOpen ? "Open" : "Closed"}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h3 className="text-sm font-semibold text-foreground">{item.course || item.title}</h3>
            {item.score && <span className="text-xs text-muted-foreground">{item.score}</span>}
          </div>
          <p
            className={`mt-0.5 text-xs font-medium ${isOpen ? "text-success" : "text-muted-foreground"}`}
          >
            {item.status}
          </p>
          {(structure || seats) && (
            <p className="mt-1 text-xs text-muted-foreground">
              {[structure, seats].filter(Boolean).join(" • ")}
            </p>
          )}
        </div>
        {(details.length > 0 || options.length > 0) && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={open ? "Hide details" : "Show details"}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="shrink-0 text-muted-foreground"
          >
            <ChevronDown className={`transition-transform ${open ? "rotate-180" : ""}`} />
          </Button>
        )}
      </div>
      {isRegistered && courseId && (
        <div className="ms-5 mt-2 flex flex-wrap items-center gap-2">
          {confirmingCancel ? (
            <>
              <span className="text-[11px] text-muted-foreground">
                Drop this course from DULMS?
              </span>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={saving === "cancel"}
                onClick={async () => {
                  setSaving("cancel");
                  setResult(null);
                  try {
                    const outcome = await cancelCourse({ data: { courseId } });
                    setResult(outcome.message);
                    if (outcome.success) setConfirmingCancel(false);
                    onChanged?.();
                  } catch (cause) {
                    setResult(
                      cause instanceof Error ? cause.message : "Could not cancel this course.",
                    );
                  } finally {
                    setSaving(null);
                  }
                }}
              >
                {saving === "cancel" ? <Loader2 className="animate-spin" /> : <Undo2 />}
                Yes, cancel it
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={saving === "cancel"}
                onClick={() => setConfirmingCancel(false)}
              >
                Keep it
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setResult(null);
                setConfirmingCancel(true);
              }}
            >
              <Undo2 />
              Cancel registration
            </Button>
          )}
        </div>
      )}
      {isRegistered && result && (
        <p className="ms-5 mt-2 text-[11px] text-muted-foreground">{result}</p>
      )}
      {open && details.length > 0 && (
        <dl className="ms-5 mt-3 space-y-2 border-s border-border/60 ps-3 text-xs">
          {details.map(([label, value]) => (
            <div key={label}>
              <dt className="font-semibold text-foreground">{label}</dt>
              <dd className="mt-0.5 whitespace-pre-line text-muted-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {open && options.length > 0 && (
        <div className="ms-5 mt-3 space-y-2 border-s border-border/60 ps-3">
          <p className="text-xs font-semibold">1. Choose the lecture group</p>
          <div className="flex flex-wrap gap-2">
            {lectureGroups.map(([groupId, groupName]) => (
              <Button
                key={groupId}
                type="button"
                size="sm"
                variant={selectedGroupId === groupId ? "default" : "outline"}
                onClick={() => {
                  setSelectedGroupId(groupId);
                  setResult(null);
                }}
              >
                Lecture {groupName}
              </Button>
            ))}
          </div>
          {requiresSection && !selectedGroupId && (
            <p className="text-[11px] text-muted-foreground">
              Select a lecture first to see only its compatible sections.
            </p>
          )}
          {visibleOptions.length > 0 && (
            <p className="pt-1 text-xs font-semibold">
              {requiresSection ? "2. Choose the required section" : "2. Choose monitoring mode"}
            </p>
          )}
          {visibleOptions.map((option) => {
            const key = `${option.groupId}:${option.subgroupId}`;
            const start = async (autoRegister: boolean) => {
              setSaving(autoRegister ? `${key}:auto` : `${key}:notify`);
              setResult(null);
              try {
                await createWatch({ data: { ...option, autoRegister } });
                setResult(
                  autoRegister
                    ? `Automatic registration armed for ${option.label}`
                    : `Alerts only for ${option.label}`,
                );
                onChanged?.();
              } catch (cause) {
                setResult(cause instanceof Error ? cause.message : "Could not monitor this group.");
              } finally {
                setSaving(null);
              }
            };
            const busy = saving?.startsWith(`${key}:`) ?? false;
            return (
              <div key={key} className="min-w-0 py-1.5">
                <p className="break-words text-xs font-medium">
                  {requiresSection
                    ? `Section ${option.subgroupName ?? option.subgroupId}`
                    : option.label}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {option.blocked
                    ? "Lecture or section closed"
                    : option.free > 0
                      ? `Both ready • ${option.free} seats`
                      : "Lecture or section full"}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  <Button type="button" size="sm" disabled={busy} onClick={() => void start(true)}>
                    {saving === `${key}:auto` ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <AICoreIcon size={24} ariaLabel="Automatic registration" className="-my-1" />
                    )}
                    Register automatically
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void start(false)}
                  >
                    {saving === `${key}:notify` ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <BellPlus />
                    )}
                    Notify me only
                  </Button>
                </div>
              </div>
            );
          })}
          {result && <p className="text-[11px] text-muted-foreground">{result}</p>}
        </div>
      )}
    </article>
  );
}
