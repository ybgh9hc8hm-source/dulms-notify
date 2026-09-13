/**
 * Tunables for the direct detection engine.
 *
 * There is exactly one mode now: every enabled account is polled on the same
 * short interval and any movement triggers an immediate full pull. No sleep
 * window, no jitter, no activity curve, no cluster sharing.
 */

function num(key: string, fallback: number): number {
  const raw = Number(process.env[key]);
  return Number.isFinite(raw) ? raw : fallback;
}

/** Seconds between two notification checks for the same account. */
export function notificationCheckInterval(): number {
  return Math.max(3, num("NOTIFICATION_CHECK_INTERVAL", 5));
}

/**
 * Seconds between two safety-net full pulls per account. Detection itself is
 * event-driven; this only repairs state the notification feed never mentions.
 */
export function fingerprintCheckInterval(): number {
  return Math.max(60, num("FINGERPRINT_CHECK_INTERVAL", 30 * 60));
}

/** Hard cap on pushes produced by one detection cycle for one student. */
export function maxNotificationBatch(): number {
  return Math.max(1, num("MAX_NOTIFICATION_BATCH", 5));
}

/**
 * Timestamp for this account's next check: plain interval, nothing else.
 * Spreading only ever existed to protect a shared per-minute ceiling that the
 * direct engine no longer has.
 */
export function nextCheckAt(
  _userId: string,
  now: Date = new Date(),
  intervalSeconds?: number,
): string {
  const interval = Math.max(3, Math.round(intervalSeconds ?? notificationCheckInterval()));
  return new Date(now.getTime() + interval * 1000).toISOString();
}
