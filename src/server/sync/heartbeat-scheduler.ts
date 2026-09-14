/**
 * Direct detection engine.
 *
 * One mode, no tiers: every enabled account is claimed as soon as it is due,
 * polled with a single request to /Notifications/GetNotifications, and the
 * moment its highest NotificationId moves the full scrape runs immediately so
 * the Telegram message carries the real, itemised content instead of a generic
 * "something changed" ping.
 *
 * Deliberately gone: cluster sharing, sentinel cover, lane budgeting, the
 * per-minute rate ceiling, the circuit breaker, the sleep window and jitter.
 */
import { checkForChanges } from "../dulms/heartbeat";
import { readRegistrationSnapshot } from "../dulms/registration";
import type { Json } from "@/integrations/supabase/types";
import { readAccountPassword } from "../credentials.server";
import { DulmsAuthError } from "../dulms.server";
import { fingerprintCheckInterval, nextCheckAt, notificationCheckInterval } from "../detect/config";
import { syncUser } from "./sync-user";
import { SYNC_CONCURRENCY, mapWithConcurrency } from "./shared";

export interface HeartbeatOptions {
  /** Maximum students claimed per pass. */
  limit?: number;
  /** Only check students whose last claim is older than this. */
  staleSeconds?: number;
  /** How long a claim is honoured before another worker may retry it. */
  lockSeconds?: number;
  /** Parallel checks per pass. */
  concurrency?: number;
  /**
   * Wall-clock budget for this tick. The engine keeps looping inside a single
   * invocation, which is what turns a 1-per-minute cron into a 5-second cadence.
   */
  loopMs?: number;
  /** Accepted for compatibility with older callers; the engine never sleeps. */
  force?: boolean;
}

export interface HeartbeatOutcome {
  userId: string;
  status: "unchanged" | "synced" | "skipped" | "auth_error" | "error";
  requests: number;
  notifyMs?: number;
  /** True when the full scrape ran on this tick. */
  fullPull?: boolean;
}

export interface HeartbeatSummary {
  checked: number;
  changed: number;
  skipped: number;
  requests: number;
  /** Passes executed inside this invocation. */
  passes: number;
  intervalSeconds: number;
  results: HeartbeatOutcome[];
}

/** Cost of one warm check: a single feed request. */
const HEARTBEAT_COST = 1;
/** Extra requests a cold sign-in adds on top of HEARTBEAT_COST. */
const LOGIN_EXTRA_COST = 2;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Account = {
  user_id: string;
  dulms_id: string;
  password_ciphertext: string;
  key_version: number | null;
  last_notification_signature: string | null;
  last_notification_id: number | null;
  last_fingerprint_at: string | null;
  last_sync_at: string | null;
  last_registration_signature: string | null;
  last_registration_snapshot: Json | null;
  check_failures: number | null;
};

const ACCOUNT_COLUMNS =
  "user_id, dulms_id, password_ciphertext, key_version, last_notification_signature, last_notification_id, last_fingerprint_at, last_sync_at, last_registration_signature, last_registration_snapshot, check_failures";

export async function checkAllUsers(options: HeartbeatOptions = {}): Promise<HeartbeatSummary> {
  const {
    limit = 100,
    // Direct mode re-checks the same account every few seconds, so the
    // staleness guard only exists to stop two workers doubling up.
    staleSeconds = 3,
    lockSeconds = 20,
    concurrency = SYNC_CONCURRENCY,
    loopMs = 0,
  } = options;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await (await import("../crypto.server")).ensureKeyring();

  const interval = notificationCheckInterval();
  const deadline = Date.now() + Math.max(0, loopMs);
  const results: HeartbeatOutcome[] = [];
  let passes = 0;

  do {
    const passStarted = Date.now();
    const { data, error } = await supabaseAdmin.rpc("claim_check_batch", {
      p_limit: limit,
      p_stale_seconds: staleSeconds,
      p_lock_seconds: lockSeconds,
    });
    if (error) {
      console.error("[heartbeat] claim failed", error);
      break;
    }
    const userIds = ((data ?? []) as unknown as string[]).filter(Boolean);

    if (userIds.length > 0) {
      const { data: accounts } = await supabaseAdmin
        .from("dulms_accounts")
        .select(ACCOUNT_COLUMNS)
        .in("user_id", userIds);

      const passResults = await mapWithConcurrency(
        (accounts ?? []) as Account[],
        concurrency,
        async (account) => {
          try {
            return await runCheck(account, interval);
          } catch (cause) {
            console.error("[heartbeat] unhandled account failure", account.user_id, cause);
            const { error: releaseError } = await supabaseAdmin
              .from("dulms_accounts")
              .update({
                check_claimed_at: null,
                next_check_at: nextCheckAt(account.user_id, new Date(), interval),
              })
              .eq("user_id", account.user_id);
            if (releaseError) {
              console.error("[heartbeat] claim release failed", account.user_id, releaseError);
            }
            return { userId: account.user_id, status: "error", requests: 0 } as HeartbeatOutcome;
          }
        },
      );
      results.push(...passResults);
      passes += 1;
    }

    if (Date.now() >= deadline) break;
    // Nothing was due: wait a beat instead of hammering the claim query.
    const elapsed = Date.now() - passStarted;
    const idle = userIds.length === 0 ? 1_000 : Math.max(0, interval * 1000 - elapsed);
    await sleep(Math.min(idle, Math.max(0, deadline - Date.now())));
  } while (Date.now() < deadline);

  return {
    checked: results.length,
    changed: results.filter((r) => r.status === "synced").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    requests: results.reduce((sum, r) => sum + r.requests, 0),
    passes,
    intervalSeconds: interval,
    results,
  };
}

async function runCheck(account: Account, intervalSeconds: number): Promise<HeartbeatOutcome> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const userId = account.user_id;
  const startedAt = Date.now();

  const finish = async (
    status: HeartbeatOutcome["status"],
    requests: number,
    extra: {
      signature?: string;
      notificationId?: number | null;
      fingerprintAt?: string;
      notifyMs?: number;
      skippedReason?: string;
      syncStatus?: string;
      syncError?: string | null;
      failures?: number;
      fullPull?: boolean;
      registrationSignature?: string;
      registrationSnapshot?: Json;
      registrationMs?: number;
    } = {},
  ): Promise<HeartbeatOutcome> => {
    const now = new Date().toISOString();
    const { error: accountUpdateError } = await supabaseAdmin
      .from("dulms_accounts")
      .update({
        check_claimed_at: null,
        next_check_at: nextCheckAt(userId, new Date(), intervalSeconds),
        check_priority: 0,
        priority_reason: null,
        last_check_at: now,
        ...(extra.signature ? { last_notification_signature: extra.signature } : {}),
        ...(extra.notificationId !== undefined
          ? { last_notification_id: extra.notificationId }
          : {}),
        ...(extra.fingerprintAt ? { last_fingerprint_at: extra.fingerprintAt } : {}),
        ...(extra.registrationSignature
          ? {
              last_registration_signature: extra.registrationSignature,
              last_registration_snapshot: extra.registrationSnapshot ?? null,
              last_registration_check_at: now,
            }
          : {}),
        ...(extra.syncStatus
          ? { last_sync_status: extra.syncStatus, last_sync_error: extra.syncError ?? null }
          : {}),
        ...(extra.failures !== undefined ? { check_failures: extra.failures } : {}),
      })
      .eq("user_id", userId);
    if (accountUpdateError) throw accountUpdateError;

    // Light observability only: ids, timings, status. Never payloads.
    const { error: heartbeatInsertError } = await supabaseAdmin.from("heartbeat_checks").insert({
      user_id: userId,
      changed: status === "synced",
      requests,
      check_ms: Date.now() - startedAt,
      notify_ms: extra.notifyMs ?? null,
      registration_ms: extra.registrationMs ?? null,
      skipped_reason: extra.skippedReason ?? null,
    });
    if (heartbeatInsertError) {
      console.error("[heartbeat] telemetry insert failed", userId, heartbeatInsertError);
    }

    return {
      userId,
      status,
      requests,
      ...(extra.notifyMs !== undefined ? { notifyMs: extra.notifyMs } : {}),
      ...(extra.fullPull !== undefined ? { fullPull: extra.fullPull } : {}),
    };
  };

  let signature: string;
  let requests: number;
  let maxId: number | null;
  const password = readAccountPassword(account.password_ciphertext, account.key_version);
  const registrationStarted = Date.now();
  try {
    const [result, registration] = await Promise.all([
      checkForChanges(account.dulms_id, password, account.last_notification_signature),
      readRegistrationSnapshot(account.dulms_id, password),
    ]);
    signature = result.signature;
    requests = result.cost;
    maxId = result.maxNotificationId;
    const registrationMs = Date.now() - registrationStarted;
    const { processRegistrationWatches } = await import("./registration-watch.server");
    await processRegistrationWatches(userId, registration.options);
    const registrationBootstrap = account.last_registration_signature === null;
    const registrationChanged =
      !registrationBootstrap && registration.signature !== account.last_registration_signature;

    if (registrationChanged) {
      const { sendImmediateRegistrationAlert } = await import("./registration-alert.server");
      await sendImmediateRegistrationAlert(
        userId,
        registration.signature,
        registration.items,
        registration.options,
        account.last_registration_snapshot,
      );
      await syncUser(userId, { suppressRegistrationNotifications: true });
      return finish("synced", requests + 2, {
        signature,
        notificationId:
          maxId !== null
            ? Math.max(maxId, account.last_notification_id ?? maxId)
            : account.last_notification_id,
        fingerprintAt: new Date().toISOString(),
        failures: 0,
        notifyMs: Date.now() - startedAt,
        fullPull: true,
        registrationSignature: registration.signature,
        registrationSnapshot: JSON.parse(JSON.stringify(registration.items)) as Json,
        registrationMs,
      });
    }

    account.last_registration_signature = registration.signature;
    account.last_registration_snapshot = JSON.parse(JSON.stringify(registration.items)) as Json;
  } catch (cause) {
    const isAuth = cause instanceof DulmsAuthError;
    const message = cause instanceof Error ? cause.message : "خطأ غير متوقع";
    console.error("[heartbeat] check failed", userId, isAuth ? "auth" : "error");
    return finish(isAuth ? "auth_error" : "error", HEARTBEAT_COST + LOGIN_EXTRA_COST, {
      syncStatus: isAuth ? "auth_error" : "error",
      syncError: message,
      failures: (account.check_failures ?? 0) + 1,
    });
  }

  const baseline = account.last_notification_id;
  const isBootstrap = baseline === null;
  const moved = !isBootstrap && maxId !== null && maxId > baseline;
  const nextNotificationId = maxId !== null ? Math.max(maxId, baseline ?? maxId) : (baseline ?? 0);

  // Safety net only: repairs anything the notification feed never announces
  // (silent grade edits, registration windows opening without a feed entry).
  const fullPullDue =
    (account.check_failures ?? 0) === 0 &&
    (account.last_sync_at === null ||
      account.last_fingerprint_at === null ||
      Date.now() - new Date(account.last_fingerprint_at).getTime() >=
        fingerprintCheckInterval() * 1000);

  if (!moved && !fullPullDue) {
    return finish("unchanged", requests, {
      signature,
      notificationId: nextNotificationId,
      failures: 0,
      registrationSignature: account.last_registration_signature ?? undefined,
      registrationSnapshot: account.last_registration_snapshot,
      registrationMs: Date.now() - registrationStarted,
    });
  }

  // Direct path: the feed moved, so pull everything right now. The full scrape
  // is what produces the real, detailed Telegram message.
  const fingerprintAt = new Date().toISOString();
  try {
    await syncUser(userId);
  } catch (cause) {
    console.error("[heartbeat] full pull failed", userId, cause);
    return finish("error", requests, {
      failures: (account.check_failures ?? 0) + 1,
      syncStatus: "error",
      syncError: cause instanceof Error ? cause.message : "خطأ غير متوقع",
      signature,
      notificationId: nextNotificationId,
    });
  }

  return finish(moved ? "synced" : "unchanged", requests, {
    signature,
    notificationId: nextNotificationId,
    fingerprintAt,
    failures: 0,
    notifyMs: Date.now() - startedAt,
    fullPull: true,
    registrationSignature: account.last_registration_signature ?? undefined,
    registrationSnapshot: account.last_registration_snapshot,
    registrationMs: Date.now() - registrationStarted,
  });
}
