import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

/**
 * Baseline security headers on every response.
 *
 * Deliberately no `script-src`: TanStack Start injects inline hydration
 * scripts, so a strict script policy here would need nonce plumbing and would
 * silently break SSR. What we can enforce without breakage still removes real
 * attack surface: no plugins/objects, no <base> hijacking, no form posts to
 * third parties, and framing restricted to this origin plus the managed
 * editor and preview surfaces (the app is legitimately iframed there, so
 * `X-Frame-Options: DENY` is not usable).
 */
const SECURITY_HEADERS: Array<[string, string]> = [
  ["x-content-type-options", "nosniff"],
  ["referrer-policy", "strict-origin-when-cross-origin"],
  ["permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()"],
  ["strict-transport-security", "max-age=31536000; includeSubDomains"],
  ["cross-origin-opener-policy", "same-origin-allow-popups"],
  [
    "content-security-policy",
    [
      "default-src 'self' https: data: blob:",
      // Start ships inline hydration scripts; without 'unsafe-inline' the app
      // does not hydrate at all (verified: blank /auth and /a/*).
      "script-src 'self' 'unsafe-inline' https: blob:",
      "style-src 'self' 'unsafe-inline' https:",
      "img-src 'self' data: blob: https:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self' https://*.lovable.app https://*.lovable.dev https://lovable.dev",
    ].join("; "),
  ],
];

const securityHeadersMiddleware = createMiddleware().server(async ({ next }) => {
  const result = await next();
  // Depending on the handler type, `next()` resolves either to a Response or to
  // a context object carrying one. Cover both so headers are never skipped.
  const target =
    result instanceof Response
      ? result
      : (result as { response?: unknown } | undefined)?.response instanceof Response
        ? (result as { response: Response }).response
        : undefined;
  if (target) {
    for (const [name, value] of SECURITY_HEADERS) {
      if (!target.headers.has(name)) target.headers.set(name, value);
    }
  }
  return result;
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, securityHeadersMiddleware, csrfMiddleware],
}));
