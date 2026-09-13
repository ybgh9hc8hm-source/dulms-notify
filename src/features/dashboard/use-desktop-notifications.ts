/**
 * Mirrors freshly-arrived unread alerts into native browser notifications.
 * Telegram covers closed tabs; this covers the open one.
 */
import { useEffect, useRef } from "react";

interface AlertRow {
  id: string;
  title: string;
  body: string | null;
  read_at: string | null;
}

export function useDesktopNotifications(
  notifications: readonly AlertRow[],
  fallback: { title: string; body: (n: number) => string },
) {
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      void Notification.requestPermission().catch(() => {});
    }
  }, []);

  const seenRef = useRef<Set<string> | null>(null);
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const unread = notifications.filter((n) => !n.read_at);
    const currentIds = new Set(unread.map((n) => n.id));

    if (seenRef.current === null) {
      seenRef.current = currentIds;
      return;
    }

    const fresh = unread.filter((n) => !seenRef.current!.has(n.id));
    for (const item of fresh.slice(0, 3)) {
      try {
        new Notification(item.title || fallbackRef.current.title, {
          body: item.body ?? fallbackRef.current.body(fresh.length),
          icon: "/favicon.png",
          tag: item.id,
        });
      } catch {
        /* notification construction can throw on some browsers */
      }
    }
    seenRef.current = currentIds;
  }, [notifications]);
}
