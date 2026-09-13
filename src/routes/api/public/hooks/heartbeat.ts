import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron entry point for the direct engine.
 *
 * Cron cannot fire faster than once a minute, so one invocation keeps looping
 * for `loop` milliseconds: it claims every due student, polls the notification
 * feed, and runs the full scrape the instant the feed moves. That is what turns
 * a 1/minute schedule into a 5-second detection cadence.
 */
export const Route = createFileRoute("/api/public/hooks/heartbeat")({
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
        const started = Date.now();
        try {
          const { checkAllUsers } = await import("@/server/sync.server");
          const summary = await checkAllUsers({
            limit: boundedNumber(url, "limit", 200, 1, 500),
            staleSeconds: boundedNumber(url, "stale", 3, 1, 3_600),
            lockSeconds: boundedNumber(url, "lock", 20, 5, 3_600),
            concurrency: boundedNumber(url, "concurrency", 8, 1, 24),
            loopMs: boundedNumber(url, "loop", 55_000, 0, 55_000),
          });

          return Response.json({ ok: true, ms: Date.now() - started, ...summary });
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : String(cause);
          console.error("[heartbeat] tick failed", cause);
          return Response.json(
            { ok: false, ms: Date.now() - started, error: message },
            { status: 503 },
          );
        }
      },
    },
  },
});
