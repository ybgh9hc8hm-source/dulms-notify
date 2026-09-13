/**
 * Portable secret vault.
 *
 * Problem it solves: moving this project to another hosting account (or a
 * fresh deploy from git) used to mean re-entering ~10 secrets by hand, and
 * losing the credential encryption key meant every student had to sign in
 * again. Now every secret lives **encrypted inside the project's own
 * database**, locked with one master passphrase of the operator's choosing.
 *
 * After a move you set exactly one secret — `VAULT_PASSPHRASE` — and the
 * backend decrypts everything else (bot tokens, API keys, admin password,
 * credential encryption keys) on the first request.
 *
 * Crypto: PBKDF2-SHA256 (200k) → 32-byte key → AES-256-GCM per value.
 * The passphrase itself is never stored; only a verifier HMAC is.
 */

import { createDecipheriv, createCipheriv, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";

// Cloudflare Workers (workerd) rejects PBKDF2 above 100k iterations, so this
// is the ceiling the runtime allows. Older vaults labelled 200000 are still
// read correctly when the runtime supports them (see iterationsFor).
const ITERATIONS = 100_000;
const KDF = `pbkdf2-sha256-${ITERATIONS}`;
const VERIFY_MESSAGE = "dulms-vault-verify:v1";
const CACHE_TTL_MS = 5 * 60_000;

/** Every secret the backend may need. Used for sweeping env → vault and for
 * the operator inventory in the admin panel. */
export const MANAGED_SECRETS: { name: string; note: string; critical: boolean }[] = [
  { name: "TELEGRAM_BOT_TOKEN", note: "بوت الإشعارات الأساسي", critical: true },
  { name: "SUPPORT_BOT_TOKEN", note: "بوت الدعم والمساعد الذكي", critical: true },
  { name: "OPENROUTER_API_KEY", note: "مفتاح نماذج الذكاء الاصطناعي", critical: true },
  { name: "ADMIN_PANEL_PATH", note: "المسار السري للوحة الإدارة", critical: true },
  { name: "ADMIN_PANEL_PASSWORD", note: "كلمة مرور لوحة الإدارة", critical: true },
  { name: "DULMS_CRED_SECRET", note: "مفتاح تشفير بيانات الطلاب v1", critical: true },
  { name: "DULMS_CRED_SECRET_V2", note: "مفتاح تشفير بيانات الطلاب v2", critical: true },
  { name: "DULMS_CRED_KEY_VERSION", note: "رقم المفتاح المستخدم للتشفير الجديد", critical: false },
  { name: "APP_PUBLIC_URL", note: "رابط الموقع المنشور (روابط البوت)", critical: false },
  { name: "DULMS_SERVICE_ROLE_KEY", note: "نسخة احتياطية من مفتاح Supabase", critical: false },
  { name: "DULMS_RATE_LIMIT_PER_MINUTE", note: "سقف الطلبات على بوابة دالمز", critical: false },
  { name: "DULMS_FULL_PULL_COST", note: "تكلفة السحب الكامل بالطلبات", critical: false },
  { name: "DULMS_SESSION_TTL_MINUTES", note: "عمر جلسة دالمز", critical: false },
  { name: "DULMS_REQUEST_JITTER_MS", note: "تشويش زمن الطلبات", critical: false },
  { name: "MONITORING_TIMEZONE", note: "المنطقة الزمنية للمراقبة", critical: false },
  { name: "ACTIVE_HOURS", note: "ساعات العمل النشطة", critical: false },
  { name: "PEAK_HOURS", note: "ساعات الذروة", critical: false },
  { name: "SUPPORT_DAILY_LIMIT", note: "حد رسائل المساعد يوميًا", critical: false },
  { name: "SUPPORT_TICKET_LIMIT", note: "حد تذاكر الدعم اليومي", critical: false },
];

/** Secrets that must stay in the platform env — they are needed *before* the
 * vault can be opened (they are how we reach the database at all). */
export const BOOTSTRAP_SECRETS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "VAULT_PASSPHRASE",
];

type VaultRow = { name: string; ciphertext: string; note: string | null };

let overlay = new Map<string, string>();
let overlayAt = 0;
let lastError: string | null = null;
let hydrating: Promise<void> | null = null;

/* ------------------------------------------------------------------ */
/* Crypto primitives                                                   */
/* ------------------------------------------------------------------ */

function iterationsFor(kdf?: string | null): number {
  const parsed = Number(/pbkdf2-sha256-(\d+)/.exec(kdf ?? "")?.[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : ITERATIONS;
}

function deriveKey(passphrase: string, saltB64: string, kdf?: string | null): Buffer {
  return pbkdf2Sync(
    passphrase.normalize("NFKC"),
    Buffer.from(saltB64, "base64"),
    iterationsFor(kdf),
    32,
    "sha256",
  );
}

function verifierFor(key: Buffer): string {
  return createHmac("sha256", key).update(VERIFY_MESSAGE).digest("base64");
}

function encrypt(key: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

function decrypt(key: Buffer, stored: string): string {
  const buf = Buffer.from(stored, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

/* ------------------------------------------------------------------ */
/* Meta                                                                */
/* ------------------------------------------------------------------ */

type Meta = { salt: string; verifier: string; kdf: string };

async function readMeta(): Promise<Meta | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("vault_meta")
    .select("salt, verifier, kdf")
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function writeMeta(meta: Meta): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("vault_meta")
    .upsert({ id: true, ...meta, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) throw error;
}

/** Passphrase supplied by the platform env, if any. */
function envPassphrase(): string | null {
  const value = process.env["VAULT_PASSPHRASE"];
  return value && value.trim().length > 0 ? value.trim() : null;
}

/** Derives + verifies the master key. Throws with a human message on failure. */
async function openKey(passphrase: string): Promise<{ key: Buffer; meta: Meta }> {
  const meta = await readMeta();
  if (!meta) throw new Error("الخزنة غير مهيأة بعد");
  const key = deriveKey(passphrase, meta.salt, meta.kdf);
  if (verifierFor(key) !== meta.verifier) throw new Error("كلمة سر الخزنة غير صحيحة");
  return { key, meta };
}

/* ------------------------------------------------------------------ */
/* Public API — reading                                                */
/* ------------------------------------------------------------------ */

async function loadOverlay(): Promise<void> {
  lastError = null;
  const passphrase = envPassphrase();
  if (!passphrase) {
    overlay = new Map();
    overlayAt = Date.now();
    return;
  }
  try {
    await adoptSeedIfEmpty(passphrase);
    const { key } = await openKey(passphrase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("project_vault")
      .select("name, ciphertext, note");
    if (error) throw error;

    const next = new Map<string, string>();
    for (const row of (data ?? []) as VaultRow[]) {
      try {
        next.set(row.name, decrypt(key, row.ciphertext));
      } catch {
        console.error(`[vault] could not decrypt ${row.name}`);
      }
    }
    overlay = next;
    overlayAt = Date.now();

    // Fill any env slot the platform does not provide, so untouched modules
    // that still read process.env keep working after a project move.
    for (const [name, value] of next) {
      if (!process.env[name]) {
        try {
          process.env[name] = value;
        } catch {
          /* read-only env in some runtimes; the overlay still serves callers */
        }
      }
    }
    await restoreKeyring(next);
    await captureMissing(key, next);
  } catch (cause) {
    lastError = cause instanceof Error ? cause.message : String(cause);
    console.error("[vault] hydrate failed:", lastError);
    overlayAt = Date.now();
  }
}

/**
 * Two-way durability: anything the running project created *after* the vault
 * was set up (a rotated admin password, a new credential key version, the cron
 * secret) is written back into the vault, so the vault is never a stale
 * snapshot of the project.
 */
let capturedAt = 0;
async function captureMissing(key: Buffer, current: Map<string, string>): Promise<void> {
  // Never let a test run write its throwaway credentials into the real vault.
  if (process.env["VITEST"]) return;
  if (Date.now() - capturedAt < 10 * 60_000) return;
  capturedAt = Date.now();
  try {
    const live = await collectCurrentSecrets();
    const rows = [...live.entries()]
      .filter(([name, value]) => current.get(name) !== value)
      .map(([name, value]) => ({
        name,
        ciphertext: encrypt(key, value),
        note: noteFor(name) ?? "captured automatically",
        updated_at: new Date().toISOString(),
      }));
    if (rows.length === 0) return;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("project_vault")
      .upsert(rows, { onConflict: "name" });
    if (error) throw error;
    for (const row of rows) overlay.set(row.name, live.get(row.name)!);
    console.info(
      `[vault] captured ${rows.length} new/changed secret(s): ${rows.map((r) => r.name).join(", ")}`,
    );
  } catch (cause) {
    console.error("[vault] capture failed:", cause instanceof Error ? cause.message : cause);
  }
}

/** Re-seeds `crypto_keyring` from vault copies so student credentials stay
 * readable even if the database was restored without that table. */
/**
 * Fresh deployment rescue: an encrypted seed of
 * the vault in the `VAULT_SEED_JSON` secret. When the database has no vault yet — i.e. the
 * project was moved to another account and got an empty database — the seed is
 * imported automatically using `VAULT_PASSPHRASE`, so every secret comes back
 * without a single manual entry.
 */
async function adoptSeedIfEmpty(passphrase: string): Promise<void> {
  const { loadVaultSeed } = await import("./vault-seed");
  const VAULT_SEED = loadVaultSeed();
  if (!VAULT_SEED) return;
  const meta = await readMeta().catch(() => null);
  if (meta) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("project_vault")
      .select("name", { count: "exact", head: true });
    if ((count ?? 0) > 0) return;
  }
  try {
    const { restored } = await importBundle(VAULT_SEED, passphrase);
    console.info(`[vault] restored ${restored} secrets from the encrypted seed`);
  } catch (cause) {
    console.error("[vault] seed restore failed:", cause instanceof Error ? cause.message : cause);
  }
}

async function restoreKeyring(values: Map<string, string>): Promise<void> {
  const rows: { version: number; secret: string; note: string }[] = [];
  for (const [name, secret] of values) {
    const match = /^DULMS_CRED_SECRET(?:_V(\d+))?$/.exec(name);
    if (!match) continue;
    rows.push({
      version: match[1] ? Number(match[1]) : 1,
      secret,
      note: "restored from vault",
    });
  }
  if (rows.length === 0) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("crypto_keyring")
    .upsert(rows, { onConflict: "version", ignoreDuplicates: true });
}

/** Loads the vault into memory (cheap after the first call per isolate). */
export async function hydrateSecrets(force = false): Promise<void> {
  if (!force && overlayAt > 0 && Date.now() - overlayAt < CACHE_TTL_MS) return;
  if (!hydrating) {
    hydrating = loadOverlay().finally(() => {
      hydrating = null;
    });
  }
  await hydrating;
}

/**
 * Synchronous secret read: platform env wins, vault fills the gaps.
 * Call `await hydrateSecrets()` once on the async path before using it.
 */
export function secret(name: string): string | undefined {
  return process.env[name] ?? overlay.get(name);
}

/** Convenience: hydrate + read in one await. */
export async function getSecret(name: string): Promise<string | undefined> {
  await hydrateSecrets();
  return secret(name);
}

/* ------------------------------------------------------------------ */
/* Public API — administration                                         */
/* ------------------------------------------------------------------ */

export type VaultStatus = {
  configured: boolean;
  passphraseSet: boolean;
  unlocked: boolean;
  error: string | null;
  items: {
    name: string;
    note: string | null;
    inVault: boolean;
    inEnv: boolean;
    critical: boolean;
    preview: string | null;
    updatedAt: string | null;
  }[];
};

function mask(value: string | undefined): string | null {
  if (!value) return null;
  if (value.length <= 8) return `${value.slice(0, 2)}••••`;
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export async function vaultStatus(): Promise<VaultStatus> {
  const meta = await readMeta().catch(() => null);
  await hydrateSecrets(true);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("project_vault").select("name, note, updated_at");
  const stored = new Map((data ?? []).map((r) => [r.name, r]));

  const names = [...new Set([...MANAGED_SECRETS.map((s) => s.name), ...stored.keys()])];
  const items = names.map((name) => {
    const managed = MANAGED_SECRETS.find((s) => s.name === name);
    const row = stored.get(name);
    return {
      name,
      note: row?.note ?? managed?.note ?? null,
      inVault: Boolean(row),
      inEnv: Boolean(process.env[name]),
      critical: managed?.critical ?? false,
      preview: mask(secret(name)),
      updatedAt: row?.updated_at ?? null,
    };
  });

  return {
    configured: Boolean(meta),
    passphraseSet: Boolean(envPassphrase()),
    unlocked: overlay.size > 0 || (Boolean(meta) && Boolean(envPassphrase()) && !lastError),
    error: lastError,
    items: items.sort(
      (a, b) => Number(b.critical) - Number(a.critical) || a.name.localeCompare(b.name),
    ),
  };
}

/**
 * Creates the vault with a master passphrase (or re-keys an existing one).
 * Everything currently readable — env secrets, the credential key ring and the
 * persisted admin credentials — is swept in, so one call captures the whole
 * project state.
 */
export async function initVault(
  passphrase: string,
  currentPassphrase?: string,
): Promise<{ stored: number }> {
  const trimmed = passphrase.trim();
  if (trimmed.length < 10) throw new Error("اختر كلمة سر لا تقل عن 10 حروف");

  const meta = await readMeta();
  const existing = new Map<string, { value: string; note: string | null }>();

  if (meta) {
    // Re-key: decrypt with the old passphrase first so nothing is lost.
    const old = (currentPassphrase ?? envPassphrase() ?? "").trim();
    if (!old) throw new Error("الخزنة موجودة بالفعل — اكتب كلمة السر الحالية لتغييرها");
    const { key } = await openKey(old);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("project_vault").select("name, ciphertext, note");
    for (const row of (data ?? []) as VaultRow[]) {
      try {
        existing.set(row.name, { value: decrypt(key, row.ciphertext), note: row.note });
      } catch {
        console.error(`[vault] re-key skipped ${row.name}`);
      }
    }
  }

  const salt = randomBytes(16).toString("base64");
  const key = deriveKey(trimmed, salt, KDF);
  await writeMeta({ salt, verifier: verifierFor(key), kdf: KDF });

  const sweep = await collectCurrentSecrets();
  for (const [name, value] of sweep) {
    if (!existing.has(name)) existing.set(name, { value, note: noteFor(name) });
  }

  const rows = [...existing.entries()].map(([name, item]) => ({
    name,
    ciphertext: encrypt(key, item.value),
    note: item.note ?? noteFor(name),
    updated_at: new Date().toISOString(),
  }));

  if (rows.length > 0) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("project_vault")
      .upsert(rows, { onConflict: "name" });
    if (error) throw error;
  }

  overlayAt = 0;
  return { stored: rows.length };
}

function noteFor(name: string): string | null {
  return MANAGED_SECRETS.find((s) => s.name === name)?.note ?? null;
}

/** Everything the running deployment can see right now. */
async function collectCurrentSecrets(): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (const { name } of MANAGED_SECRETS) {
    const value = process.env[name];
    if (value) found.set(name, value);
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Admin credentials persisted by the panel.
  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("key, value")
    .in("key", ["ADMIN_PANEL_PATH", "ADMIN_PANEL_PASSWORD", "cron_secret"]);
  for (const row of settings ?? []) {
    if (row.value && !found.has(row.key)) found.set(row.key, row.value);
  }

  // Credential encryption keys (the ones that decrypt student passwords).
  const { data: keys } = await supabaseAdmin.from("crypto_keyring").select("version, secret");
  for (const row of keys ?? []) {
    const name = row.version === 1 ? "DULMS_CRED_SECRET" : `DULMS_CRED_SECRET_V${row.version}`;
    found.set(name, row.secret);
  }

  return found;
}

/** Adds or replaces one secret. */
export async function setVaultSecret(name: string, value: string, note?: string): Promise<void> {
  const passphrase = envPassphrase();
  if (!passphrase) throw new Error("VAULT_PASSPHRASE غير مضبوط — لا يمكن الكتابة في الخزنة");
  const { key } = await openKey(passphrase);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("project_vault").upsert(
    {
      name: name.trim(),
      ciphertext: encrypt(key, value),
      note: note ?? noteFor(name),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "name" },
  );
  if (error) throw error;
  overlayAt = 0;
}

export async function deleteVaultSecret(name: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("project_vault").delete().eq("name", name);
  if (error) throw error;
  overlayAt = 0;
}

/** Sweeps anything visible in the environment into the vault (idempotent). */
export async function syncFromEnvironment(): Promise<{ added: number; names: string[] }> {
  const passphrase = envPassphrase();
  if (!passphrase) throw new Error("VAULT_PASSPHRASE غير مضبوط");
  const { key } = await openKey(passphrase);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("project_vault").select("name");
  const known = new Set((data ?? []).map((r) => r.name));

  const current = await collectCurrentSecrets();
  const rows = [...current.entries()]
    .filter(([name]) => !known.has(name))
    .map(([name, value]) => ({
      name,
      ciphertext: encrypt(key, value),
      note: noteFor(name),
      updated_at: new Date().toISOString(),
    }));

  if (rows.length > 0) {
    const { error } = await supabaseAdmin
      .from("project_vault")
      .upsert(rows, { onConflict: "name" });
    if (error) throw error;
    overlayAt = 0;
  }
  return { added: rows.length, names: rows.map((r) => r.name) };
}

/* ------------------------------------------------------------------ */
/* Backup bundle — the thing you carry to a new project                */
/* ------------------------------------------------------------------ */

export type VaultBundle = {
  format: "dulms-vault";
  version: 1;
  createdAt: string;
  kdf: string;
  salt: string;
  verifier: string;
  items: { name: string; ciphertext: string; note: string | null }[];
};

/** Encrypted, self-contained backup. Safe to commit to a private git repo:
 * without the master passphrase it is unreadable. */
export async function exportBundle(): Promise<VaultBundle> {
  const meta = await readMeta();
  if (!meta) throw new Error("الخزنة غير مهيأة بعد");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("project_vault")
    .select("name, ciphertext, note")
    .order("name");
  if (error) throw error;
  return {
    format: "dulms-vault",
    version: 1,
    createdAt: new Date().toISOString(),
    kdf: meta.kdf,
    salt: meta.salt,
    verifier: meta.verifier,
    items: (data ?? []) as VaultBundle["items"],
  };
}

/** Restores a bundle. The passphrase is verified against the bundle itself
 * before anything is written, so a wrong password cannot corrupt the project. */
export async function importBundle(
  bundle: unknown,
  passphrase: string,
): Promise<{ restored: number }> {
  const parsed = bundle as VaultBundle;
  if (!parsed || parsed.format !== "dulms-vault" || !parsed.salt || !parsed.verifier) {
    throw new Error("ملف النسخة الاحتياطية غير صالح");
  }
  const key = deriveKey(passphrase.trim(), parsed.salt, parsed.kdf);
  if (verifierFor(key) !== parsed.verifier) throw new Error("كلمة سر الخزنة غير صحيحة");

  // Sanity check: every item must decrypt before we touch the database.
  const values = new Map<string, string>();
  for (const item of parsed.items ?? []) values.set(item.name, decrypt(key, item.ciphertext));

  await writeMeta({ salt: parsed.salt, verifier: parsed.verifier, kdf: parsed.kdf ?? KDF });
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rows = (parsed.items ?? []).map((item) => ({
    name: item.name,
    ciphertext: item.ciphertext,
    note: item.note ?? noteFor(item.name),
    updated_at: new Date().toISOString(),
  }));
  if (rows.length > 0) {
    const { error } = await supabaseAdmin
      .from("project_vault")
      .upsert(rows, { onConflict: "name" });
    if (error) throw error;
  }
  await restoreKeyring(values);
  overlayAt = 0;
  return { restored: rows.length };
}
