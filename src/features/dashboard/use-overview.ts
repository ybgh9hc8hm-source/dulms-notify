/**
 * Everything the dashboard needs to stay live:
 *  - cached-first read of the overview,
 *  - a throttled background scrape only when the stored data is stale,
 *  - realtime invalidation for this student's rows,
 *  - a refresh when the tab becomes visible again.
 *
 * A DULMS scrape takes tens of seconds, so it must never run on every mount.
 */
import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";
import { syncNow } from "@/lib/dulms.functions";
import { overviewKey, overviewQuery } from "./overview.query";

/** Cron polls continuously; the client only nudges if data is >10s old. */
const SYNC_MIN_INTERVAL_MS = 10_000;

export function useOverview(userId: string) {
  const queryClient = useQueryClient();
  const queryKey = overviewKey(userId);
  const query = useQuery(overviewQuery(userId));
  const { data } = query;

  const invalidate = useRef(() => {
    void queryClient.invalidateQueries({ queryKey });
  }).current;

  // --- background scrape, throttled -----------------------------------------
  const sync = useServerFn(syncNow);
  const lastTriggeredRef = useRef(0);
  const syncRef = useRef<(lastSyncAt: string | null | undefined) => void>(() => {});
  syncRef.current = (lastSyncAt) => {
    const now = Date.now();
    if (now - lastTriggeredRef.current < SYNC_MIN_INTERVAL_MS) return;
    const age = lastSyncAt ? now - new Date(lastSyncAt).getTime() : Number.POSITIVE_INFINITY;
    if (age < SYNC_MIN_INTERVAL_MS) return;
    lastTriggeredRef.current = now;
    void sync()
      .then(invalidate)
      .catch(() => {});
  };

  const lastSyncAt = data?.account?.last_sync_at ?? null;
  const hasAccount = Boolean(data?.account);
  useEffect(() => {
    if (!hasAccount) return;
    syncRef.current(lastSyncAt);
  }, [hasAccount, lastSyncAt]);

  // --- realtime + visibility ------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    // Realtime can fail (blocked websocket in an embedded preview, offline
    // tab). The dashboard still refreshes on focus, so a failure here must
    // stay silent instead of surfacing as an unhandled rejection.
    void supabase.auth
      .getUser()
      .then(({ data: userData }) => {
        const uid = userData.user?.id;
        if (cancelled || !uid) return;
        const filter = `user_id=eq.${uid}`;
        channel = supabase.channel(`overview:${uid}`);
        for (const table of [
          "notifications",
          "dulms_items",
          "dulms_accounts",
          "registration_watches",
        ] as const) {
          channel.on(
            "postgres_changes",
            { event: "*", schema: "public", table, filter },
            invalidate,
          );
        }
        channel.subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn("[overview] realtime unavailable, falling back to polling");
          }
        });
      })
      .catch(() => {});

    const onVisible = () => {
      if (document.visibilityState === "visible") invalidate();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [invalidate]);

  return { ...query, invalidate, sync };
}
