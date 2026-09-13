import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportClientError } from "../lib/error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { LanguageProvider } from "@/lib/i18n";
import { MaintenanceGate } from "@/components/MaintenanceGate";
import { ensureSessionPersistence } from "@/lib/session-persist";
import { TelegramMiniAppProvider } from "@/lib/telegram-webapp";
import { SITE_NAME, SITE_URL, siteUrl } from "@/config/site";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-large-title text-foreground">404</h1>
        <h2 className="mt-3 text-title-3 text-foreground">Page not found</h2>
        <p className="mt-2 text-subhead">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="press inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-[0.9375rem] font-semibold text-primary-foreground active:scale-[0.97] hover:bg-primary/88"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportClientError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-title-1 text-foreground">This page didn't load</h1>
        <p className="mt-2 text-subhead">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="press inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-[0.9375rem] font-semibold text-primary-foreground active:scale-[0.97] hover:bg-primary/88"
          >
            Try again
          </button>
          <a
            href="/"
            className="press inline-flex h-11 items-center justify-center rounded-xl border-[0.5px] border-input bg-secondary/40 px-5 text-[0.9375rem] font-semibold text-foreground active:scale-[0.97] hover:bg-secondary/70"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover",
      },
      { title: "DULMS Notify — Never miss anything important on DULMS" },
      {
        name: "description",
        content:
          "Connect your DULMS account once and get instant alerts for new grades, quizzes, assignments, registration updates, and schedule changes.",
      },
      { property: "og:title", content: "DULMS Notify — Never miss anything important on DULMS" },
      {
        property: "og:description",
        content:
          "Connect your DULMS account once and get instant alerts for new grades, quizzes, assignments, registration updates, and schedule changes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#000000" },
      { name: "application-name", content: "DULMS Notify" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "DULMS Notify" },
      { name: "format-detection", content: "telephone=no" },
      { name: "twitter:title", content: "DULMS Notify — Never miss anything important on DULMS" },
      {
        name: "twitter:description",
        content:
          "Connect your DULMS account once and get instant alerts for new grades, quizzes, assignments, registration updates, and schedule changes.",
      },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Inter:opsz,wght@14..32,400..700&family=Inter+Tight:wght@500..700&display=swap",
      },

      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      { rel: "shortcut icon", href: "/favicon.png", type: "image/png" },
    ],
    scripts: [
      // Telegram Mini App SDK — no-op when the site is opened outside Telegram.
      { src: "https://telegram.org/js/telegram-web-app.js" },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              name: "DULMS Notify",
              url: SITE_URL,
              logo: siteUrl("/icon-512.png"),
              description:
                "Live alerts for quizzes, assignments, grades and schedules from Delta University's DULMS.",
            },
            {
              "@type": "WebSite",
              name: SITE_NAME,
              url: SITE_URL,
              inLanguage: ["ar", "en"],
              description:
                "Live alerts for quizzes, assignments, grades and schedules from Delta University's DULMS.",
            },
          ],
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    // The Telegram WebApp SDK mutates <html> inline styles before hydration.
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <LanguageProvider>
          {children}
          <Toaster />
        </LanguageProvider>
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    void ensureSessionPersistence();
  }, []);

  // Lock the viewport: block pinch/double-tap zoom and any out-of-bounds pan.
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    // iOS Safari pinch gesture events
    document.addEventListener("gesturestart", prevent, { passive: false });
    document.addEventListener("gesturechange", prevent, { passive: false });
    document.addEventListener("gestureend", prevent, { passive: false });
    // Desktop trackpad pinch arrives as ctrl+wheel
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    document.addEventListener("wheel", onWheel, { passive: false });
    // Double-tap zoom on iOS
    let lastTouchEnd = 0;
    const onTouchEnd = (e: TouchEvent) => {
      const now = Date.now();
      if (now - lastTouchEnd < 350) e.preventDefault();
      lastTouchEnd = now;
    };
    document.addEventListener("touchend", onTouchEnd, { passive: false });
    // Keep the window scroller pinned inside bounds (no rubber-band overshoot)
    const clampScroll = () => {
      const maxX = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
      const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      if (window.scrollX < 0 || window.scrollY < 0 || window.scrollX > maxX || window.scrollY > maxY) {
        window.scrollTo(
          Math.min(Math.max(window.scrollX, 0), maxX),
          Math.min(Math.max(window.scrollY, 0), maxY),
        );
      }
    };
    window.addEventListener("scroll", clampScroll, { passive: true });
    return () => {
      document.removeEventListener("gesturestart", prevent);
      document.removeEventListener("gesturechange", prevent);
      document.removeEventListener("gestureend", prevent);
      document.removeEventListener("wheel", onWheel);
      document.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("scroll", clampScroll);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TelegramMiniAppProvider />
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <MaintenanceGate>
        <Outlet />
      </MaintenanceGate>
    </QueryClientProvider>
  );
}
