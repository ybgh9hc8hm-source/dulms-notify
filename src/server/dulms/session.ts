/**
 * DULMS session cache.
 *
 * Signing in costs two HTTP requests (GET login page + POST credentials) and,
 * before this cache existed, every scrape and every single file download paid
 * that price again. The portal's session cookie stays valid for a while, so we
 * keep the serialized cookie jar per `dulms_id` in `dulms_sessions` and reuse
 * it until it is rejected or expires.
 *
 * Lifetime is deliberately conservative (20 min default) because ASP.NET's
 * default forms/session timeout is 20 minutes; override with
 * `DULMS_SESSION_TTL_MINUTES`.
 */
import { Jar, loginToDulms } from "./http";

function sessionTtlMinutes(): number {
  const raw = Number(process.env["DULMS_SESSION_TTL_MINUTES"]);
  return Number.isFinite(raw) && raw > 0 ? raw : 20;
}

export interface DulmsSession {
  jar: Jar;
  /** How many HTTP requests this session cost to obtain (0 warm, 2 cold). */
  cost: number;
  fresh: boolean;
}

/** Cached jar for this student, or null when nothing usable is stored. */
async function loadCachedSession(dulmsId: string): Promise<Jar | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("dulms_sessions")
      .select("cookie_data, expires_at")
      .eq("dulms_id", dulmsId)
      .maybeSingle();
    if (!data) return null;
    if (new Date(data.expires_at).getTime() <= Date.now()) return null;
    const jar = Jar.deserialize(data.cookie_data, dulmsId);
    return jar.size > 0 ? jar : null;
  } catch {
    return null;
  }
}

async function storeSession(dulmsId: string, jar: Jar): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date();
    await supabaseAdmin.from("dulms_sessions").upsert(
      {
        dulms_id: dulmsId,
        cookie_data: jar.serialize(),
        created_at: now.toISOString(),
        last_used_at: now.toISOString(),
        expires_at: new Date(now.getTime() + sessionTtlMinutes() * 60_000).toISOString(),
      },
      { onConflict: "dulms_id" },
    );
  } catch {
    /* the cache is an optimisation; never fail a sync because of it */
  }
}

async function touchSession(dulmsId: string): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date();
    // Sliding expiry: the portal keeps a session alive as long as it is used,
    // so a cached jar we just used should not expire 20 minutes after *login*.
    await supabaseAdmin
      .from("dulms_sessions")
      .update({
        last_used_at: now.toISOString(),
        expires_at: new Date(now.getTime() + sessionTtlMinutes() * 60_000).toISOString(),
      })
      .eq("dulms_id", dulmsId);
  } catch {
    /* ignore */
  }
}

export async function dropSession(dulmsId: string): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("dulms_sessions").delete().eq("dulms_id", dulmsId);
  } catch {
    /* ignore */
  }
}

/**
 * Returns a usable session, reusing the cached cookies when possible.
 * `forceFresh` is used by callers that just had a cached session rejected.
 */
export async function getDulmsSession(
  dulmsId: string,
  password: string,
  forceFresh = false,
): Promise<DulmsSession> {
  if (!forceFresh) {
    const cached = await loadCachedSession(dulmsId);
    if (cached) {
      // Awaited on purpose: an unawaited write can be cancelled when the
      // worker request finishes, which silently defeated the sliding expiry.
      await touchSession(dulmsId);

      return { jar: cached, cost: 0, fresh: false };
    }
  }
  const { jar } = await loginToDulms(dulmsId, password);
  await storeSession(dulmsId, jar);
  return { jar, cost: 2, fresh: true };
}
