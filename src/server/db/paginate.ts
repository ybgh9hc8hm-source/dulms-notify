/**
 * PostgREST caps every response at 1 000 rows (`db-max-rows`), silently — a
 * `.limit(20000)` still returns 1 000. At 10 000 students the cluster engine,
 * the sentinel cover and the broadcast audience all cross that line, so every
 * bulk read goes through this helper: it walks the table with `.range()` until
 * a short page proves the end was reached.
 */
const PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  options: { pageSize?: number; maxRows?: number } = {},
): Promise<T[]> {
  const pageSize = options.pageSize ?? PAGE_SIZE;
  const maxRows = options.maxRows ?? 500_000;
  const out: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}
