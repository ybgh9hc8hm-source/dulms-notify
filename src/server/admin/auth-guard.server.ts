/** Rate limiting + audit logging around the admin panel password check. */
import { getRequest } from "@tanstack/react-start/server";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const TOO_MANY_ATTEMPTS_MESSAGE = "محاولات كثيرة جدًا — انتظر 15 دقيقة ثم حاول مرة أخرى";

/** Best-effort caller identity: client IP, falling back to a UA fingerprint. */
export function requestIdentifier(): string {
  try {
    const headers = getRequest().headers;
    const forwarded = headers.get("x-forwarded-for") ?? "";
    const ip =
      forwarded.split(",")[0]?.trim() ||
      headers.get("cf-connecting-ip") ||
      headers.get("x-real-ip") ||
      "";
    if (ip) return ip;
    const ua = headers.get("user-agent") ?? "";
    return ua ? `ua:${ua.slice(0, 120)}` : "unknown";
  } catch {
    return "unknown";
  }
}

function constantTimeMatch(
  createHash: typeof import("node:crypto").createHash,
  timingSafeEqual: typeof import("node:crypto").timingSafeEqual,
  a: string | null | undefined,
  b: string | null | undefined,
) {
  // Hashing first keeps the comparison constant-time; coercing guards against a
  // missing header/token reaching us as undefined and throwing inside crypto.
  return timingSafeEqual(
    createHash("sha256")
      .update(String(a ?? ""), "utf8")
      .digest(),
    createHash("sha256")
      .update(String(b ?? ""), "utf8")
      .digest(),
  );
}

async function recordAttempt(identifier: string, success: boolean) {
  if (process.env["VITEST"]) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("admin_auth_attempts").insert({ identifier, success });
    if (Math.random() < 0.02) {
      await supabaseAdmin
        .from("admin_auth_attempts")
        .delete()
        .lt("attempted_at", new Date(Date.now() - 7 * 24 * 3600_000).toISOString());
    }
  } catch (cause) {
    console.error("[admin-auth] failed to log attempt", cause);
  }
}

async function isLockedOut(identifier: string): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - LOCKOUT_MINUTES * 60_000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("admin_auth_attempts")
      .select("success, attempted_at")
      .eq("identifier", identifier)
      .gte("attempted_at", since)
      .order("attempted_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    let failures = 0;
    for (const row of data ?? []) {
      // A successful sign-in inside the window clears the counter.
      if (row.success) break;
      failures += 1;
    }
    return failures >= MAX_FAILED_ATTEMPTS;
  } catch (cause) {
    console.error("[admin-auth] lockout check failed", cause);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Durable credentials (DB-backed, survive env drift / project moves)  */
/* ------------------------------------------------------------------ */

type AdminCreds = { paths: string[]; passwords: string[] };

let credCache: { value: AdminCreds; at: number } | undefined;
const CRED_TTL_MS = 60_000;

/** Reads the persisted copy of the admin credentials from `app_settings`. */
async function dbCreds(): Promise<{ path: string | null; password: string | null }> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("app_settings")
      .select("key, value")
      .in("key", ["ADMIN_PANEL_PATH", "ADMIN_PANEL_PASSWORD"]);
    if (error) throw error;
    const map = new Map((data ?? []).map((row) => [row.key, String(row.value ?? "")]));
    return {
      path: map.get("ADMIN_PANEL_PATH")?.trim() || null,
      password: map.get("ADMIN_PANEL_PASSWORD")?.trim() || null,
    };
  } catch (cause) {
    console.error("[admin-auth] failed to read persisted credentials", cause);
    return { path: null, password: null };
  }
}

/** Mirrors the environment credentials into the database on first use so the
 * panel stays reachable after a project move that loses the env secrets. */
async function seedDbCreds(path: string, password: string) {
  // Tests use throwaway credentials; they must never be persisted.
  if (process.env["VITEST"]) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("app_settings").upsert(
      [
        { key: "ADMIN_PANEL_PATH", value: path },
        { key: "ADMIN_PANEL_PASSWORD", value: password },
      ],
      { onConflict: "key" },
    );
  } catch (cause) {
    console.error("[admin-auth] failed to persist credentials", cause);
  }
}

/** Every credential accepted right now: env value first, DB value as fallback. */
async function adminCredentials(): Promise<AdminCreds> {
  if (credCache && Date.now() - credCache.at < CRED_TTL_MS) return credCache.value;

  const { hydrateSecrets, secret } = await import("@/server/vault.server");
  await hydrateSecrets();
  const envPath = secret("ADMIN_PANEL_PATH")?.trim() || null;
  const envPassword = secret("ADMIN_PANEL_PASSWORD")?.trim() || null;
  const persisted = await dbCreds();

  if (envPath && envPassword && (!persisted.path || !persisted.password)) {
    await seedDbCreds(envPath, envPassword);
    persisted.path = persisted.path ?? envPath;
    persisted.password = persisted.password ?? envPassword;
  }

  const value: AdminCreds = {
    paths: [...new Set([envPath, persisted.path].filter((v): v is string => !!v))],
    passwords: [...new Set([envPassword, persisted.password].filter((v): v is string => !!v))],
  };
  credCache = { value, at: Date.now() };
  return value;
}

/* ------------------------------------------------------------------ */
/* Long-lived admin session tokens                                     */
/* ------------------------------------------------------------------ */

const ADMIN_TOKEN_PREFIX = "adm1.";

/** Sessions expire on their own: a stolen token (XSS, shared device, leaked
 * backup of localStorage) must not grant permanent admin access. */
const ADMIN_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

async function tokenHash(token: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(token).digest("hex");
}

/**
 * HMAC key derived from the admin path *and* the currently accepted passwords.
 * Binding the password in means rotating it revokes every outstanding session
 * (previously the key used the path alone, so a password change left old
 * tokens valid). Passwords are sorted so env/DB ordering never rotates the key
 * by accident.
 */
async function sessionKey(): Promise<Buffer | null> {
  const { paths, passwords } = await adminCredentials();
  const path = paths[0];
  if (!path || passwords.length === 0) return null;
  const { createHash } = await import("node:crypto");
  const passwordDigest = createHash("sha256")
    .update([...passwords].sort().join("\u0000"))
    .digest("hex");
  return createHash("sha256").update(`admin-session:v2|${path}|${passwordDigest}`).digest();
}

async function signature(issuedAt: string): Promise<string | null> {
  const secret = await sessionKey();
  if (!secret) return null;
  const { createHmac } = await import("node:crypto");
  return createHmac("sha256", secret).update(`admin-session:v2:${issuedAt}`).digest("base64url");
}

/** Mints a session token valid for ADMIN_SESSION_MAX_AGE_MS, or until the
 * admin logs out or the admin password/path changes. */
export async function mintAdminSessionToken(): Promise<string | null> {
  const issuedAt = Date.now().toString(36);
  const sig = await signature(issuedAt);
  if (!sig) return null;
  const token = `${ADMIN_TOKEN_PREFIX}${issuedAt}.${sig}`;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("admin_sessions").insert({
    token_hash: await tokenHash(token),
    identifier: requestIdentifier(),
    expires_at: new Date(Date.now() + ADMIN_SESSION_MAX_AGE_MS).toISOString(),
  });
  if (error) {
    console.error("[admin-auth] failed to persist session", error.message);
    return null;
  }
  return token;
}

/** Constant-time verification of a previously minted session token. */
export async function verifyAdminSessionToken(key: string, token: string): Promise<boolean> {
  const { paths } = await adminCredentials();
  if (paths.length === 0) return false;
  const { createHash, timingSafeEqual } = await import("node:crypto");
  if (!paths.some((p) => constantTimeMatch(createHash, timingSafeEqual, key, p))) return false;
  const [, issuedAt, sig] = token.split(".");
  if (!issuedAt || !sig) return false;
  const mintedAt = Number.parseInt(issuedAt, 36);
  if (!Number.isFinite(mintedAt)) return false;
  const age = Date.now() - mintedAt;
  // Reject expired tokens and tokens minted "in the future" (clock tampering).
  if (age < -60_000 || age > ADMIN_SESSION_MAX_AGE_MS) return false;
  const expected = await signature(issuedAt);
  if (!expected) return false;
  if (!constantTimeMatch(createHash, timingSafeEqual, sig, expected)) return false;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("admin_sessions")
    .select("expires_at, revoked_at")
    .eq("token_hash", await tokenHash(token))
    .maybeSingle();
  if (error || !data || data.revoked_at || Date.parse(data.expires_at) <= Date.now()) return false;
  return true;
}

export async function revokeAdminSessionToken(token: string): Promise<void> {
  if (!token.startsWith(ADMIN_TOKEN_PREFIX)) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("admin_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token_hash", await tokenHash(token));
}

export async function auditAdminAction(
  action: string,
  target?: string,
  detail?: Record<string, string | number | boolean | null>,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("admin_audit_log").insert({
    actor_identifier: requestIdentifier(),
    action: action.slice(0, 120),
    target: target?.slice(0, 200) ?? null,
    detail: detail ?? {},
  });
  if (error) console.error("[admin-audit] insert failed", error.message);
}

export type AdminAuthResult = { ok: true } | { ok: false; lockedOut: boolean; message: string };

/**
 * Constant-time credential check wrapped in a per-identifier rate limit
 * (max 5 failures / 15 minutes) with a full audit trail.
 */
export async function authorizeAdmin(key: string, password: string): Promise<AdminAuthResult> {
  // A session token is not a password attempt: it bypasses the login rate
  // limiter and the audit log, but never the signature check.
  if (password.startsWith(ADMIN_TOKEN_PREFIX)) {
    if (await verifyAdminSessionToken(key, password)) return { ok: true };
    return { ok: false, lockedOut: false, message: "انتهت الجلسة — سجّل الدخول مرة أخرى" };
  }

  const identifier = requestIdentifier();

  if (await isLockedOut(identifier)) {
    await recordAttempt(identifier, false);
    return { ok: false, lockedOut: true, message: TOO_MANY_ATTEMPTS_MESSAGE };
  }

  const { createHash, timingSafeEqual } = await import("node:crypto");
  const { paths, passwords } = await adminCredentials();
  const ok =
    paths.some((p) => constantTimeMatch(createHash, timingSafeEqual, key, p)) &&
    passwords.some((p) => constantTimeMatch(createHash, timingSafeEqual, password, p));

  await recordAttempt(identifier, ok);
  if (ok) return { ok: true };
  return { ok: false, lockedOut: false, message: "بيانات دخول غير صحيحة" };
}
