import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const syncNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { syncUser } = await import("@/server/sync.server");
    return syncUser(context.userId);
  });

export const getOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [account, items, notifications, profile, photo, registrationWatches] = await Promise.all([
      supabase
        .from("dulms_accounts")
        .select("dulms_id, sync_enabled, last_sync_at, last_sync_status, last_sync_error, profile")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("dulms_items")
        .select("id, kind, course, title, due_at, status, score, extra, first_seen_at, archived_at")
        .eq("user_id", userId)
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(3000),
      supabase
        .from("notifications")
        .select("id, kind, title, body, read_at, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
      // Existence probe only — never the bytes. `head: true` sends no body.
      supabase
        .from("student_photos")
        .select("user_id", { count: "exact", head: true })
        .eq("user_id", userId),
      supabase
        .from("registration_watches")
        .select(
          "id, course_id, course_code, course_name, group_id, group_name, subgroup_id, subgroup_name, status, was_open, opened_at, last_checked_at, last_result, auto_register",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: true }),
    ]);

    // The student photo is an inlined base64 data URL that can reach several
    // megabytes. It lives in its own table so neither this read nor the sync
    // write path ever touches the blob; `getStudentPhoto` serves it once.
    const raw = account.data;
    const accountData = raw
      ? {
          ...raw,
          profile:
            raw.profile && typeof raw.profile === "object" && !Array.isArray(raw.profile)
              ? (() => {
                  // Defensive: never ship an inlined photo blob here even if an
                  // older row still carries one. `getStudentPhoto` serves it.
                  const { photo: _legacyPhoto, ...rest } = raw.profile as Record<string, unknown>;
                  return { ...rest, hasPhoto: (photo.count ?? 0) > 0 };
                })()
              : raw.profile,
        }
      : null;

    return {
      account: accountData,
      items: items.data ?? [],
      notifications: notifications.data ?? [],
      registrationWatches: registrationWatches.data ?? [],
      profile: profile.data ?? null,
    };
  });

/** Student photo on its own: fetched once per dashboard mount, cached by React Query. */
export const getStudentPhoto = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("student_photos")
      .select("data_url")
      .eq("user_id", context.userId)
      .maybeSingle();
    return { photo: data?.data_url ?? null };
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("read_at", null);
    return { ok: true };
  });

/**
 * Beta: creates an online-exam attempt on DULMS for the signed-in student and
 * returns the direct launch URL. DULMS enforces the appointment window itself,
 * so outside it we return its message plus the attempts page as a fallback.
 */
export const openExam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { quizId: number }) => ({ quizId: Number(input.quizId) }))
  .handler(async ({ data, context }) => {
    if (!Number.isInteger(data.quizId) || data.quizId <= 0) throw new Error("رقم امتحان غير صالح");

    const { hasExamBeta } = await import("@/lib/exam-beta");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: account } = await supabaseAdmin
      .from("dulms_accounts")
      .select("dulms_id, password_ciphertext, key_version")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!account || !hasExamBeta(account.dulms_id)) throw new Error("الميزة غير متاحة لحسابك");

    const { ensureKeyring } = await import("@/server/crypto.server");
    const { readAccountPassword } = await import("@/server/credentials.server");
    const { openExamAttempt } = await import("@/server/dulms/exam-open.server");
    await ensureKeyring();
    return openExamAttempt(
      account.dulms_id,
      readAccountPassword(account.password_ciphertext, account.key_version),
      data.quizId,
    );
  });
