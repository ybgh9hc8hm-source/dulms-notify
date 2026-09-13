import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Eye, Loader2, ShieldAlert, Trash2 } from "lucide-react";

import { AICoreIcon } from "@/components/ai-elements/AICoreIcon";

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
import { Switch } from "@/components/ui/switch";
import {
  confirmCourseRegistration,
  deleteRegistrationWatch,
  getRegistrationCaptcha,
  setRegistrationWatchAuto,
} from "@/lib/registration-watch.functions";

export interface RegistrationWatchRow {
  id: string;
  course_code: string | null;
  course_name: string;
  group_name: string;
  subgroup_name: string | null;
  status: string;
  last_result: string | null;
  auto_register?: boolean;
}

function watchState(status: string) {
  if (status === "completed") {
    return {
      label: "Registered",
      detail: "Registration completed",
      icon: CheckCircle2,
      tone: "text-success",
      dot: "bg-success",
    };
  }
  if (status === "ready") {
    return {
      label: "Group open",
      detail: "Ready to register",
      icon: ShieldAlert,
      tone: "text-warning",
      dot: "bg-warning",
    };
  }
  return {
    label: "Watching",
    detail: "Waiting for an available seat",
    icon: Eye,
    tone: "text-primary",
    dot: "bg-primary",
  };
}

export function RegistrationWatchPanel({
  watches,
  onChanged,
}: {
  watches: RegistrationWatchRow[];
  onChanged: () => void;
}) {
  const remove = useServerFn(deleteRegistrationWatch);
  const loadCaptcha = useServerFn(getRegistrationCaptcha);
  const confirm = useServerFn(confirmCourseRegistration);
  const setAuto = useServerFn(setRegistrationWatchAuto);
  const [busy, setBusy] = useState<{ id: string; action: "auto" | "delete" | "captcha" } | null>(
    null,
  );
  const [dialog, setDialog] = useState<{ watch: RegistrationWatchRow; image: string } | null>(null);
  const [captcha, setCaptcha] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  if (watches.length === 0) return null;

  async function openConfirmation(watch: RegistrationWatchRow) {
    setBusy({ id: watch.id, action: "captcha" });
    setMessage(null);
    try {
      const result = await loadCaptcha({ data: { watchId: watch.id } });
      setCaptcha("");
      setDialog({ watch, image: result.image });
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Could not load the CAPTCHA.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-5" aria-labelledby="monitored-groups-heading">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15">
            <Eye className="size-4 text-primary" />
          </span>
          <div className="min-w-0">
            <h2 id="monitored-groups-heading" className="text-sm font-bold">
              Monitored groups
            </h2>
            <p className="text-[11px] text-muted-foreground">{watches.length} active</p>
          </div>
        </div>
      </div>
      {message && (
        <p
          role="alert"
          className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {message}
        </p>
      )}
      <div className="grid gap-2.5 sm:grid-cols-2">
        {watches.map((watch) => {
          const state = watchState(watch.status);
          const StateIcon = state.icon;
          const isBusy = busy?.id === watch.id;
          return (
            <article
              key={watch.id}
              className="overflow-hidden rounded-xl border border-border/60 bg-card/70"
            >
              <div className="flex items-start gap-3 p-3.5">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${state.dot}`} />
                <div className="min-w-0 flex-1">
                  <h3 className="break-words text-sm font-bold leading-snug">
                    {[watch.course_code, watch.course_name].filter(Boolean).join(" — ")}
                  </h3>
                  <p className="mt-1 text-xs font-medium text-foreground/80">
                    Lecture {watch.group_name}
                    {watch.subgroup_name ? ` • Section ${watch.subgroup_name}` : ""}
                  </p>
                  <div
                    className={`mt-2 flex items-center gap-1.5 text-[11px] font-semibold ${state.tone}`}
                  >
                    <StateIcon className="size-3.5" />
                    <span>{state.label}</span>
                    <span className="font-normal text-muted-foreground">• {state.detail}</span>
                  </div>
                  {watch.last_result && (
                    <p className="mt-2 break-words text-[11px] leading-relaxed text-muted-foreground">
                      {watch.last_result}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex min-h-12 items-center gap-2 border-t border-border/50 bg-secondary/20 px-3 py-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="relative grid shrink-0 place-items-center">
                    <AICoreIcon size={36} ariaLabel="Automatic registration" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">Automatic registration</p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {watch.auto_register === false
                        ? "Manual confirmation only"
                        : "Enabled when a seat opens"}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={watch.auto_register !== false}
                  disabled={isBusy || watch.status === "completed"}
                  onCheckedChange={async (checked) => {
                    setBusy({ id: watch.id, action: "auto" });
                    setMessage(null);
                    try {
                      await setAuto({ data: { id: watch.id, autoRegister: checked } });
                      onChanged();
                    } catch (cause) {
                      setMessage(
                        cause instanceof Error
                          ? cause.message
                          : "Could not update automatic registration.",
                      );
                    } finally {
                      setBusy(null);
                    }
                  }}
                  aria-label={`Automatic registration for ${watch.course_code ?? watch.course_name}`}
                />
                {watch.status === "ready" && (
                  <Button size="sm" onClick={() => void openConfirmation(watch)} disabled={isBusy}>
                    {busy?.id === watch.id && busy.action === "captcha" ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      "Register"
                    )}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={isBusy}
                  aria-label={`Stop monitoring ${watch.course_code ?? watch.course_name}`}
                  onClick={async () => {
                    setBusy({ id: watch.id, action: "delete" });
                    setMessage(null);
                    try {
                      await remove({ data: { id: watch.id } });
                      onChanged();
                    } catch (cause) {
                      setMessage(
                        cause instanceof Error
                          ? cause.message
                          : "Could not stop monitoring this group.",
                      );
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {busy?.id === watch.id && busy.action === "delete" ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Trash2 />
                  )}
                </Button>
              </div>
            </article>
          );
        })}
      </div>

      <Dialog open={Boolean(dialog)} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm DULMS registration</DialogTitle>
            <DialogDescription>
              This submits the exact selected group. DULMS will still enforce payment, hours,
              prerequisites, capacity, and the registration window.
            </DialogDescription>
          </DialogHeader>
          {dialog && (
            <img src={dialog.image} alt="DULMS CAPTCHA" className="h-20 w-full object-contain" />
          )}
          <Input
            value={captcha}
            onChange={(event) => setCaptcha(event.target.value)}
            placeholder="Enter CAPTCHA"
            autoComplete="off"
          />
          {message && <p className="text-xs text-destructive">{message}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              disabled={!captcha.trim() || busy?.id === dialog?.watch.id}
              onClick={async () => {
                if (!dialog) return;
                setBusy({ id: dialog.watch.id, action: "captcha" });
                setMessage(null);
                try {
                  const result = await confirm({ data: { watchId: dialog.watch.id, captcha } });
                  setMessage(result.message);
                  if (result.success) {
                    setDialog(null);
                    onChanged();
                  } else if (result.captchaRejected) {
                    setCaptcha("");
                    if (result.nextCaptchaImage) {
                      setDialog({ watch: dialog.watch, image: result.nextCaptchaImage });
                    } else {
                      await openConfirmation(dialog.watch);
                    }
                  }
                } catch (cause) {
                  setMessage(cause instanceof Error ? cause.message : "Registration failed.");
                } finally {
                  setBusy(null);
                }
              }}
            >
              Confirm registration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
