import type { Metadata } from "next";
import { getTimelineAssociationOverview } from "@/lib/services/timeline-association";
import { TimelineAssociationView } from "./view";

export const metadata: Metadata = { title: "Timeline 关联规则" };
export default async function Page() {
  return <TimelineAssociationView {...await getTimelineAssociationOverview()} />;
}
