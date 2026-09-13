/**
 * Rate limiting for the public DULMS sign-in endpoint.
 *
 * Every login attempt costs a live request to the university portal, so an
 * unthrottled endpoint lets an attacker credential-stuff DULMS through us and
 * burn our shared rate budget / IP reputation. We count recent failures per
 * caller IP *and* per student id, reusing the `admin_auth_attempts` audit table
 * with a namespaced identifier.
 */
import { requestIdentifier } from "@/server/admin/auth-guard.server";

const WINDOW_MINUTES = 10;
const MAX_FAILURES_PER_IP = 10;
const MAX_FAILURES_PER_ID = 5;

export const LOGIN_THROTTLED_MESSAGE = "محاولات دخول كثيرة — انتظر 10 دقائق ثم حاول مرة أخرى";

function ipKey() {
  return `dulms-login:ip:${requestIdentifier()}`;
}

function idKey(dulmsId: string) {
  return `dulms-login:id:${dulmsId.toLowerCase()}`;
}

async function failuresSince(identifier: string, limit: number): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("admin_auth_attempts")
    .select("success, attempted_at")
    .eq("identifier", identifier)
    .gte("attempted_at", since)
    .order("attempted_at", { ascending: false })
    .limit(limit + 5);
  if (error) throw error;
  let failures = 0;
  for (const row of data ?? []) {
    // A success inside the window resets the counter.
    if (row.success) break;
    failures += 1;
  }
  return failures;
}

/** True when the caller (or the targeted student id) is currently throttled. */
export async function isLoginThrottled(dulmsId: string): Promise<boolean> {
  try {
    const [byIp, byId] = await Promise.all([
      failuresSince(ipKey(), MAX_FAILURES_PER_IP),
      failuresSince(idKey(dulmsId), MAX_FAILURES_PER_ID),
    ]);
    return byIp >= MAX_FAILURES_PER_IP || byId >= MAX_FAILURES_PER_ID;
  } catch (cause) {
    // Fail open: a logging outage must not lock every student out.
    console.error("[login-throttle] check failed", cause);
    return false;
  }
}

/** Records the outcome of a login attempt for both counters. */
export async function recordLoginAttempt(dulmsId: string, success: boolean): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("admin_auth_attempts").insert([
      { identifier: ipKey(), success },
      { identifier: idKey(dulmsId), success },
    ]);
  } catch (cause) {
    console.error("[login-throttle] failed to record attempt", cause);
  }
}
