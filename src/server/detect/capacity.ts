/**
 * Capacity model for the direct engine.
 *
 * There is no shared per-minute ceiling any more, so capacity is simply:
 * how many students can one worker minute poll at the configured interval,
 * with the concurrency the runtime allows.
 *
 * checksPerMinute(student) = 60 / interval
 * A worker pass handles `concurrency` students per average check duration.
 */
import { fingerprintCheckInterval, notificationCheckInterval } from "./config";

export interface CapacitySnapshot {
  /** Requests per minute one worker can realistically issue. */
  ceiling: number;
  sentinelCapacity: number;
  personalCapacity: number;
  effectiveInterval: number;
  personalInterval: number;
  baseInterval: number;
  utilization: number;
  cover: number;
  passengers: number;
  compression: number;
  maxStudentsServable: number;
  recommendedSeats: number;
  shardsNeeded: number;
  outboxPending: number;
}

function num(key: string, fallback: number): number {
  const raw = Number(process.env[key]);
  return Number.isFinite(raw) ? raw : fallback;
}

/** Average seconds one warm feed check takes end to end. */
const CHECK_SECONDS = 1.2;
/** Requests a full scrape costs, amortised over the safety-net interval. */
const FULL_PULL_REQUESTS = 12;

export async function capacitySnapshot(): Promise<CapacitySnapshot> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const interval = notificationCheckInterval();
  const concurrency = Math.max(1, num("SYNC_CONCURRENCY", 6));

  // One worker minute = 60s * concurrency of check-seconds.
  const ceiling = Math.floor((60 / CHECK_SECONDS) * concurrency);
  const perStudent = 60 / interval + (FULL_PULL_REQUESTS * 60) / fingerprintCheckInterval();
  const maxStudentsServable = Math.max(1, Math.floor(ceiling / perStudent));

  const [{ count: enabled }, { count: pending }] = await Promise.all([
    supabaseAdmin
      .from("dulms_accounts")
      .select("user_id", { count: "exact", head: true })
      .eq("sync_enabled", true),
    supabaseAdmin
      .from("notification_outbox")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  const active = enabled ?? 0;
  const demand = active * perStudent;

  return {
    ceiling,
    sentinelCapacity: ceiling,
    personalCapacity: ceiling,
    effectiveInterval: interval,
    personalInterval: interval,
    baseInterval: interval,
    utilization: ceiling > 0 ? Math.round((demand / ceiling) * 100) / 100 : 0,
    // Direct mode: everyone is polled for themselves, nobody rides along.
    cover: active,
    passengers: 0,
    compression: 1,
    maxStudentsServable,
    recommendedSeats: maxStudentsServable,
    shardsNeeded: Math.max(1, Math.ceil(demand / Math.max(1, ceiling))),
    outboxPending: pending ?? 0,
  };
}

/** Detection interval for the direct engine — constant by design. */
export async function adaptiveCheckInterval(): Promise<number> {
  return notificationCheckInterval();
}
