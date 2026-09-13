import { createServerFn } from "@tanstack/react-start";

/**
 * Public read of the operator-authored landing page content.
 * Safe unauthenticated: it only returns marketing copy and visibility flags.
 */
export const getLanding = createServerFn({ method: "GET" }).handler(async () => {
  const { LANDING_DEFAULT } = await import("@/features/landing/fields");
  try {
    const { getLandingConfig } = await import("@/server/admin/settings.server");
    return await getLandingConfig();
  } catch {
    return LANDING_DEFAULT;
  }
});
