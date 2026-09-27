import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTrackerDetail } from "@/lib/services/tracker";
import { TrackerDetailView } from "./tracker-detail-view";

export const metadata: Metadata = { title: "Tracker" };
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ capture?: string }> };
export default async function TrackerDetailPage({ params, searchParams }: Props) {
  const trackerId = Number((await params).id);
  if (!Number.isSafeInteger(trackerId) || trackerId <= 0) notFound();
  const detail = await getTrackerDetail(trackerId);
  if (!detail) notFound();
  return <TrackerDetailView initial={detail} trackerId={trackerId} openDetailedRecord={(await searchParams).capture === "detail"} />;
}
