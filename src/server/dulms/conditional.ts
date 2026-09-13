/**
 * Conditional fetch + delta parsing cache for DULMS endpoints.
 *
 * Two cheap wins that compound at 10k students:
 *
 *  1. **Conditional fetch** — we replay the last `ETag` / `Last-Modified` we
 *     saw for a (student, endpoint) pair. When DULMS answers `304 Not
 *     Modified` there is no body to download and nothing to parse: the check
 *     costs a few hundred bytes instead of a full response.
 *  2. **Delta-only parsing** — when the server does not support conditional
 *     requests we still hash the raw body before touching `JSON.parse`. An
 *     unchanged hash means an unchanged feed, so we reuse the previously
 *     derived summary and skip parsing + fingerprinting entirely.
 *
 * The cache is per worker isolate and purely an optimisation: a cold isolate
 * simply pays one normal parse. Values are tiny (hash + a couple of numbers),
 * and the map is bounded so a large cohort can never grow it without limit.
 */

export interface ConditionalEntry<T> {
  etag: string | null;
  lastModified: string | null;
  bodyHash: string;
  value: T;
  touchedAt: number;
}

const MAX_ENTRIES = 20_000;
const store = new Map<string, ConditionalEntry<unknown>>();

/** FNV-1a over the raw body — dependency free and fast enough for 100 KB. */
export function hashBody(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${text.length.toString(36)}-${hash.toString(16)}`;
}

export function cacheKey(dulmsId: string, endpoint: string): string {
  return `${dulmsId}::${endpoint}`;
}

export function readCache<T>(key: string): ConditionalEntry<T> | null {
  const entry = store.get(key) as ConditionalEntry<T> | undefined;
  if (!entry) return null;
  entry.touchedAt = Date.now();
  return entry;
}

/** Headers that turn a normal request into a conditional one. */
export function conditionalHeaders(key: string): Record<string, string> {
  const entry = store.get(key);
  if (!entry) return {};
  const headers: Record<string, string> = {};
  if (entry.etag) headers["if-none-match"] = entry.etag;
  if (entry.lastModified) headers["if-modified-since"] = entry.lastModified;
  return headers;
}

export function writeCache<T>(
  key: string,
  value: T,
  bodyHash: string,
  res?: { headers: Headers },
): void {
  if (store.size >= MAX_ENTRIES) {
    // Drop the coldest tenth instead of clearing everything.
    const victims = [...store.entries()]
      .sort((a, b) => a[1].touchedAt - b[1].touchedAt)
      .slice(0, Math.ceil(MAX_ENTRIES / 10));
    for (const [victimKey] of victims) store.delete(victimKey);
  }
  store.set(key, {
    etag: res?.headers.get("etag") ?? store.get(key)?.etag ?? null,
    lastModified: res?.headers.get("last-modified") ?? store.get(key)?.lastModified ?? null,
    bodyHash,
    value,
    touchedAt: Date.now(),
  });
}

export function dropCache(key: string): void {
  store.delete(key);
}
