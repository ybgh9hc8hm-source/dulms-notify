import { createServerFn } from "@tanstack/react-start";

/**
 * Public read of the maintenance banner state.
 * Safe to call unauthenticated — it only exposes operator-authored copy.
 */
export const getMaintenance = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { getMaintenanceConfig } = await import("@/server/admin/settings.server");
    const config = await getMaintenanceConfig();
    return {
      enabled: config.enabled,
      title: config.title,
      message: config.message,
      eta: config.eta,
    };
  } catch {
    return { enabled: false, title: "", message: "", eta: null as string | null };
  }
});
