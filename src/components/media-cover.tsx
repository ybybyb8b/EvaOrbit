"use client";
import Image from "next/image";
import {useMediaData} from "./media-data-context";
import { getMediaDisplayTitle } from "@/lib/media-display";
import type { MediaItem } from "@/lib/types";

export function MediaCover({item,className=""}:{item:Pick<MediaItem,"id"|"title"|"originalTitle"|"translatedTitle"|"seriesName"|"mediaType"|"coverUrl"|"seasonNumber"|"seasonTitle"|"updatedAt">;className?:string}){
  const {local}=useMediaData();
  const display=getMediaDisplayTitle(item);
  return <span className={`media-cover ${item.coverUrl?"has-image":"media-cover-fallback"} ${className}`.trim()}>
    {item.coverUrl?local?
    // eslint-disable-next-line @next/next/no-img-element
    <img src={item.coverUrl} alt={`${display.primary} cover`} width={240} height={360}/>:<Image unoptimized src={item.coverUrl} alt={`${display.primary} cover`} width={240} height={360}/>:<><strong>{display.primary}</strong><small>{display.secondary??item.mediaType.toUpperCase()}</small></>}
  </span>;
}
