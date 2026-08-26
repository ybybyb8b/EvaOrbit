import type { Metadata } from "next";
import { TrackersView } from "./trackers-view";

export const metadata: Metadata = { title: "Trackers" };

export default function TrackersPage() {
  return <TrackersView />;
}
