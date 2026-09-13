import { createFileRoute } from "@tanstack/react-router";

/**
 * Public read-only proxy for operator-uploaded landing media.
 *
 * Uploads live in the private `landing` bucket; this route streams a single
 * object by name so the landing page can use a stable, cache-friendly URL
 * without making the bucket public.
 */
export const Route = createFileRoute("/api/public/media/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const raw = (params as { _splat?: string })._splat ?? "";
        const name = raw.split("/").pop() ?? "";
        if (!/^[a-zA-Z0-9._-]{1,120}$/.test(name)) {
          return new Response("not found", { status: 404 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage.from("landing").download(name);
        if (error || !data) return new Response("not found", { status: 404 });

        // Never echo the stored content type back verbatim: an operator upload
        // of text/html or image/svg+xml would otherwise render as same-origin
        // markup and give stored XSS on our own domain.
        const allowed = new Set([
          "image/png",
          "image/jpeg",
          "image/webp",
          "image/avif",
          "image/gif",
        ]);
        const type = allowed.has(data.type) ? data.type : "application/octet-stream";

        return new Response(await data.arrayBuffer(), {
          headers: {
            "content-type": type,
            "x-content-type-options": "nosniff",
            "content-security-policy": "default-src 'none'; sandbox",
            "cache-control": "public, max-age=31536000, immutable",
          },
        });
      },
    },
  },
});
