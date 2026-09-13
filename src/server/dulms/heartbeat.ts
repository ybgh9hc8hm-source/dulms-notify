/**
 * Lightweight heartbeat: "did anything change for this student?"
 *
 * The full scrape costs ~48 requests. DULMS also exposes a single notification
 * feed endpoint that moves whenever anything meaningful happens, so we poll
 * only that one and compare a fingerprint of the returned rows against the one
 * stored on the account.
 *
 * Cost: 1 request with a warm session, 3 when we have to sign in first.
 */
import { BASE, DulmsAuthError } from "./http";
import { dropSession, getDulmsSession } from "./session";
import type { Jar } from "./http";
import type { NotificationRow } from "./row-types";
import { recordHealthSample } from "./health";
import {
  cacheKey,
  conditionalHeaders,
  dropCache,
  hashBody,
  readCache,
  writeCache,
} from "./conditional";

const NOTIFICATIONS_PATH = "/Notifications/GetNotifications";
const NOTIFICATIONS_BODY = { Period: "Week", DateFrom: "", DateTo: "", IsSeen: -1 };

export interface HeartbeatResult {
  changed: boolean;
  signature: string;
  /** HTTP requests actually spent against DULMS. */
  cost: number;
  /** Raw feed rows (id / date / PageUrl only are ever used). */
  rows: NotificationRow[];
  /** Highest NotificationId currently in the feed. */
  maxNotificationId: number | null;
}

class SessionRejected extends Error {}

/** Feed summary we can rebuild without re-parsing an unchanged body. */
interface FeedSummary {
  signature: string;
  maxNotificationId: number | null;
}

type FetchOutcome =
  | { kind: "rows"; rows: NotificationRow[]; bodyHash: string; res: Response }
  | { kind: "unchanged"; summary: FeedSummary };

async function fetchNotifications(
  jar: Jar,
  dulmsId: string,
  previousSignature: string | null,
  allowConditional: boolean,
): Promise<FetchOutcome> {
  const key = cacheKey(dulmsId, NOTIFICATIONS_PATH);
  const startedAt = Date.now();
  const res = await fetch(new URL(NOTIFICATIONS_PATH, BASE).toString(), {
    method: "POST",
    redirect: "manual",
    headers: {
      ...jar.clientHeaders(),
      cookie: jar.header(),
      "content-type": "application/json; charset=utf-8",
      "x-requested-with": "XMLHttpRequest",
      accept: "application/json, text/javascript, */*; q=0.01",
      ...(allowConditional ? conditionalHeaders(key) : {}),
    },
    body: JSON.stringify(NOTIFICATIONS_BODY),
  });

  // A stale cookie sends us back to login: either a 30x to login.aspx or a
  // 200 that is the login HTML shell instead of JSON.
  const latencyMs = Date.now() - startedAt;
  const location = res.headers.get("location") ?? "";

  // Conditional hit: no body, no parse, no fingerprint. Only trusted when the
  // cached summary still matches the signature stored on the account.
  if (res.status === 304) {
    void recordHealthSample({
      endpoint: NOTIFICATIONS_PATH,
      statusCode: 304,
      latencyMs,
    });
    const cached = readCache<FeedSummary>(key);
    if (cached && cached.value.signature === previousSignature) {
      return { kind: "unchanged", summary: cached.value };
    }
    // Cache is cold or disagrees with the database: retry unconditionally.
    return fetchNotifications(jar, dulmsId, previousSignature, false);
  }

  if (res.status >= 300 && res.status < 400) {
    void recordHealthSample({
      endpoint: NOTIFICATIONS_PATH,
      statusCode: res.status,
      latencyMs,
      reason: "session_evicted",
      detail: { location },
    });
    throw new SessionRejected();
  }
  if (res.status === 401 || res.status === 403) {
    void recordHealthSample({
      endpoint: NOTIFICATIONS_PATH,
      statusCode: res.status,
      latencyMs,
      reason: "session_evicted",
    });
    throw new SessionRejected();
  }
  const text = await res.text();
  void recordHealthSample({
    endpoint: NOTIFICATIONS_PATH,
    statusCode: res.status,
    latencyMs,
    body: text.slice(0, 4000),
  });
  if (/name="txtPass"|login\.aspx/i.test(text)) throw new SessionRejected();
  if (!res.ok) throw new Error(`DULMS notifications endpoint returned ${res.status}`);

  // Delta-only parsing: an identical body hash means an identical feed, so the
  // JSON parse and the per-row fingerprint are both skipped.
  const bodyHash = hashBody(text);
  const cached = readCache<FeedSummary>(key);
  if (cached && cached.bodyHash === bodyHash && cached.value.signature === previousSignature) {
    return { kind: "unchanged", summary: cached.value };
  }

  if (!text.trim()) return { kind: "rows", rows: [], bodyHash, res };
  try {
    const parsed: unknown = JSON.parse(text);
    return {
      kind: "rows",
      rows: Array.isArray(parsed) ? (parsed as NotificationRow[]) : [],
      bodyHash,
      res,
    };
  } catch {
    throw new SessionRejected();
  }
}

/** Stable fingerprint of the feed: count + every id/date pair, hashed. */
function signatureOf(rows: NotificationRow[]): string {
  const parts = rows
    .map((row) => {
      const r = row as unknown as Record<string, unknown>;
      const id = r["NotificationId"] ?? r["Notification_Id"] ?? r["Id"] ?? "";
      const date = r["NotifyDate"] ?? r["Date"] ?? r["CreatedDate"] ?? "";
      // IsSeen / countdown fields are deliberately excluded: they move on read
      // state alone and used to produce phantom changes.
      return `${String(id)}|${String(date)}`;
    })
    .sort();
  // FNV-1a — cheap, dependency free, plenty for change detection.
  let hash = 0x811c9dc5;
  const payload = `${parts.length}#${parts.join(";")}`;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${parts.length}-${hash.toString(16)}`;
}

/**
 * Polls the notification feed and compares it with `previousSignature`.
 * Returns `changed: true` when the feed moved (or when we have no baseline).
 */
export async function checkForChanges(
  dulmsId: string,
  password: string,
  previousSignature: string | null,
): Promise<HeartbeatResult> {
  let cost = 0;
  let session = await getDulmsSession(dulmsId, password);
  cost += session.cost;

  let outcome: FetchOutcome;
  try {
    cost += 1;
    outcome = await fetchNotifications(session.jar, dulmsId, previousSignature, true);
  } catch (cause) {
    if (!(cause instanceof SessionRejected)) throw cause;
    // Cached cookies were rejected → sign in again once and retry.
    await dropSession(dulmsId);
    dropCache(cacheKey(dulmsId, NOTIFICATIONS_PATH));
    session = await getDulmsSession(dulmsId, password, true);
    cost += session.cost;
    cost += 1;
    try {
      outcome = await fetchNotifications(session.jar, dulmsId, previousSignature, false);
    } catch (retryCause) {
      if (retryCause instanceof SessionRejected) {
        throw new DulmsAuthError("تعذّر تسجيل الدخول على DULMS، جرّب تحديث بياناتك");
      }
      throw retryCause;
    }
  }

  // Unchanged body (304 or identical hash): reuse the cached summary, no parse.
  if (outcome.kind === "unchanged") {
    return {
      changed: false,
      signature: outcome.summary.signature,
      cost,
      rows: [],
      maxNotificationId: outcome.summary.maxNotificationId,
    };
  }

  const rows = outcome.rows;
  const signature = signatureOf(rows);
  const summary: FeedSummary = { signature, maxNotificationId: maxNotificationId(rows) };
  writeCache(cacheKey(dulmsId, NOTIFICATIONS_PATH), summary, outcome.bodyHash, outcome.res);

  return {
    changed: previousSignature === null || signature !== previousSignature,
    signature,
    cost,
    rows,
    maxNotificationId: summary.maxNotificationId,
  };
}

/** Highest NotificationId in the feed, or null when the feed is empty. */
function maxNotificationId(rows: NotificationRow[]): number | null {
  let max: number | null = null;
  for (const row of rows) {
    const id = Number((row as unknown as Record<string, unknown>)["NotificationId"]);
    if (Number.isFinite(id) && (max === null || id > max)) max = id;
  }
  return max;
}
