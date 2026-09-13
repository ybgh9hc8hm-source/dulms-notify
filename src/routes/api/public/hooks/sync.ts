import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron entry point. Safe to call concurrently: the scheduler claims each
 * student atomically in the database, so overlapping ticks never do the same
 * work twice.
 */
export const Route = createFileRoute("/api/public/hooks/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authorizeCronRequest, boundedNumber } = await import("@/server/cron-auth.server");
        if (!(await authorizeCronRequest(request))) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        const url = new URL(request.url);
        const { syncAllUsers, purgeOldSyncLogs } = await import("@/server/sync.server");
        const started = Date.now();
        const results = await syncAllUsers({
          limit: boundedNumber(url, "limit", 200, 1, 500),
          staleSeconds: boundedNumber(url, "stale", 5, 5, 3_600),
          concurrency: boundedNumber(url, "concurrency", 12, 1, 20),
        });

        // Cheap housekeeping, roughly once every ~20 ticks.
        if (Math.random() < 0.05) void purgeOldSyncLogs();

        return Response.json({
          ok: true,
          synced: results.length,
          ms: Date.now() - started,
          results,
        });
      },
    },
  },
});
