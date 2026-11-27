"use client";
import { useEffect,useState,type CSSProperties } from "react";
import { useBusinessRequest } from "@/components/business-request-context";
import type { ImportantDate } from "@/lib/important-dates";
import styles from "./days.module.css";

export function useDateBackgroundImage(item:Pick<ImportantDate,"id"|"background"|"backgroundImageVersion">){
  const request=useBusinessRequest(),background=item.background;
  const key=background?.kind==="photo"&&item.backgroundImageVersion?`/api/important-dates/${item.id}/background?v=${item.backgroundImageVersion}`:"";
  const staged=background?.kind==="photo"?background.image:undefined;
  const [loaded,setLoaded]=useState<{key:string;image:string}|null>(null);
  useEffect(()=>{if(!key||staged)return;let active=true;void request(key).then(async response=>{if(!response.ok)return;const value=await response.json();if(active&&typeof value.image==="string"&&/^data:image\/(jpeg|png|webp);base64,/.test(value.image))setLoaded({key,image:value.image});}).catch(()=>{});return()=>{active=false;};},[key,request,staged]);
  return background?.kind==="photo"?(background.image??(loaded?.key===key?loaded.image:undefined)):undefined;
}
export function DateBackground({item,compact=false}:{item:Pick<ImportantDate,"id"|"background"|"backgroundImageVersion">;compact?:boolean}){
  const image=useDateBackgroundImage(item),background=item.background;
  if(!background||background.kind==="none")return null;
  const style:CSSProperties=background.kind==="solid"?{background:background.color}:background.kind==="gradient"?{background:`linear-gradient(140deg,${background.color},${background.secondary})`}:image?{backgroundImage:`url("${image}")`,backgroundPosition:`${background.x}% ${background.y}%`,transform:`scale(${background.zoom??1})`,transformOrigin:`${background.x}% ${background.y}%`} as CSSProperties:{};
  return <span aria-hidden="true" className={styles.cardBackdrop} data-compact={compact||undefined} data-kind={background.kind} data-photo={Boolean(image)||undefined} style={background.kind==="photo"?{"--photo-shade":background.shade} as CSSProperties:style}>{background.kind==="photo"&&image&&<span className={styles.photoPixels} style={style}/>}</span>;
}
