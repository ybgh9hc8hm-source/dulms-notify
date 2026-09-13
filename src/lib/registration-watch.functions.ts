import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const selectionSchema = z.object({
  courseId: z.string().min(1).max(100),
  courseCode: z.string().max(50).nullable(),
  courseName: z.string().min(1).max(300),
  groupId: z.string().min(1).max(100),
  groupName: z.string().min(1).max(200),
  subgroupId: z.string().max(100).default(""),
  subgroupName: z.string().max(200).nullable(),
  autoRegister: z.boolean().default(true),
});

export const createRegistrationWatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => selectionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: visibleAccount } = await context.supabase
      .from("dulms_accounts")
      .select("dulms_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!visibleAccount) throw new Error("DULMS account is not connected.");

    const { startRegistrationWatch } = await import("@/server/dulms/watch-create.server");
    const outcome = await startRegistrationWatch(context.userId, {
      courseId: data.courseId,
      groupId: data.groupId,
      subgroupId: data.subgroupId,
      autoRegister: data.autoRegister,
    });
    return { ok: true, registered: outcome.registered, message: outcome.message };
  });

/**
 * Suggests the most compact possible timetable: one group per course, no
 * overlaps, fewest days, back-to-back days, smallest gaps.
 */
export const recommendRegistrationSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        onlyOpen: z.boolean().default(false),
        courseIds: z.array(z.string().min(1).max(100)).max(60).default([]),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { readRegistrationOffer } = await import("@/server/dulms/watch-create.server");
    const { recommendSchedule, formatRecommendation } =
      await import("@/server/dulms/schedule-optimizer");
    const options = await readRegistrationOffer(context.userId);
    const result = recommendSchedule(options, {
      onlyOpen: data.onlyOpen,
      courseIds: data.courseIds.length ? data.courseIds : undefined,
    });
    return { ...result, summary: formatRecommendation(result) };
  });

/** Starts monitoring (and auto-registration) for every recommended group. */
export const applyRecommendedSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        autoRegister: z.boolean().default(true),
        picks: z
          .array(
            z.object({
              courseId: z.string().min(1).max(100),
              groupId: z.string().min(1).max(100),
              subgroupId: z.string().max(100).default(""),
            }),
          )
          .min(1)
          .max(20),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { startRegistrationWatch } = await import("@/server/dulms/watch-create.server");
    const results: { courseId: string; ok: boolean; message: string }[] = [];
    for (const pick of data.picks) {
      try {
        const outcome = await startRegistrationWatch(context.userId, {
          ...pick,
          autoRegister: data.autoRegister,
        });
        results.push({ courseId: pick.courseId, ok: true, message: outcome.message });
      } catch (cause) {
        results.push({
          courseId: pick.courseId,
          ok: false,
          message: cause instanceof Error ? cause.message : "تعذّر تفعيل المتابعة.",
        });
      }
    }
    return { results };
  });

/** Turns the AI CAPTCHA agent (fully automatic registration) on or off. */
export const setRegistrationWatchAuto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), autoRegister: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("registration_watches")
      .update({ auto_register: data.autoRegister })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error("Could not update automatic registration.");
    return { ok: true };
  });

export const deleteRegistrationWatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("registration_watches")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error("Could not stop monitoring this group.");
    return { ok: true };
  });

async function accountSession(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: account } = await supabaseAdmin
    .from("dulms_accounts")
    .select("dulms_id, password_ciphertext, key_version")
    .eq("user_id", userId)
    .maybeSingle();
  if (!account) throw new Error("DULMS account is not connected.");
  const { ensureKeyring } = await import("@/server/crypto.server");
  const { readAccountPassword } = await import("@/server/credentials.server");
  const { getDulmsSession } = await import("@/server/dulms/session");
  await ensureKeyring();
  return {
    account,
    session: await getDulmsSession(
      account.dulms_id,
      readAccountPassword(account.password_ciphertext, account.key_version),
    ),
  };
}

/** Drops a course the student already registered (portal cancel, no CAPTCHA). */
export const cancelRegisteredCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ courseId: z.string().min(1).max(100) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { session } = await accountSession(context.userId);
    const { cancelCourseRegistration } = await import("@/server/dulms/registration-submit.server");
    const result = await cancelCourseRegistration(session.jar, data.courseId);
    return { success: result.success, message: result.message };
  });

export const getRegistrationCaptcha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ watchId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: watch } = await context.supabase
      .from("registration_watches")
      .select("id, status")
      .eq("id", data.watchId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!watch || watch.status !== "ready") throw new Error("This selected group is not open now.");
    const { session } = await accountSession(context.userId);
    const { readRegistrationCaptcha } = await import("@/server/dulms/registration-submit.server");
    return { image: await readRegistrationCaptcha(session.jar) };
  });

export const confirmCourseRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ watchId: z.string().uuid(), captcha: z.string().trim().min(1).max(20) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: watch } = await context.supabase
      .from("registration_watches")
      .select("id, course_id, group_id, subgroup_id, status")
      .eq("id", data.watchId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!watch || watch.status !== "ready") throw new Error("This selected group is not open now.");

    const { data: claimedWatch, error: claimError } = await context.supabase
      .from("registration_watches")
      .update({ status: "submitting" })
      .eq("id", watch.id)
      .eq("user_id", context.userId)
      .eq("status", "ready")
      .select("id")
      .maybeSingle();
    if (claimError) throw new Error("Could not start registration.");
    if (!claimedWatch) throw new Error("Registration is already being attempted for this group.");

    try {
      const { account, session } = await accountSession(context.userId);
      const { readRegistrationSnapshot, registrationSelections } =
        await import("@/server/dulms/registration");
      const { readAccountPassword } = await import("@/server/credentials.server");
      const live = await readRegistrationSnapshot(
        account.dulms_id,
        readAccountPassword(account.password_ciphertext, account.key_version),
      );
      const option = registrationSelections(live.options).find(
        (candidate) =>
          candidate.courseId === watch.course_id &&
          candidate.groupId === watch.group_id &&
          candidate.subgroupId === watch.subgroup_id,
      );
      if (!option || option.blocked || option.free < 1) {
        await context.supabase
          .from("registration_watches")
          .update({
            status: "watching",
            was_open: false,
            last_result: "Group closed before confirmation",
          })
          .eq("id", watch.id);
        throw new Error("The selected lecture or section closed or filled before confirmation.");
      }

      const { readRegistrationCaptcha, submitCourseRegistration } =
        await import("@/server/dulms/registration-submit.server");
      const result = await submitCourseRegistration(session.jar, {
        courseId: option.courseId,
        groupId: option.groupId,
        subgroupId: option.subgroupId,
        captcha: data.captcha,
      });
      if (result.success) {
        // The seat is secured, so the group leaves the monitoring list entirely.
        await context.supabase
          .from("registration_watches")
          .delete()
          .eq("id", watch.id)
          .eq("user_id", context.userId);
      } else {
        await context.supabase
          .from("registration_watches")
          .update({
            status: "ready",
            last_result: result.message,
            last_checked_at: new Date().toISOString(),
          })
          .eq("id", watch.id);
      }
      if (!result.captchaRejected) return { ...result, nextCaptchaImage: null };

      let nextCaptchaImage: string | null = null;
      try {
        nextCaptchaImage = await readRegistrationCaptcha(session.jar);
      } catch {
        // The rejection remains visible; the student can explicitly reload the dialog.
      }
      return { ...result, nextCaptchaImage };
    } catch (cause) {
      await context.supabase
        .from("registration_watches")
        .update({ status: "ready" })
        .eq("id", watch.id)
        .eq("status", "submitting");
      throw cause;
    }
  });
