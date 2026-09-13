/**
 * Encrypted vault seed loader.
 *
 * The seed is NOT stored in the repository (that would publish the vault
 * ciphertexts to anyone who can read the code). It lives in the deployment
 * secret `VAULT_SEED_JSON`, and is decrypted with `VAULT_PASSPHRASE` the first
 * time a fresh deployment finds an empty vault table.
 *
 * Moving the project to another account therefore needs exactly two secrets:
 *   - VAULT_PASSPHRASE  (master passphrase)
 *   - VAULT_SEED_JSON   (bundle exported from admin panel → «الخزنة والأسرار»)
 *
 * Copyright (c) 2026 Eng. HASSAN MOHAMED. All rights reserved.
 */

import type { VaultBundle } from "./vault.server";

function isBundle(value: unknown): value is VaultBundle {
  if (!value || typeof value !== "object") return false;
  const bundle = value as Partial<VaultBundle>;
  return bundle.format === "dulms-vault" && Array.isArray(bundle.items);
}

/** Reads the encrypted seed bundle from the environment, or null when unset. */
export function loadVaultSeed(): VaultBundle | null {
  const raw = process.env["VAULT_SEED_JSON"];
  if (!raw || !raw.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isBundle(parsed)) {
      console.error("[vault] VAULT_SEED_JSON is not a dulms-vault bundle");
      return null;
    }
    return parsed;
  } catch (cause) {
    console.error(
      "[vault] VAULT_SEED_JSON is not valid JSON:",
      cause instanceof Error ? cause.message : cause,
    );
    return null;
  }
}
