"use client";
import Image from "next/image";
import {useMediaData} from "./media-data-context";
import { getMediaDisplayTitle } from "@/lib/media-display";
import type { MediaItem } from "@/lib/types";

export function MediaCover({item,className="",compact=false}:{item:Pick<MediaItem,"id"|"title"|"originalTitle"|"translatedTitle"|"seriesName"|"mediaType"|"coverUrl"|"seasonNumber"|"seasonTitle"|"updatedAt">;className?:string;compact?:boolean}){
  const {local,coverSources}=useMediaData();
  // Online list refreshes return authenticated API paths; the installed UI
  // must keep rendering the account snapshot's image bytes instead.
  const coverUrl=local&&item.coverUrl?coverSources?.[item.id]??null:item.coverUrl;
  const display=getMediaDisplayTitle(item);
  return <span className={`media-cover ${coverUrl?"has-image":"media-cover-fallback"} ${className}`.trim()}>
    {coverUrl?local?
    // eslint-disable-next-line @next/next/no-img-element
    <img src={coverUrl} alt={`${display.primary} cover`} width={240} height={360}/>:<Image unoptimized src={coverUrl} alt={`${display.primary} cover`} width={240} height={360}/>:compact?<span className="media-cover-initial" aria-hidden="true">{Array.from(display.primary)[0]}</span>:<><strong>{display.primary}</strong><small>{display.secondary??item.mediaType.toUpperCase()}</small></>}
  </span>;
}
