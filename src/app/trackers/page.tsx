import type { Metadata } from "next";
import { listTrackerSummaries } from "@/lib/services/tracker";
import { TrackersView } from "./trackers-view";
import { getClientCacheScope } from "@/lib/services/home-cache-scope";

export const metadata: Metadata = { title: "Trackers" };

export const dynamic = "force-dynamic";

export default async function TrackersPage() {
  const [trackers, cacheScope] = await Promise.all([listTrackerSummaries(), getClientCacheScope()]);
  return <TrackersView key={cacheScope} initial={trackers} cacheScope={cacheScope} />;
}
