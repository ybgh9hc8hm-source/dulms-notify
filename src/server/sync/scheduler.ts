/**
 * Background scheduler.
 *
 * The cron hook can be called by several workers at once, so the queue is
 * claimed atomically in the database (`claim_sync_batch`, FOR UPDATE SKIP
 * LOCKED): each student is picked up by exactly one worker, stale claims are
 * released automatically, and the batch is refreshed with bounded
 * concurrency instead of one-at-a-time.
 */
import { syncUser } from "./sync-user";
import { SYNC_CONCURRENCY, mapWithConcurrency } from "./shared";

export interface SchedulerOptions {
  /** Maximum students to refresh in this tick. */
  limit?: number;
  /** Only refresh students whose last sync is older than this. */
  staleSeconds?: number;
  /** How long a claim is honoured before another worker may retry it. */
  lockSeconds?: number;
  /** Parallel scrapes per tick. */
  concurrency?: number;
}

export async function syncAllUsers(
  limitOrOptions: number | SchedulerOptions = {},
): Promise<{ userId: string; status: string }[]> {
  const options: SchedulerOptions =
    typeof limitOrOptions === "number" ? { limit: limitOrOptions } : limitOrOptions;
  const {
    limit = 50,
    staleSeconds = 5,
    lockSeconds = 120,
    concurrency = SYNC_CONCURRENCY,
  } = options;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data, error } = await supabaseAdmin.rpc("claim_sync_batch", {
    p_limit: limit,
    p_stale_seconds: staleSeconds,
    p_lock_seconds: lockSeconds,
  });
  if (error) {
    console.error("[sync] failed to claim batch", error);
    throw error;
  }

  const userIds = ((data ?? []) as unknown as string[]).filter(Boolean);

  const results = await mapWithConcurrency(userIds, concurrency, async (userId) => {
    try {
      const result = await syncUser(userId);
      return { userId, status: result.status };
    } catch (cause) {
      console.error("[sync] user failed", userId, cause);
      await supabaseAdmin
        .from("dulms_accounts")
        .update({ sync_claimed_at: null, last_sync_status: "error" })
        .eq("user_id", userId);
      return { userId, status: "error" };
    }
  });

  return results;
}

/** Keeps `sync_logs` small; safe to call on every scheduler tick. */
export async function purgeOldSyncLogs(days = 7): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("purge_old_sync_logs", { p_days: days });
  if (error) {
    console.error("[sync] log purge failed", error);
    return 0;
  }
  return Number(data ?? 0);
}
