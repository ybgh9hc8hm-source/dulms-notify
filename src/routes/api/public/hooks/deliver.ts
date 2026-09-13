import { createFileRoute } from "@tanstack/react-router";

/**
 * Delivery worker: drains `notification_outbox` into Telegram.
 *
 * Detection never blocks on delivery, so throughput here scales with the
 * number of parallel invocations (the claim is atomic) instead of with one
 * request's lifetime. Failed sends are retried with exponential backoff and
 * a dead chat unlinks itself.
 */
export const Route = createFileRoute("/api/public/hooks/deliver")({
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
          const { drainOutbox } = await import("@/server/notify/outbox.server");
          const summary = await drainOutbox(
            boundedNumber(url, "limit", 200, 1, 1000),
            // Drain repeatedly inside one invocation, stopping before the
            // caller's timeout so a big fan-out clears in seconds, not hours.
            boundedNumber(url, "budget", 40_000, 1_000, 110_000),
          );
          // Same tick measures the promise we make to students: detection and
          // delivery latency, with a cooldowned page to the operator.
          const { checkSlo, assertAlertChannel } = await import("@/server/notify/slo-watch.server");
          // Loud, throttled log when nobody could be paged at all.
          await assertAlertChannel().catch(() => false);
          const slo = await checkSlo().catch(() => null);
          return Response.json({ ok: true, ms: Date.now() - started, ...summary, slo });
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : String(cause);
          console.error("[deliver] tick failed", cause);
          return Response.json(
            { ok: false, ms: Date.now() - started, error: message },
            { status: 503 },
          );
        }
      },
    },
  },
});
