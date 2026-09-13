import { createFileRoute } from "@tanstack/react-router";

/**
 * Credential-recovery worker.
 *
 * Finds students whose stored DULMS password can no longer be decrypted (the
 * encryption key changed when the project moved), invites them over the bot to
 * sign in once, and parks their scheduling so dead checks stop consuming the
 * shared DULMS rate budget. Idempotent: the outbox dedupe key is per-day, so a
 * daily cron re-parks accounts without spamming anyone.
 *
 * POST with `?dry=1` to only count the affected accounts.
 */
export const Route = createFileRoute("/api/public/hooks/recover")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authorizeCronRequest } = await import("@/server/cron-auth.server");
        if (!(await authorizeCronRequest(request))) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        try {
          const dry = new URL(request.url).searchParams.get("dry") === "1";
          const { scanBrokenCredentials, runCredentialRecovery } =
            await import("@/server/notify/recovery.server");
          const report = dry ? await scanBrokenCredentials() : await runCredentialRecovery();
          return Response.json({ ok: true, dry, ...report });
        } catch (cause) {
          const message =
            cause instanceof Error
              ? cause.message
              : typeof cause === "object" && cause !== null
                ? ((cause as { message?: string }).message ?? JSON.stringify(cause))
                : String(cause);

          console.error("[recover] failed", cause);
          return Response.json({ ok: false, error: message }, { status: 503 });
        }
      },
    },
  },
});
