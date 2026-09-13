/** Result of a single student's DULMS refresh. */
export interface SyncResult {
  status: "ok" | "auth_error" | "error";
  message: string;
  itemsFound: number;
  newItems: number;
}

/** Postgres rejects very large statements; upserts go out in slices. */
export const UPSERT_CHUNK = 400;

/** Never insert more than this many notification rows for one refresh. */
export const MAX_NOTIFICATIONS_PER_SYNC = 40;

/** How many students one scheduler tick refreshes at the same time. */
export const SYNC_CONCURRENCY = 8;

/** Runs `worker` over `items` with a bounded number of parallel tasks. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index] as T);
    }
  });
  await Promise.all(runners);
  return results;
}

/** Splits an array into fixed-size slices. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size) as T[]);
  return out;
}
