/**
 * Telegram Mini App bootstrap.
 *
 * When the site is opened inside Telegram (via the bot's menu button or a
 * `web_app` inline button), `window.Telegram.WebApp` exists. We then expand the
 * viewport to full height, match the app's dark chrome, and tag <html> with
 * `.tg-miniapp` so layouts can add the extra safe-area padding Telegram needs.
 */
import { useEffect } from "react";

type TelegramWebApp = {
  ready: () => void;
  expand: () => void;
  disableVerticalSwipes?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  viewportStableHeight?: number;
};

function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  const tg = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
  return tg ?? null;
}

export function TelegramMiniAppProvider() {
  useEffect(() => {
    let cancelled = false;

    const boot = () => {
      const tg = getTelegramWebApp();
      if (!tg || cancelled) return false;
      try {
        tg.ready();
        tg.expand();
        tg.disableVerticalSwipes?.();
        tg.setHeaderColor?.("#1b2330");
        tg.setBackgroundColor?.("#1b2330");
      } catch {
        /* Telegram client too old for some of these — safe to ignore. */
      }
      document.documentElement.classList.add("tg-miniapp");
      return true;
    };

    if (boot()) return;
    // The SDK script may still be loading on first paint.
    const timer = window.setInterval(() => {
      if (boot()) window.clearInterval(timer);
    }, 120);
    const stop = window.setTimeout(() => window.clearInterval(timer), 4000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, []);

  return null;
}
