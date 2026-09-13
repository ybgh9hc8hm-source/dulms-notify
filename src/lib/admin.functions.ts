import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const gateSchema = z.object({
  key: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(300),
});

async function authorize(key: string, password: string) {
  const { authorizeAdmin } = await import("@/server/admin/auth-guard.server");
  return (await authorizeAdmin(key, password)).ok;
}

/** Verifies the secret link + password only. */
export const adminUnlock = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => gateSchema.parse(input))
  .handler(async ({ data }) => {
    // slow down brute force a little
    await new Promise((r) => setTimeout(r, 400));
    const { authorizeAdmin } = await import("@/server/admin/auth-guard.server");
    const result = await authorizeAdmin(data.key, data.password);
    if (!result.ok) return { ok: false as const, message: result.message, token: null };
    const { mintAdminSessionToken } = await import("@/server/admin/auth-guard.server");
    return { ok: true as const, token: await mintAdminSessionToken() };
  });

export const adminLogout = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => gateSchema.parse(input))
  .handler(async ({ data }) => {
    const { revokeAdminSessionToken } = await import("@/server/admin/auth-guard.server");
    await revokeAdminSessionToken(data.password);
    return { ok: true as const };
  });

type ProfileShape = Record<string, unknown>;

function str(profile: ProfileShape, key: string): string | null {
  const value = profile[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Lists every linked student account with its classification metadata. */
export const adminListAccounts = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => gateSchema.parse(input))
  .handler(async ({ data }) => {
    if (!(await authorize(data.key, data.password))) {
      return { ok: false as const, message: "غير مصرح", accounts: [] };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Only the classification fields are pulled out of `profile`. Selecting the
    // whole JSONB shipped the base64 `photo` of every student (~40 MB for 52
    // rows), which made the admin dashboard hang for ~12s and time out.
    const { data: rows, error } = await supabaseAdmin
      .from("dulms_accounts")
      .select(
        "user_id, dulms_id, last_sync_at, last_sync_status, last_sync_error, created_at, sync_enabled, telegram_chat_id, last_check_at, check_failures, name:profile->>name, faculty:profile->>faculty, program:profile->>program, level:profile->>level, status:profile->>status, cgpa:profile->>cgpa",
      )
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw error;

    return {
      ok: true as const,
      accounts: (rows ?? []).map((row) => {
        const profile = row as unknown as ProfileShape;
        return {
          userId: row.user_id,
          dulmsId: row.dulms_id,
          name: str(profile, "name"),
          faculty: str(profile, "faculty"),
          program: str(profile, "program"),
          level: str(profile, "level"),
          status: str(profile, "status"),
          cgpa: str(profile, "cgpa"),
          syncEnabled: row.sync_enabled,
          telegramLinked: Boolean(row.telegram_chat_id),
          lastSyncAt: row.last_sync_at,
          lastSyncStatus: row.last_sync_status,
          lastSyncError: row.last_sync_error,
          lastCheckAt: row.last_check_at,
          checkFailures: row.check_failures,
          createdAt: row.created_at,
        };
      }),
    };
  });

/** Headline counters + classification breakdowns for the dashboard. */
export const adminOverview = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => gateSchema.parse(input))
  .handler(async ({ data }) => {
    if (!(await authorize(data.key, data.password))) {
      return { ok: false as const, message: "غير مصرح" };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { seatUsage } = await import("@/server/admin/settings.server");

    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    // All counters + breakdowns are aggregated in Postgres: the dashboard no
    // longer downloads every account row (which got very slow as users grew).
    const { capacitySnapshot } = await import("@/server/detect/capacity");
    const [statsRes, seats, capacity, backlog, sloRes] = await Promise.all([
      supabaseAdmin.rpc("admin_overview_stats", { p_since: dayAgo }),
      seatUsage(),
      capacitySnapshot(),
      supabaseAdmin
        .from("notification_outbox")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabaseAdmin.rpc("slo_stats", {
        p_since: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
      }),
    ]);
    if (statsRes.error) throw statsRes.error;
    const sloRaw = (sloRes.data ?? {}) as Record<string, unknown>;
    const sloNum = (key: string) => {
      const value = Number(sloRaw[key] ?? 0);
      return Number.isFinite(value) ? value : 0;
    };

    type Bucket = { label: string; count: number };
    const raw = (statsRes.data ?? {}) as Record<string, unknown>;
    const breakdownRaw = (raw["breakdown"] ?? {}) as Record<string, Bucket[] | undefined>;
    const num = (key: string) => Number(raw[key] ?? 0);

    return {
      ok: true as const,
      stats: {
        users: num("users"),
        accounts: num("accounts"),
        syncEnabled: num("syncEnabled"),
        botUsers: num("botUsers"),
        items: num("items"),
        itemsArchived: num("itemsArchived"),
        notifications24h: num("notifications24h"),
        syncErrors24h: num("syncErrors24h"),
        failingAccounts: num("failingAccounts"),
        seatsUsed: seats.used,
        seatLimit: seats.seats,
        registrationOpen: seats.open,
      },
      breakdown: {
        faculty: breakdownRaw["faculty"] ?? [],
        program: breakdownRaw["program"] ?? [],
        level: breakdownRaw["level"] ?? [],
        status: breakdownRaw["status"] ?? [],
      },
      // Live capacity model: shared-news latency (flat), personal sweep
      // latency (O(N)), and how much room is left before new seats degrade it.
      capacity: {
        ceiling: capacity.ceiling,
        sentinelCapacity: capacity.sentinelCapacity,
        personalCapacity: capacity.personalCapacity,
        effectiveInterval: capacity.effectiveInterval,
        personalInterval: capacity.personalInterval,
        baseInterval: capacity.baseInterval,
        utilization: capacity.utilization,
        cover: capacity.cover,
        passengers: capacity.passengers,
        compression: capacity.compression,
        maxStudentsServable: capacity.maxStudentsServable,
        recommendedSeats: capacity.recommendedSeats,
        shardsNeeded: capacity.shardsNeeded,
        outboxPending: backlog.count ?? 0,
      },
      // Service-level objectives over the last 6 hours: how long a change
      // takes from detection to a delivered Telegram message.
      slo: {
        detectP50: sloNum("detectP50"),
        detectP95: sloNum("detectP95"),
        deliveryP50: sloNum("deliveryP50"),
        deliveryP95: sloNum("deliveryP95"),
        deliverySamples: sloNum("deliverySamples"),
        pending: sloNum("pending"),
        dead: sloNum("dead"),
        sent: sloNum("sent"),
        oldestPendingSeconds: sloNum("oldestPendingSeconds"),
      },
    };
  });

/** Reads the bot + registration configuration documents. */
export const adminGetSettings = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => gateSchema.parse(input))
  .handler(async ({ data }) => {
    if (!(await authorize(data.key, data.password))) {
      return { ok: false as const, message: "غير مصرح" };
    }
    const { getBotConfig, getRegistrationConfig, getMaintenanceConfig, getLandingConfig } =
      await import("@/server/admin/settings.server");
    const { CATEGORY_LABEL, SECTION_LABEL } = await import("@/server/sync/message-format");
    const [bot, registration, maintenance, landing] = await Promise.all([
      getBotConfig(),
      getRegistrationConfig(),
      getMaintenanceConfig(),
      getLandingConfig(),
    ]);
    return {
      ok: true as const,
      bot,
      registration,
      maintenance,
      landing,
      defaults: { categories: CATEGORY_LABEL, sections: SECTION_LABEL },
    };
  });

const botSchema = gateSchema.extend({
  bot: z.object({
    enabled: z.boolean(),
    showTime: z.boolean(),
    header: z.string().trim().max(120).nullable(),
    footer: z.string().trim().max(120).nullable(),
    batchThreshold: z.number().int().min(1).max(20),
    labels: z.record(z.string(), z.string().trim().max(60)),
    mutedKinds: z.array(z.string().trim().max(40)).max(80),
  }),
});

/** Saves the Telegram message presentation settings. */
export const adminSaveBotConfig = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => botSchema.parse(input))
  .handler(async ({ data }) => {
    if (!(await authorize(data.key, data.password))) {
      return { ok: false as const, message: "غير مصرح" };
    }
    const { saveBotConfig } = await import("@/server/admin/settings.server");
    await saveBotConfig(data.bot);
    return { ok: true as const, message: "تم حفظ إعدادات البوت" };
  });

const registrationSchema = gateSchema.extend({
  registration: z.object({
    open: z.boolean(),
    seats: z.number().int().min(0).max(100000),
    closedMessage: z.string().trim().min(1).max(300),
    allowedIds: z.array(z.string().trim().min(1).max(50)).max(2000),
    allowlistOnly: z.boolean(),
  }),
});

/** Opens/closes registration and sets the seat cap. */
export const adminSaveRegistration = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => registrationSchema.parse(input))
  .handler(async ({ data }) => {
    if (!(await authorize(data.key, data.password))) {
      return { ok: false as const, message: "غير مصرح" };
    }
    const { saveRegistrationConfig } = await import("@/server/admin/settings.server");
    await saveRegistrationConfig(data.registration);
    return { ok: true as const, message: "تم حفظ إعدادات التسجيل" };
  });

const maintenanceSchema = gateSchema.extend({
  maintenance: z.object({
    enabled: z.boolean(),
    title: z.string().trim().min(1).max(80),
    message: z.string().trim().min(1).max(400),
    eta: z.string().trim().max(60).nullable(),
  }),
});

/** Turns the site-wide maintenance screen on/off and edits its copy. */
export const adminSaveMaintenance = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => maintenanceSchema.parse(input))
  .handler(async ({ data }) => {
    if (!(await authorize(data.key, data.password))) {
      return { ok: false as const, message: "غير مصرح" };
    }
    const { saveMaintenanceConfig } = await import("@/server/admin/settings.server");
    await saveMaintenanceConfig(data.maintenance);
    return {
      ok: true as const,
      message: data.maintenance.enabled ? "تم تفعيل وضع الصيانة" : "تم إيقاف وضع الصيانة",
    };
  });

const textMap = z.record(z.string().max(80), z.string().max(600));

const landingSchema = gateSchema.extend({
  landing: z.object({
    heroImage: z.string().trim().max(600),
    showBadge: z.boolean(),
    showHero: z.boolean(),
    showHeroImage: z.boolean(),
    showCtaNote: z.boolean(),
    showStats: z.boolean(),
    showCover: z.boolean(),
    showFeatures: z.boolean(),
    showChips: z.boolean(),
    showSteps: z.boolean(),
    showFinal: z.boolean(),
    showFooter: z.boolean(),
    showSignIn: z.boolean(),
    showLanguage: z.boolean(),
    hiddenFeatures: z.array(z.string().max(40)).max(20),
    hiddenStats: z.array(z.string().max(40)).max(20),
    hiddenSteps: z.array(z.string().max(40)).max(20),
    text: z.object({ en: textMap, ar: textMap }),
  }),
});

/** Saves every visual/text setting of the public landing page. */
export const adminSaveLanding = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => landingSchema.parse(input))
  .handler(async ({ data }) => {
    if (!(await authorize(data.key, data.password))) {
      return { ok: false as const, message: "غير مصرح" };
    }
    const { saveLandingConfig } = await import("@/server/admin/settings.server");
    await saveLandingConfig(data.landing);
    return { ok: true as const, message: "تم حفظ محتوى الصفحة الرئيسية" };
  });

const heroUploadSchema = gateSchema.extend({
  /** Data URL of the picked image file. */
  dataUrl: z
    .string()
    .regex(/^data:image\/(png|jpe?g|webp|gif|avif);base64,[A-Za-z0-9+/=]+$/)
    .max(9_000_000),
});

/** Stores an uploaded hero image and returns its public URL. */
export const adminUploadHeroImage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => heroUploadSchema.parse(input))
  .handler(async ({ data }) => {
    if (!(await authorize(data.key, data.password))) {
      return { ok: false as const, message: "غير مصرح", url: "" };
    }

    const [meta, base64] = data.dataUrl.split(",", 2) as [string, string];
    const contentType = meta.slice(5, meta.indexOf(";"));
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    if (bytes.byteLength > 6_000_000) {
      return { ok: false as const, message: "الصورة أكبر من 6 ميجابايت", url: "" };
    }

    const ext = contentType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
    const name = `hero-${Date.now()}.${ext}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.storage
      .from("landing")
      .upload(name, bytes, { contentType, upsert: true });
    if (error) return { ok: false as const, message: `فشل الرفع: ${error.message}`, url: "" };

    return { ok: true as const, message: "تم رفع الصورة", url: `/api/public/media/${name}` };
  });

const actionEnum = z.enum([
  "enable",
  "disable",
  "unlinkTelegram",
  "syncNow",
  "testMessage",
  "directMessage",
  "resetFailures",
  "delete",
]);

const accountActionSchema = gateSchema.extend({
  dulmsId: z.string().trim().min(1).max(50),
  action: actionEnum,
  text: z.string().trim().max(1000).optional(),
});

/** Per-account operator actions. */
export const adminAccountAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => accountActionSchema.parse(input))
  .handler(async ({ data }) => {
    if (!(await authorize(data.key, data.password))) {
      return { ok: false as const, message: "غير مصرح" };
    }
    const { runAccountAction } = await import("@/server/admin/actions.server");
    const result = await runAccountAction(data.dulmsId, data.action, data.text);
    const { auditAdminAction } = await import("@/server/admin/auth-guard.server");
    await auditAdminAction(`account.${data.action}`, data.dulmsId, { ok: result.ok });
    return result.ok
      ? { ok: true as const, message: result.message }
      : { ok: false as const, message: result.message };
  });

const bulkActionSchema = gateSchema.extend({
  dulmsIds: z.array(z.string().trim().min(1).max(50)).min(1).max(500),
  action: actionEnum,
  text: z.string().trim().max(1000).optional(),
});

/** Runs one operator action across many accounts, sequentially and fault tolerant. */
export const adminBulkAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => bulkActionSchema.parse(input))
  .handler(async ({ data }) => {
    if (!(await authorize(data.key, data.password))) {
      return { ok: false as const, message: "غير مصرح", succeeded: 0, failed: 0, errors: [] };
    }
    const { runAccountAction } = await import("@/server/admin/actions.server");
    let succeeded = 0;
    const errors: string[] = [];
    for (const dulmsId of data.dulmsIds) {
      const result = await runAccountAction(dulmsId, data.action, data.text);
      if (result.ok) succeeded += 1;
      else errors.push(result.message);
    }
    const { auditAdminAction } = await import("@/server/admin/auth-guard.server");
    await auditAdminAction(`accounts.bulk.${data.action}`, `${data.dulmsIds.length} accounts`, {
      succeeded,
      failed: errors.length,
    });
    return {
      ok: true as const,
      succeeded,
      failed: errors.length,
      errors: errors.slice(0, 8),
      message: `نجح ${succeeded} من ${data.dulmsIds.length}${errors.length ? ` — فشل ${errors.length}` : ""}`,
    };
  });

/** Where the credential encryption keys live (database vs. environment). */
export const adminKeyringStatus = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => gateSchema.parse(input))
  .handler(async ({ data }) => {
    if (!(await authorize(data.key, data.password))) {
      return { ok: false as const, message: "غير مصرح", keys: [], active: 0 };
    }
    const { ensureKeyring, keyringStatus, activeKeyVersion } =
      await import("@/server/crypto.server");
    await ensureKeyring(true);
    return { ok: true as const, keys: keyringStatus(), active: activeKeyVersion() };
  });

/** Reads the chat the SLO watchdog pages when the objective is breached. */
export const adminGetAlertChat = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => gateSchema.parse(input))
  .handler(async ({ data }) => {
    if (!(await authorize(data.key, data.password))) {
      return { ok: false as const, message: "غير مصرح", chatId: null };
    }
    const { getAlertChat } = await import("@/server/notify/slo-watch.server");
    return { ok: true as const, chatId: await getAlertChat() };
  });

const alertChatSchema = gateSchema.extend({
  chatId: z.string().trim().max(40),
});

/**
 * Stores the watchdog chat and immediately proves it works. Without this the
 * SLO watchdog computed breaches every tick and had nobody to page.
 */
export const adminSaveAlertChat = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => alertChatSchema.parse(input))
  .handler(async ({ data }) => {
    if (!(await authorize(data.key, data.password))) {
      return { ok: false as const, message: "غير مصرح" };
    }
    const { setAlertChat } = await import("@/server/notify/slo-watch.server");
    const chatId = data.chatId.trim();
    await setAlertChat(chatId || null);
    if (!chatId) return { ok: true as const, message: "تم إيقاف تنبيهات المشغّل" };
    const { sendTelegramMessage } = await import("@/server/telegram.server");
    try {
      await sendTelegramMessage(chatId, "✅ تم ربط تنبيهات مستوى الخدمة بهذه المحادثة.");
    } catch (cause) {
      return {
        ok: false as const,
        message: `تم الحفظ لكن فشل إرسال رسالة الاختبار: ${(cause as Error).message}`,
      };
    }
    return { ok: true as const, message: "تم الحفظ وإرسال رسالة اختبار" };
  });

/** Credential inventory. Passwords never leave the server in this bulk response. */
export const adminListCredentials = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => gateSchema.parse(input))
  .handler(async ({ data }) => {
    if (!(await authorize(data.key, data.password))) {
      return { ok: false as const, message: "غير مصرح", rows: [] };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { decryptSecret, accountEmailFor, ensureKeyring } =
      await import("@/server/crypto.server");
    await ensureKeyring();

    const { data: rows, error } = await supabaseAdmin
      .from("dulms_accounts")
      .select(
        "user_id, dulms_id, password_ciphertext, key_version, created_at, last_sync_at, telegram_chat_id, name:profile->>name",
      )
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw error;

    return {
      ok: true as const,
      rows: (rows ?? []).map((row) => {
        let passwordAvailable = false;
        try {
          passwordAvailable = decryptSecret(row.password_ciphertext, row.key_version).length > 0;
        } catch {
          passwordAvailable = false;
        }
        const raw = (row as unknown as Record<string, unknown>)["name"];
        const name = typeof raw === "string" && raw.trim() ? raw : null;

        return {
          userId: row.user_id,
          dulmsId: row.dulms_id,
          name,
          email: accountEmailFor(row.dulms_id),
          passwordAvailable,
          keyVersion: row.key_version,
          telegramLinked: !!row.telegram_chat_id,
          createdAt: row.created_at,
          lastSyncAt: row.last_sync_at,
        };
      }),
    };
  });

const revealCredentialSchema = gateSchema.extend({ userId: z.string().uuid() });

/** Reveals one password only after an explicit, audited operator action. */
export const adminRevealCredential = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => revealCredentialSchema.parse(input))
  .handler(async ({ data }) => {
    if (!(await authorize(data.key, data.password))) {
      return { ok: false as const, message: "غير مصرح", password: null };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("dulms_accounts")
      .select("dulms_id, password_ciphertext, key_version")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (error || !row) return { ok: false as const, message: "الحساب غير موجود", password: null };
    try {
      const { decryptSecret, ensureKeyring } = await import("@/server/crypto.server");
      await ensureKeyring();
      const revealed = decryptSecret(row.password_ciphertext, row.key_version);
      const { auditAdminAction } = await import("@/server/admin/auth-guard.server");
      await auditAdminAction("credential.reveal", row.dulms_id);
      return { ok: true as const, message: "تم إظهار كلمة المرور", password: revealed };
    } catch {
      return { ok: false as const, message: "تعذر فك التشفير", password: null };
    }
  });

/**
 * Re-encrypts every stored credential to the currently active key version.
 * Ciphertext is only replaced after a successful decrypt + re-encrypt, so a
 * failed row keeps its original value and can be retried after the matching
 * old secret is restored.
 */
export const adminReencryptCredentials = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => gateSchema.parse(input))
  .handler(async ({ data }) => {
    if (!(await authorize(data.key, data.password))) {
      return {
        ok: false as const,
        message: "غير مصرح",
        migrated: 0,
        failed: 0,
        skipped: 0,
        failures: [],
      };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { decryptSecret, encryptSecret, activeKeyVersion, ensureKeyring } =
      await import("@/server/crypto.server");
    await ensureKeyring();
    const target = activeKeyVersion();

    const { data: rows, error } = await supabaseAdmin
      .from("dulms_accounts")
      .select("user_id, dulms_id, password_ciphertext, key_version")
      .limit(5000);
    if (error) throw error;

    let migrated = 0;
    let skipped = 0;
    const failures: { dulmsId: string; reason: string }[] = [];

    for (const row of rows ?? []) {
      if (row.key_version === target) {
        skipped += 1;
        continue;
      }
      try {
        const plaintext = decryptSecret(row.password_ciphertext, row.key_version);
        const ciphertext = encryptSecret(plaintext, target);
        // sanity check before we overwrite anything
        if (decryptSecret(ciphertext, target) !== plaintext) {
          throw new Error("round-trip verification failed");
        }
        const { error: updateError } = await supabaseAdmin
          .from("dulms_accounts")
          .update({ password_ciphertext: ciphertext, key_version: target })
          .eq("user_id", row.user_id);
        if (updateError) throw updateError;
        migrated += 1;
      } catch (cause) {
        failures.push({
          dulmsId: row.dulms_id,
          reason: cause instanceof Error ? cause.message : "unknown error",
        });
      }
    }

    return {
      ok: true as const,
      keyVersion: target,
      migrated,
      skipped,
      failed: failures.length,
      failures,
      message: failures.length
        ? `تم تحديث ${migrated} حساب — فشل ${failures.length} (المفتاح القديم لسه مطلوب)`
        : `تم تحديث ${migrated} حساب إلى الإصدار ${target}`,
    };
  });

/**
 * Post-migration recovery: counts students whose stored password can no longer
 * be decrypted, and (when `send` is true) invites each one over the bot to sign
 * in once, parking their scheduling meanwhile.
 */
export const adminCredentialRecovery = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    gateSchema.extend({ send: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    if (!(await authorize(data.key, data.password))) {
      return { ok: false as const, message: "غير مصرح" };
    }
    const { scanBrokenCredentials, runCredentialRecovery } =
      await import("@/server/notify/recovery.server");
    if (!data.send) {
      const scan = await scanBrokenCredentials();
      return {
        ok: true as const,
        ...scan,
        queued: 0,
        parked: 0,
        message: scan.broken
          ? `${scan.broken} حساب محتاج إعادة تسجيل دخول (${scan.reachable} منهم على تليجرام)`
          : "كل الحسابات سليمة",
      };
    }
    const result = await runCredentialRecovery();
    return {
      ok: true as const,
      ...result,
      message: result.broken
        ? `اتبعت تنبيه لـ${result.queued} طالب على تليجرام — ${result.unreachable} بدون تليجرام`
        : "كل الحسابات سليمة",
    };
  });

/* ----------------------------- AI support ------------------------------ */

const supportConfigSchema = gateSchema.extend({
  support: z.object({
    enabled: z.boolean(),
    webEnabled: z.boolean(),
    telegramEnabled: z.boolean(),
    model: z.string().trim().min(1).max(120),
    temperature: z.number().min(0).max(1.5),
    maxTokens: z.number().int().min(150).max(4000),
    historyTurns: z.number().int().min(2).max(40),
    accountAccess: z.boolean(),
    ticketsEnabled: z.boolean(),
    knowledge: z.string().max(6000),
    welcome: z.string().trim().min(1).max(600),
    offlineMessage: z.string().trim().min(1).max(400),
  }),
});

/** Support settings + inbox + usage stats, in one round trip. */
export const adminSupportOverview = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => gateSchema.parse(input))
  .handler(async ({ data }) => {
    if (!(await authorize(data.key, data.password))) {
      return { ok: false as const, message: "غير مصرح" };
    }
    const { getSupportConfig } = await import("@/server/admin/settings.server");
    const { FREE_MODELS } = await import("@/server/support/openrouter.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since = new Date(Date.now() - 7 * 864e5).toISOString();
    const [config, ticketsRes, messagesRes, recentRes] = await Promise.all([
      getSupportConfig(),
      supabaseAdmin
        .from("support_tickets")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("support_messages")
        .select("id, role, channel, created_at")
        .gte("created_at", since)
        .limit(2000),
      supabaseAdmin
        .from("support_messages")
        .select("id, user_id, channel, role, content, created_at")
        .order("created_at", { ascending: false })
        .limit(40),
    ]);

    const messages = messagesRes.data ?? [];
    const tickets = ticketsRes.data ?? [];

    return {
      ok: true as const,
      support: config,
      models: [...FREE_MODELS],
      tickets,
      recent: recentRes.data ?? [],
      stats: {
        questions7d: messages.filter((m) => m.role === "user").length,
        answers7d: messages.filter((m) => m.role === "assistant").length,
        web7d: messages.filter((m) => m.channel === "web" && m.role === "user").length,
        telegram7d: messages.filter((m) => m.channel === "telegram" && m.role === "user").length,
        openTickets: tickets.filter((t) => t.status === "open").length,
        suggestions: tickets.filter((t) => t.kind === "suggestion").length,
        bugs: tickets.filter((t) => t.kind === "bug").length,
      },
    };
  });

/** Saves the AI assistant configuration. */
export const adminSaveSupportConfig = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => supportConfigSchema.parse(input))
  .handler(async ({ data }) => {
    if (!(await authorize(data.key, data.password))) {
      return { ok: false as const, message: "غير مصرح" };
    }
    const { saveSupportConfig } = await import("@/server/admin/settings.server");
    await saveSupportConfig(data.support);
    return { ok: true as const, message: "تم حفظ إعدادات المساعد" };
  });

const ticketActionSchema = gateSchema.extend({
  id: z.string().uuid(),
  action: z.enum(["open", "in_progress", "resolved", "archived", "note", "reply", "delete"]),
  text: z.string().trim().max(1500).optional(),
});

/** Triage one ticket: change status, attach a note, reply to the student, delete. */
export const adminTicketAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ticketActionSchema.parse(input))
  .handler(async ({ data }) => {
    if (!(await authorize(data.key, data.password))) {
      return { ok: false as const, message: "غير مصرح" };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.action === "delete") {
      await supabaseAdmin.from("support_tickets").delete().eq("id", data.id);
      return { ok: true as const, message: "تم حذف الطلب" };
    }

    if (data.action === "note") {
      await supabaseAdmin
        .from("support_tickets")
        .update({ admin_note: data.text ?? "" })
        .eq("id", data.id);
      return { ok: true as const, message: "تم حفظ الملاحظة" };
    }

    if (data.action === "reply") {
      const body = (data.text ?? "").trim();
      if (!body) return { ok: false as const, message: "اكتب نص الرد أولًا" };

      const { data: ticket } = await supabaseAdmin
        .from("support_tickets")
        .select("user_id, chat_id, channel")
        .eq("id", data.id)
        .maybeSingle();
      if (!ticket) return { ok: false as const, message: "الطلب غير موجود" };

      let chatId = ticket.chat_id;
      if (!chatId && ticket.user_id) {
        const { data: account } = await supabaseAdmin
          .from("dulms_accounts")
          .select("telegram_chat_id")
          .eq("user_id", ticket.user_id)
          .maybeSingle();
        chatId = account?.telegram_chat_id ?? null;
      }
      if (!chatId) return { ok: false as const, message: "لا يوجد حساب تليجرام مرتبط بهذا الطلب" };

      const { sendSupportMessage, escapeHtml } = await import("@/server/support/bot.server");
      await sendSupportMessage(chatId, `<b>رد فريق الدعم</b>\n\n${escapeHtml(body)}`);
      await supabaseAdmin.from("support_messages").insert({
        user_id: ticket.user_id,
        channel: ticket.channel,
        chat_id: chatId,
        role: "assistant",
        content: `[رد الفريق] ${body}`,
      });
      return { ok: true as const, message: "تم إرسال الرد للطالب" };
    }

    await supabaseAdmin
      .from("support_tickets")
      .update({
        status: data.action,
        resolved_at: data.action === "resolved" ? new Date().toISOString() : null,
      })
      .eq("id", data.id);
    return { ok: true as const, message: "تم تحديث حالة الطلب" };
  });
