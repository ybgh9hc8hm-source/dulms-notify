/**
 * DULMS health telemetry.
 *
 * Every outbound request to the university portal is sampled here: status
 * code, latency, and any "the portal is unhappy" signal. These samples are the
 * evidence base for the rate-ceiling ramp test — without them we would be
 * raising the limit blind.
 *
 * Signals, in order of how early they appear when a server starts to strain:
 *   1. slow_response   — latency > 3x the rolling average (queueing pressure)
 *   2. session_evicted — an authenticated call bounced back to login.aspx
 *   3. http_error      — non-2xx/3xx status
 *   4. challenge_page  — CAPTCHA / WAF / explicit block content
 *   5. auth_failure    — a previously healthy account failed to sign in
 */

export type FlagReason =
  | "challenge_page"
  | "blocked"
  | "session_evicted"
  | "auth_failure"
  | "http_error"
  | "slow_response";

/** WAF / CAPTCHA / explicit throttle wording. Deliberately narrow to avoid
 *  false positives on ordinary Arabic error pages. */
const CHALLENGE_PATTERN =
  /(captcha|recaptcha|hcaptcha|cf-browser-verification|checking your browser|are you a human|ddos protection)/i;
const BLOCK_PATTERN =
  /(too many requests|rate limit exceeded|request throttled|access denied|you have been blocked|403 forbidden)/i;

/** Rolling latency mean, per worker instance. Used for the 3x slow check. */
let rollingMean = 0;
let rollingCount = 0;

function observeLatency(ms: number): boolean {
  const wasSlow = rollingCount >= 20 && rollingMean > 0 && ms > rollingMean * 3;
  rollingCount += 1;
  rollingMean += (ms - rollingMean) / Math.min(rollingCount, 200);
  return wasSlow;
}

function classifyBody(body: string, endpoint: string): FlagReason | null {
  if (CHALLENGE_PATTERN.test(body)) return "challenge_page";
  if (BLOCK_PATTERN.test(body)) return "blocked";
  // A signed-in call that comes back as the login shell means the portal threw
  // our session away — the classic IIS/ASP.NET response to being hammered.
  if (!/login\.aspx/i.test(endpoint) && /name="txtPass"/i.test(body)) return "session_evicted";
  return null;
}

export interface SampleInput {
  endpoint: string;
  statusCode: number | null;
  latencyMs: number;
  /** Response body, when cheaply available; scanned for challenge patterns. */
  body?: string | null;
  /** Explicit override (e.g. auth_failure detected by the caller). */
  reason?: FlagReason | null;
  detail?: Record<string, unknown>;
}

/** Normalises a URL down to a low-cardinality endpoint label. */
export function endpointLabel(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return url.split("?")[0]?.toLowerCase() ?? "unknown";
  }
}

export async function recordHealthSample(input: SampleInput): Promise<void> {
  try {
    const slow = observeLatency(input.latencyMs);
    let reason: FlagReason | null = input.reason ?? null;
    if (!reason && input.body) reason = classifyBody(input.body, input.endpoint);
    if (
      !reason &&
      input.statusCode !== null &&
      (input.statusCode >= 400 || input.statusCode === 0)
    ) {
      reason = "http_error";
    }
    if (!reason && input.statusCode === null) reason = "http_error";
    if (!reason && slow) reason = "slow_response";

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin.from("dulms_health_samples").insert({
      endpoint: input.endpoint,
      status_code: input.statusCode,
      latency_ms: Math.round(input.latencyMs),
      flagged_reason: reason,
      detail: (input.detail ?? {}) as never,
    });
  } catch {
    /* telemetry must never break a sync */
  }
}
