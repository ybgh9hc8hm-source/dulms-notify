import { timingSafeEqual } from "node:crypto";

/** Constant-time compare for shared secrets (cron + Telegram webhooks). */
export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function authorizeCronRequest(request: Request): Promise<boolean> {
  const provided = request.headers.get("x-cron-secret") ?? "";
  if (!provided) return false;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "cron_secret")
    .maybeSingle();

  return !error && Boolean(data?.value) && safeEqual(provided, data?.value ?? "");
}

export function boundedNumber(
  url: URL,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  // Number(null) === 0, which would clamp every missing param to `minimum`
  // (e.g. budget=0 -> 5_000ms) instead of honoring the fallback. Treat an
  // absent/blank/non-numeric param as the fallback explicitly.
  const raw = url.searchParams.get(key);
  const value = Number(raw);
  if (raw === null || raw === "" || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

// build touch: refresh worker env binding
