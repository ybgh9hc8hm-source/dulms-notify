/**
 * Overview read model: the single query the dashboard renders from.
 *
 * The query is scoped to the authenticated user. We intentionally do not
 * mirror dashboard data into localStorage: a device can be shared by multiple
 * students, and rendering a previous student's snapshot is a privacy leak.
 */
import { queryOptions } from "@tanstack/react-query";

import { getOverview } from "@/lib/dulms.functions";

export type Overview = Awaited<ReturnType<typeof getOverview>>;

export const overviewKey = (userId: string) => ["overview", userId] as const;

export const overviewQuery = (userId: string) =>
  queryOptions({
    queryKey: overviewKey(userId),
    queryFn: () => getOverview(),
    // While the very first scrape is still running there is nothing to show, so
    // poll fast; once items exist realtime takes over and a slow poll is enough.
    refetchInterval: (query) => ((query.state.data?.items?.length ?? 0) === 0 ? 3_000 : 60_000),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 30_000,
    gcTime: 10 * 60_000,
  });
