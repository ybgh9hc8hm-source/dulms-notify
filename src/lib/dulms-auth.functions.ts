import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  dulmsId: z.string().trim().min(3, "كود الطالب قصير جدًا").max(50),
  password: z.string().min(3, "كلمة المرور قصيرة جدًا").max(200),
  policyAccepted: z.literal(true, { errorMap: () => ({ message: "يجب الموافقة على سياسة الاستخدام والخصوصية" }) }),
  policyVersion: z.literal("2026-09-12"),
  humanCheck: z.literal(true, { errorMap: () => ({ message: "يرجى إكمال التحقق أولًا" }) }),
});

/**
 * Single sign-in: the student only ever types their DULMS id + password.
 * We verify them against DULMS, then mint (or reuse) a backend account keyed to
 * that id with a server-derived password, and hand it back so the browser can
 * open a normal session. No email signup involved.
 */
export const loginWithDulms = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data }) => {
    const { loginToDulms, DulmsAuthError } = await import("@/server/dulms.server");
    const {
      encryptSecret,
      derivedAccountPassword,
      accountEmailFor,
      activeKeyVersion,
      ensureKeyring,
    } = await import("@/server/crypto.server");
    await ensureKeyring();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { isLoginThrottled, recordLoginAttempt, LOGIN_THROTTLED_MESSAGE } =
      await import("@/server/login-throttle.server");

    const dulmsId = data.dulmsId.trim();

    // Each attempt costs a live request to the university portal — throttle
    // repeated failures per caller IP and per student id before spending one.
    if (await isLoginThrottled(dulmsId)) {
      return { ok: false as const, code: "throttled" as const, message: LOGIN_THROTTLED_MESSAGE };
    }

    // Operator access control, read once up front:
    //  - `allowedIds`     → students granted the same standing as the working
    //                       account (pass lockdown, closed signups, seat cap).
    //  - `allowlistOnly`  → nobody outside that list may use the site.
    const { getFocusConfig, getRegistrationConfig, normalizeIds } = await import(
      "@/server/admin/settings.server"
    );
    const registration = await getRegistrationConfig();
    const allowedIds = normalizeIds(registration.allowedIds);
    const isAllowlisted = allowedIds.includes(dulmsId);

    if (registration.allowlistOnly && !isAllowlisted) {
      return { ok: false as const, code: "restricted" as const, message: registration.closedMessage };
    }

    // Lockdown: while focus mode is on, only the whitelisted student ids may
    // sign in. Everyone else gets the lockdown notice instead of a session.
    const focus = await getFocusConfig();
    if (
      focus.enabled &&
      !isAllowlisted &&
      !normalizeIds(focus.dulmsIds).includes(dulmsId)
    ) {
      return { ok: false as const, code: "locked" as const, message: focus.lockedMessage };
    }

    const email = accountEmailFor(dulmsId);

    const password = derivedAccountPassword(dulmsId);

    // Registration is admin-controlled: a brand-new student can only join when
    // the operator opened signups and a seat is still free. Existing accounts
    // always sign in. The check happens first so a stranger's attempt never
    // costs us a DULMS request.
    const { data: preExisting, error: preLookupError } = await supabaseAdmin
      .from("dulms_accounts")
      .select("user_id")
      .eq("dulms_id", dulmsId)
      .maybeSingle();
    if (preLookupError) throw preLookupError;

    // Allowlisted ids are pre-approved: no seat reservation, no closed-signups
    // rejection — they join exactly like the account that already works.
    if (!preExisting?.user_id && !isAllowlisted) {
      if (!registration.open) {
        return { ok: false as const, code: "restricted" as const, message: registration.closedMessage };
      }
      if (registration.seats > 0) {
        const { data: reserved, error: reserveError } = await supabaseAdmin.rpc(
          "reserve_registration_admission",
          { p_dulms_id: dulmsId, p_seat_limit: registration.seats, p_ttl_seconds: 180 },
        );
        if (reserveError) throw reserveError;
        if (!reserved) {
          return {
            ok: false as const,
            code: "full" as const,
            message: "المقاعد المتاحة اكتملت — حاول لاحقًا",
          };
        }
      }
    }

    try {
      await loginToDulms(dulmsId, data.password);
      await recordLoginAttempt(dulmsId, true);
    } catch (cause) {
      if (cause instanceof DulmsAuthError) {
        // Wrong credentials — count it against the throttle.
        await recordLoginAttempt(dulmsId, false);
        return { ok: false as const, code: "auth" as const, message: cause.message };
      }
      return {
        ok: false as const,
        code: "network" as const,
        message: "تعذّر الاتصال بموقع الجامعة الآن، حاول بعد قليل",
      };
    }

    let userId = preExisting?.user_id ?? null;
    if (userId) {
      const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
      });
      if (authUpdateError) throw authUpdateError;
    } else {
      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: dulmsId },
      });
      if (createError || !created?.user) throw createError ?? new Error("account creation failed");
      userId = created.user.id;
    }

    const { error: upsertError } = await supabaseAdmin.from("dulms_accounts").upsert(
      {
        user_id: userId,
        dulms_id: dulmsId,
        password_ciphertext: encryptSecret(data.password),
        key_version: activeKeyVersion(),
        sync_enabled: true,
        last_sync_status: null,
        last_sync_error: null,
        // Un-park an account that was frozen for stale encryption and let the
        // scheduler pick it up on the very next tick.
        check_failures: 0,
        check_claimed_at: null,
        next_check_at: new Date().toISOString(),
        policy_version: data.policyVersion,
        policy_accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (upsertError) throw upsertError;
    await supabaseAdmin
      .from("registration_admission_reservations")
      .delete()
      .eq("dulms_id", dulmsId);

    return { ok: true as const, email, password, userId, dulmsId, message: "تم الدخول بنجاح" };
  });
