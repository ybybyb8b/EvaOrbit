import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMediaDetail, listMediaSeries } from "@/lib/services/media";
import { MediaDetailView } from "./media-detail-view";

export const metadata: Metadata = { title: "Media" };
export const dynamic = "force-dynamic";

export default async function MediaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const rawId = (await params).id;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const [detail, series] = await Promise.all([getMediaDetail(id), listMediaSeries()]);
  if (!detail) notFound();

  return <MediaDetailView initial={detail} initialSeries={series} />;
}
