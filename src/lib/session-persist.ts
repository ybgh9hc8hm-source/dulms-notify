import { supabase } from "@/integrations/supabase/client";

// Long-lived cookie mirror of the Supabase session so it survives:
// - localStorage eviction by iOS Safari ITP (after ~7 days of no interaction)
// - opening the app in a new tab / after closing the tab
// - PWA reinstalls where the WebView storage bucket changes

const COOKIE_NAME = "dn_sess";
const MAX_AGE_DAYS = 60;

function writeCookie(value: string) {
  if (typeof document === "undefined") return;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  const maxAge = MAX_AGE_DAYS * 24 * 60 * 60;
  document.cookie = `${COOKIE_NAME}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

export function clearSessionMirror() {
  clearCookie();
  if (typeof window !== "undefined") {
    // Remove snapshots written by older app versions. Dashboard data must
    // never survive an account switch in shared browser storage.
    window.localStorage.removeItem("dn_overview_cache_v1");
  }
}

function clearCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function readCookie(): { access_token: string; refresh_token: string } | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!match) return null;
  try {
    const raw = decodeURIComponent(match.slice(COOKIE_NAME.length + 1));
    const parsed = JSON.parse(atob(raw));
    if (parsed?.access_token && parsed?.refresh_token) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

let installed = false;

export async function ensureSessionPersistence() {
  if (typeof window === "undefined" || installed) return;
  installed = true;

  // Purge the unscoped dashboard snapshot used by older releases. It may
  // contain another student's private data on shared devices.
  window.localStorage.removeItem("dn_overview_cache_v1");

  // Restore from cookie mirror if localStorage lost the session.
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    const fallback = readCookie();
    if (fallback) {
      await supabase.auth.setSession(fallback);
    }
  }

  // Keep cookie mirror in sync with future auth events.
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.access_token && session?.refresh_token) {
      const payload = btoa(
        JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        }),
      );
      writeCookie(encodeURIComponent(payload));
    } else {
      clearCookie();
    }
  });
}
