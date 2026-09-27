import type { Metadata } from "next";
import { listTrackerSummaries } from "@/lib/services/tracker";
import { TrackersView } from "./trackers-view";

export const metadata: Metadata = { title: "Trackers" };

export const dynamic = "force-dynamic";

export default async function TrackersPage() {
  const trackers = await listTrackerSummaries();
  return <TrackersView initial={trackers} />;
}
