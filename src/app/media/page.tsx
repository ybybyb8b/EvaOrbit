import type { Metadata } from "next";
import { listMedia, listMediaSeries } from "@/lib/services/media";
import { MediaView } from "./media-view";

export const metadata: Metadata = { title: "Media" };
export const dynamic = "force-dynamic";

export default async function MediaPage() {
  const [items, series] = await Promise.all([listMedia({ limit: 200 }), listMediaSeries()]);
  return <MediaView initial={items} initialSeries={series} />;
}
