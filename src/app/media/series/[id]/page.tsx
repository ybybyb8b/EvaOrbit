import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getMediaSeries, listMedia } from "@/lib/services/media";
import { MediaPosterCard } from "../../media-view";

export const metadata:Metadata={title:"Media Series"};
export const dynamic="force-dynamic";

export default async function MediaSeriesPage({params}:{params:Promise<{id:string}>}){
  const id=Number((await params).id);if(!Number.isSafeInteger(id)||id<1)notFound();
  const[series,items]=await Promise.all([getMediaSeries(id),listMedia({seriesId:id,limit:200})]);
  if(!series)notFound();
  return <div className="page media-page media-series-page"><Link className="back-link media-back-link" href="/media">← Media</Link><PageHeader eyebrow="SERIES / FRANCHISE" title={series.name} description={`${items.length} ${items.length===1?"item":"items"} kept as independent records.`}/><div className="media-poster-grid">{items.map(item=><MediaPosterCard item={item} key={item.id}/>)}</div></div>;
}
