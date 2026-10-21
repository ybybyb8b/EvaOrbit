import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMediaSeries, listMedia, listMediaSeries } from "@/lib/services/media";
import { MediaView } from "../../media-view";

export const metadata:Metadata={title:"Media Series"};
export const dynamic="force-dynamic";

export default async function MediaSeriesPage({params}:{params:Promise<{id:string}>}){
  const id=Number((await params).id);if(!Number.isSafeInteger(id)||id<1)notFound();
  const[series,items,allSeries]=await Promise.all([getMediaSeries(id),listMedia({seriesId:id,limit:200}),listMediaSeries()]);
  if(!series)notFound();
  return <MediaView initial={items} initialSeries={allSeries} defaultSeries={series}/>;
}
