import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTrackerDetail } from "@/lib/services/tracker";
import { TrackerDetailView } from "./tracker-detail-view";
import { getRepository } from "@/lib/repositories";

export const metadata: Metadata = { title: "Tracker" };
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ capture?: string; entry?: string }> };
export default async function TrackerDetailPage({ params, searchParams }: Props) {
  const trackerId = Number((await params).id);
  if (!Number.isSafeInteger(trackerId) || trackerId <= 0) notFound();
  const detail = await getTrackerDetail(trackerId);
  if (!detail) notFound();
  const query = await searchParams, entryId = Number(query.entry);
  const entry = Number.isSafeInteger(entryId) && entryId > 0 ? await (await getRepository()).getTrackerEntry(entryId) : null;
  return <TrackerDetailView initial={detail} trackerId={trackerId} initialEntry={entry?.trackerId === trackerId ? entry : undefined} openDetailedRecord={query.capture === "detail"} />;
}
