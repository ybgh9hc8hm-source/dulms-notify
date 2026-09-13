import { registrationSelections, type RegistrationOption } from "../dulms/registration";
import { escapeHtml } from "../telegram.server";

type Watch = {
  id: string;
  course_id: string;
  course_code: string | null;
  course_name: string;
  group_id: string;
  group_name: string;
  subgroup_id: string;
  subgroup_name: string | null;
  was_open: boolean;
  notified_at: string | null;
  auto_register: boolean;
  status: string;
  last_result: string | null;
  last_checked_at: string | null;
};

const AUTO_RETRY_COOLDOWN_MS = 30_000;

function retryIsDue(watch: Watch, now: Date): boolean {
  if (!watch.last_result?.startsWith("Auto registration CAPTCHA retry pending:")) return false;
  const lastCheck = watch.last_checked_at ? Date.parse(watch.last_checked_at) : 0;
  return !Number.isFinite(lastCheck) || now.getTime() - lastCheck >= AUTO_RETRY_COOLDOWN_MS;
}

export function matchingRegistrationOption(
  watch: Pick<Watch, "course_id" | "group_id" | "subgroup_id">,
  options: readonly RegistrationOption[],
): RegistrationOption | null {
  return (
    registrationSelections(options).find(
      (option) =>
        option.courseId === watch.course_id &&
        option.groupId === watch.group_id &&
        option.subgroupId === watch.subgroup_id,
    ) ?? null
  );
}

export async function processRegistrationWatches(
  userId: string,
  options: readonly RegistrationOption[],
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("registration_watches")
    .select(
      "id, course_id, course_code, course_name, group_id, group_name, subgroup_id, subgroup_name, was_open, notified_at, auto_register, status, last_result, last_checked_at",
    )
    .eq("user_id", userId)
    .in("status", ["watching", "ready"]);
  const watches = (data ?? []) as Watch[];
  if (watches.length === 0) return;

  const nowDate = new Date();
  const now = nowDate.toISOString();
  for (const watch of watches) {
    const option = matchingRegistrationOption(watch, options);
    // `option` is an atomic lecture+section selection when the course requires
    // both. It only opens when every required half is open and has capacity.
    const isOpen = Boolean(option && !option.blocked && option.free > 0);
    const justOpened = isOpen && !watch.was_open;
    const result = option
      ? isOpen
        ? `${option.free} seat${option.free === 1 ? "" : "s"} available`
        : option.blocked
          ? "Lecture or section is closed"
          : "Lecture or section has no seats"
      : "The selected lecture and section are not currently available together";

    const update = {
      was_open: isOpen,
      status: isOpen ? "ready" : "watching",
      last_checked_at: now,
      last_result: result,
      ...(justOpened ? { opened_at: now } : {}),
    };
    await supabaseAdmin
      .from("registration_watches")
      .update(update)
      .eq("id", watch.id)
      .neq("status", "submitting");

    const shouldRunAuto =
      isOpen &&
      watch.auto_register &&
      Boolean(option) &&
      (justOpened || retryIsDue(watch, nowDate));
    let autoLines: string[] = ["Open DULMS Notify to confirm registration."];
    if (shouldRunAuto && option) {
      const { data: claim } = await supabaseAdmin
        .from("registration_watches")
        .update({ status: "submitting", last_checked_at: now })
        .eq("id", watch.id)
        .eq("status", "ready")
        .select("id")
        .maybeSingle();
      if (claim) {
        const { autoRegisterCourse } = await import("../dulms/auto-register.server");
        const outcome = await autoRegisterCourse(userId, option);
        autoLines = outcome.success
          ? ["Registered automatically.", escapeHtml(outcome.message)]
          : [
              "Automatic registration failed.",
              escapeHtml(outcome.message),
              "Open DULMS Notify to confirm registration manually.",
            ];
        if (outcome.success) {
          // Registration is done, so the group is removed from the monitoring list.
          await supabaseAdmin.from("registration_watches").delete().eq("id", watch.id);
        } else {
          await supabaseAdmin
            .from("registration_watches")
            .update({
              status: "ready",
              last_result: outcome.captchaFailed
                ? `Auto registration CAPTCHA retry pending: ${outcome.message}`
                : `Auto registration failed: ${outcome.message}`,
              last_checked_at: new Date().toISOString(),
            })
            .eq("id", watch.id)
            .eq("status", "submitting");
        }
      }
    }

    if (!justOpened || watch.notified_at) continue;
    const selection = watch.subgroup_name
      ? `Lecture ${watch.group_name} • Section ${watch.subgroup_name}`
      : `Lecture ${watch.group_name}`;

    const body = [
      `<b>${escapeHtml([watch.course_code, watch.course_name].filter(Boolean).join(" — "))}</b>`,
      "Your selected group is open.",
      escapeHtml(selection),
      escapeHtml(result),
      ...autoLines,
    ].join("\n");
    const { enqueuePushes, flushNow } = await import("../notify/outbox.server");
    const ids = await enqueuePushes([
      { userId, body, dedupeKey: `registration-watch:${watch.id}:${now}` },
    ]);
    await flushNow(ids);
    await supabaseAdmin
      .from("registration_watches")
      .update({ notified_at: now })
      .eq("id", watch.id)
      .is("notified_at", null);
  }
}
