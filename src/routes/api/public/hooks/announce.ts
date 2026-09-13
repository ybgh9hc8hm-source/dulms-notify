/**
 * Operator broadcast: sends one Telegram message to every linked student.
 *
 * Protected by the same shared cron secret as the other hooks — there is no
 * public path into it. Used for service announcements (maintenance, incidents).
 */
import { createFileRoute } from "@tanstack/react-router";

type Body = { text?: string; excludeDulmsIds?: string[] };

export const Route = createFileRoute("/api/public/hooks/announce")({
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

        const body = ((await request.json().catch(() => null)) ?? {}) as Body;
        const text = (body.text ?? "").trim();
        if (!text) return Response.json({ ok: false, error: "text required" }, { status: 400 });
        const exclude = new Set((body.excludeDulmsIds ?? []).map((id) => id.trim()));

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendTelegramMessage } = await import("@/server/telegram.server");

        const { data } = await supabaseAdmin
          .from("dulms_accounts")
          .select("dulms_id, telegram_chat_id")
          .not("telegram_chat_id", "is", null);

        let sent = 0;
        let failed = 0;
        for (const row of data ?? []) {
          if (exclude.has(row.dulms_id) || !row.telegram_chat_id) continue;
          const result = await sendTelegramMessage(row.telegram_chat_id, text);
          if (result.ok) sent++;
          else failed++;
        }

        return Response.json({ ok: true, sent, failed });
      },
    },
  },
});
