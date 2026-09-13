/**
 * Sync layer — public surface.
 *
 *   sync/labels.ts     — Arabic labels used for notifications
 *   sync/shared.ts     — result type, batching + concurrency helpers
 *   sync/sync-user.ts  — refresh a single student
 *   sync/scheduler.ts  — claim + refresh a batch (cron entry point)
 */

export type { SyncResult } from "./sync/shared";
export { syncUser } from "./sync/sync-user";
export { purgeOldSyncLogs, syncAllUsers } from "./sync/scheduler";
export type { HeartbeatOptions, HeartbeatSummary } from "./sync/heartbeat-scheduler";
export { checkAllUsers } from "./sync/heartbeat-scheduler";
