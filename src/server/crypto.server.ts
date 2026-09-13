import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

import { hydrateSecrets, secret } from "./vault.server";

/**
 * Credential encryption with a **database-resident** key ring.
 *
 * The keys live in `public.crypto_keyring` (service_role only), not in the
 * environment. That is deliberate: the database travels with the project, so
 * moving/remixing/redeploying the app can never again orphan the stored student
 * credentials. Environment secrets (`DULMS_CRED_SECRET`,
 * `DULMS_CRED_SECRET_V<n>`) are still honoured and are *imported* into the key
 * ring on first use, so an existing deployment keeps working unchanged.
 *
 * Every ciphertext is stamped with the key version it was produced with
 * (`dulms_accounts.key_version`), so rotation stays additive: add a new
 * version, then run the admin re-encryption job. Old keys stay readable until
 * every row has been migrated.
 */

export const MAX_KEY_VERSION = 16;

const CACHE_TTL_MS = 5 * 60_000;

/** version -> raw secret, loaded from the database (and env fallbacks). */
let keyring = new Map<number, string>();
let loadedAt = 0;
let loading: Promise<void> | null = null;

function envSecret(version: number): string | null {
  const versioned = secret(`DULMS_CRED_SECRET_V${version}`);
  if (versioned) return versioned;
  // The unversioned secret is what v1 rows were encrypted with.
  if (version === 1) return secret("DULMS_CRED_SECRET") ?? null;
  return null;
}

function envVersions(): Map<number, string> {
  const found = new Map<number, string>();
  for (let v = 1; v <= MAX_KEY_VERSION; v += 1) {
    const secret = envSecret(v);
    if (secret) found.set(v, secret);
  }
  return found;
}

async function loadKeyring(): Promise<void> {
  // The vault may hold keys the platform env lost during a project move.
  await hydrateSecrets();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const next = new Map<number, string>();

  const { data, error } = await supabaseAdmin
    .from("crypto_keyring")
    .select("version, secret")
    .order("version", { ascending: true });
  if (error) throw error;
  for (const row of data ?? []) next.set(row.version, row.secret);

  // Import any env-only key so the database becomes the durable source of truth.
  const pending: { version: number; secret: string; note: string }[] = [];
  for (const [version, secret] of envVersions()) {
    if (next.get(version) === secret) continue;
    if (next.has(version)) continue; // database wins; never overwrite a stored key
    next.set(version, secret);
    pending.push({ version, secret, note: "imported from environment" });
  }

  // Cold start with no key anywhere: mint one so the app is self-sufficient.
  if (next.size === 0) {
    const secret = randomBytes(48).toString("base64url");
    next.set(1, secret);
    pending.push({ version: 1, secret, note: "generated on first use" });
  }

  if (pending.length > 0 && !process.env["VITEST"]) {
    const { error: insertError } = await supabaseAdmin
      .from("crypto_keyring")
      .upsert(pending, { onConflict: "version", ignoreDuplicates: true });
    if (insertError) console.error("[crypto] keyring persist failed", insertError.message);
  }

  keyring = next;
  loadedAt = Date.now();
}

/**
 * Loads the key ring from the database. Call this once at the start of any
 * async server path before using the synchronous encrypt/decrypt helpers.
 */
export async function ensureKeyring(force = false): Promise<void> {
  if (!force && keyring.size > 0 && Date.now() - loadedAt < CACHE_TTL_MS) return;
  if (!loading) {
    loading = loadKeyring().finally(() => {
      loading = null;
    });
  }
  await loading;
}

/** Raw secret for a key version: database first, environment as fallback. */
function secretForVersion(version: number): string | null {
  return keyring.get(version) ?? envSecret(version);
}

/** Version used for freshly encrypted credentials. */
export function activeKeyVersion(): number {
  const raw = secret("DULMS_CRED_KEY_VERSION");
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isFinite(parsed) && parsed >= 1 && parsed <= MAX_KEY_VERSION) return parsed;
  const versions = availableKeyVersions();
  return versions.length > 0 ? versions[0]! : 1;
}

/** Key versions we hold a secret for, newest first. */
export function availableKeyVersions(): number[] {
  const versions: number[] = [];
  for (let v = MAX_KEY_VERSION; v >= 1; v -= 1) {
    if (secretForVersion(v)) versions.push(v);
  }
  return versions;
}

/** Non-secret view of the key ring, for the admin panel. */
export function keyringStatus(): { version: number; source: "database" | "environment" }[] {
  return availableKeyVersions().map((version) => ({
    version,
    source: keyring.has(version) ? ("database" as const) : ("environment" as const),
  }));
}

function key(version: number): Buffer {
  const raw = secretForVersion(version);
  if (!raw) throw new Error(`no credential key for version ${version}`);
  return createHash("sha256").update(raw).digest();
}

export function encryptSecret(plaintext: string, version = activeKeyVersion()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(version), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

function decryptWith(stored: string, version: number): string {
  const buf = Buffer.from(stored, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(version), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

/**
 * Decrypts a stored credential. Pass the row's `key_version` when known;
 * otherwise every available key is tried (newest first).
 */
export function decryptSecret(stored: string, version?: number | null): string {
  if (version) {
    try {
      return decryptWith(stored, version);
    } catch {
      // fall through to the exhaustive attempt below
    }
  }
  let lastError: unknown = new Error("no credential key configured");
  for (const candidate of availableKeyVersions()) {
    if (candidate === version) continue;
    try {
      return decryptWith(stored, candidate);
    } catch (cause) {
      lastError = cause;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("decryption failed");
}

/** Internal e-mail used for the backend account tied to a DULMS id. */
export function accountEmailFor(dulmsId: string): string {
  return `${dulmsId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")}@dulms.student`;
}

/**
 * Deterministic strong password derived server-side from the DULMS id.
 * Intentionally pinned to key version 1: it is the Supabase account password,
 * not stored ciphertext, so it must stay stable across rotations.
 */
export function derivedAccountPassword(dulmsId: string): string {
  const secret = secretForVersion(1);
  if (!secret) throw new Error("credential key v1 is not available");
  return `Dn1!${createHmac("sha256", secret).update(`account:${dulmsId.trim().toLowerCase()}`).digest("base64url").slice(0, 40)}`;
}
