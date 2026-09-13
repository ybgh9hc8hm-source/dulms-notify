/**
 * Admin-only control surface for the portable secret vault.
 *
 * Everything here is gated behind the admin panel credentials; the master
 * passphrase itself is never returned to the browser.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const gate = z.object({
  key: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(300),
});

async function authorize(key: string, password: string) {
  const { authorizeAdmin } = await import("@/server/admin/auth-guard.server");
  return (await authorizeAdmin(key, password)).ok;
}

function fail(cause: unknown) {
  return { ok: false as const, message: cause instanceof Error ? cause.message : "حدث خطأ" };
}

/** Vault health + inventory of every secret the project needs. */
export const vaultOverview = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => gate.parse(input))
  .handler(async ({ data }) => {
    if (!(await authorize(data.key, data.password)))
      return { ok: false as const, message: "غير مصرح" };
    try {
      const { vaultStatus, BOOTSTRAP_SECRETS } = await import("@/server/vault.server");
      return { ok: true as const, status: await vaultStatus(), bootstrap: BOOTSTRAP_SECRETS };
    } catch (cause) {
      return fail(cause);
    }
  });

/** Creates the vault (or changes its master passphrase) and sweeps everything in. */
export const vaultInit = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    gate
      .extend({
        passphrase: z.string().min(10).max(300),
        currentPassphrase: z.string().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (!(await authorize(data.key, data.password)))
      return { ok: false as const, message: "غير مصرح" };
    try {
      const { initVault } = await import("@/server/vault.server");
      const { stored } = await initVault(data.passphrase, data.currentPassphrase);
      return {
        ok: true as const,
        message: `تم تجهيز الخزنة وحفظ ${stored} سر — اضبط VAULT_PASSPHRASE بنفس كلمة السر`,
      };
    } catch (cause) {
      return fail(cause);
    }
  });

/** Adds or replaces one secret inside the vault. */
export const vaultSetSecret = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    gate
      .extend({
        name: z
          .string()
          .trim()
          .regex(/^[A-Z_][A-Z0-9_]*$/, "اسم السر لازم يكون حروف كبيرة وشرطة سفلية"),
        value: z.string().min(1).max(5000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (!(await authorize(data.key, data.password)))
      return { ok: false as const, message: "غير مصرح" };
    try {
      const { setVaultSecret } = await import("@/server/vault.server");
      await setVaultSecret(data.name, data.value);
      return { ok: true as const, message: `تم حفظ ${data.name} في الخزنة` };
    } catch (cause) {
      return fail(cause);
    }
  });

export const vaultDeleteSecret = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => gate.extend({ name: z.string().trim().min(1) }).parse(input))
  .handler(async ({ data }) => {
    if (!(await authorize(data.key, data.password)))
      return { ok: false as const, message: "غير مصرح" };
    try {
      const { deleteVaultSecret } = await import("@/server/vault.server");
      await deleteVaultSecret(data.name);
      return { ok: true as const, message: `تم حذف ${data.name}` };
    } catch (cause) {
      return fail(cause);
    }
  });

/** Pulls anything visible in the platform environment into the vault. */
export const vaultSync = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => gate.parse(input))
  .handler(async ({ data }) => {
    if (!(await authorize(data.key, data.password)))
      return { ok: false as const, message: "غير مصرح" };
    try {
      const { syncFromEnvironment } = await import("@/server/vault.server");
      const { added, names } = await syncFromEnvironment();
      return {
        ok: true as const,
        message: added === 0 ? "الخزنة محدّثة بالفعل" : `تمت إضافة ${added}: ${names.join("، ")}`,
      };
    } catch (cause) {
      return fail(cause);
    }
  });

/** Encrypted backup file — useless without the master passphrase. */
export const vaultExport = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => gate.parse(input))
  .handler(async ({ data }) => {
    if (!(await authorize(data.key, data.password)))
      return { ok: false as const, message: "غير مصرح" };
    try {
      const { exportBundle } = await import("@/server/vault.server");
      return { ok: true as const, bundle: await exportBundle() };
    } catch (cause) {
      return fail(cause);
    }
  });

/** Restores a backup file into this project. */
export const vaultImport = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    gate
      .extend({ bundle: z.string().min(2).max(500_000), passphrase: z.string().min(1).max(300) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (!(await authorize(data.key, data.password)))
      return { ok: false as const, message: "غير مصرح" };
    try {
      const { importBundle } = await import("@/server/vault.server");
      const parsed = JSON.parse(data.bundle) as unknown;
      const { restored } = await importBundle(parsed, data.passphrase);
      return {
        ok: true as const,
        message: `تم استرجاع ${restored} سر — اضبط VAULT_PASSPHRASE بنفس كلمة السر`,
      };
    } catch (cause) {
      return fail(cause);
    }
  });
