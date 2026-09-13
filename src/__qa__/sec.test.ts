import { describe, it, expect } from "vitest";

/**
 * These tests must not depend on deployment secrets: the local runner has no
 * platform env and no service-role database access. Any credential the code
 * reads from the environment is provided here before the modules are used
 * (every read is lazy, so assigning them at module scope is enough).
 */
process.env["DULMS_CRED_SECRET"] ??= "test-cred-secret-v1";
process.env["DULMS_CRED_SECRET_V1"] ??= "test-cred-secret-v1";
process.env["ADMIN_PANEL_PATH"] ??= "test-admin-path";
process.env["ADMIN_PANEL_PASSWORD"] ??= "test-admin-password";
import {
  encryptSecret,
  decryptSecret,
  activeKeyVersion,
  availableKeyVersions,
} from "@/server/crypto.server";
import {
  mintAdminSessionToken,
  verifyAdminSessionToken,
  authorizeAdmin,
} from "@/server/admin/auth-guard.server";

describe("encryption versioning", () => {
  it("round-trips with the active version", () => {
    const v = activeKeyVersion();
    const ct = encryptSecret("p@ss-الطالب-123", v);
    expect(decryptSecret(ct, v)).toBe("p@ss-الطالب-123");
  });
  it("decrypts without a stated version", () => {
    const ct = encryptSecret("secret2");
    expect(decryptSecret(ct)).toBe("secret2");
  });
  it("rejects tampered ciphertext", () => {
    const ct = Buffer.from(encryptSecret("secret3"), "base64");
    ct[ct.length - 1] = (ct[ct.length - 1] ?? 0) ^ 0xff;
    expect(() => decryptSecret(ct.toString("base64"))).toThrow();
  });
  it("exposes at least one key version", () => {
    expect(availableKeyVersions().length).toBeGreaterThan(0);
  });
  it("wrong version still recovers via exhaustive try", () => {
    const ct = encryptSecret("secret4", activeKeyVersion());
    expect(decryptSecret(ct, 9)).toBe("secret4");
  });
});

describe("admin session tokens", () => {
  const key = process.env["ADMIN_PANEL_PATH"]!;
  it("accepts a freshly minted token", async () => {
    const token = (await mintAdminSessionToken())!;
    expect(await verifyAdminSessionToken(key, token)).toBe(true);
    expect((await authorizeAdmin(key, token)).ok).toBe(true);
  });
  it("rejects a tampered signature", async () => {
    const token = (await mintAdminSessionToken())!;
    const [p, iat, sig] = token.split(".");
    const bad = `${p}.${iat}.${sig!.slice(0, -2)}AA`;
    expect(await verifyAdminSessionToken(key, bad)).toBe(false);
  });
  it("rejects a re-dated token (issuedAt is signed)", async () => {
    const token = (await mintAdminSessionToken())!;
    const [p, , sig] = token.split(".");
    expect(
      await verifyAdminSessionToken(key, `${p}.${(Date.now() + 999).toString(36)}.${sig}`),
    ).toBe(false);
  });
  it("rejects an empty / missing token", async () => {
    expect(await verifyAdminSessionToken(key, "adm1.")).toBe(false);
    expect((await authorizeAdmin(key, "adm1.")).ok).toBe(false);
  });
  it("rejects a valid token on the wrong admin path", async () => {
    const token = (await mintAdminSessionToken())!;
    expect(await verifyAdminSessionToken("wrong-path", token)).toBe(false);
  });
  it("rejects a wrong password", async () => {
    expect((await authorizeAdmin(key, "definitely-not-the-password")).ok).toBe(false);
  });
});
