import Image from "next/image";
import type { MediaItem } from "@/lib/types";

export function MediaCover({item,className=""}:{item:Pick<MediaItem,"id"|"title"|"mediaType"|"coverUrl"|"seasonNumber"|"seasonTitle"|"updatedAt">;className?:string}){
  const season=item.seasonNumber?`S${item.seasonNumber}`:item.seasonTitle;
  return <span className={`media-cover ${item.coverUrl?"has-image":"media-cover-fallback"} ${className}`.trim()}>
    {item.coverUrl?<Image unoptimized src={item.coverUrl} alt={`${item.title} cover`} width={240} height={360}/>:<><strong>{item.title}</strong><small>{item.mediaType.toUpperCase()}{season?` · ${season}`:""}</small></>}
  </span>;
}
