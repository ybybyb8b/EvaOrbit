import type {MediaDetail,MediaSeries,MediaListItem} from "./types";
import {getMediaDisplayTitle,selectMediaItems} from "./media-display.ts";
export type MediaReadonlySnapshot={format:"eo-media-readonly-v1";accountId:string;capturedAt:string;items:MediaDetail[];series:MediaSeries[]};
const id=(value:unknown)=>Number.isSafeInteger(value)&&Number(value)>0;
const day=(value:unknown)=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const timestamp=(value:unknown)=>typeof value==="string"&&value.length>10&&Number.isFinite(Date.parse(value));
export function validateMediaSnapshot(value:MediaReadonlySnapshot,accountId:string){
  const fail=()=>{throw new Error("Invalid or incomplete Media snapshot; previous cache preserved");};
  if(!value||value.format!=="eo-media-readonly-v1"||value.accountId!==accountId||!timestamp(value.capturedAt)||!Array.isArray(value.items)||value.items.length>1000||!Array.isArray(value.series)||value.series.length>1000)fail();
  const groups=new Map<number,MediaSeries>(),ids=new Set<number>(),viewings=new Set<number>();
  for(const series of value.series){if(!series||!id(series.id)||groups.has(series.id)||typeof series.name!=="string"||!series.name.trim()||!Number.isSafeInteger(series.itemCount)||series.itemCount<0||!timestamp(series.createdAt)||!timestamp(series.updatedAt))fail();groups.set(series.id,series);}
  for(const item of value.items){
    if(!item||!id(item.id)||ids.has(item.id)||typeof item.title!=="string"||!["movie","tv","anime","documentary","other"].includes(item.mediaType)||!["planned","watching","completed","paused","dropped"].includes(item.status)||typeof item.isFavorite!=="boolean"||!timestamp(item.createdAt)||!timestamp(item.updatedAt)||!Array.isArray(item.viewings)||item.viewings.length>=1000)fail();
    ids.add(item.id);
    for(const key of ["originalTitle","translatedTitle","seasonTitle","note"] as const)if(item[key]!==null&&typeof item[key]!=="string")fail();
    if(item.rating!==null&&(typeof item.rating!=="string"||!/^(goat|dope|mid|nope|shit)[+-]?$/.test(item.rating)))fail();
    if(item.seriesId!==null&&(!groups.has(item.seriesId)||item.seriesName!==groups.get(item.seriesId)!.name)||item.seriesId===null&&item.seriesName!==null)fail();
    if(item.seasonNumber!==null&&(!id(item.seasonNumber)||item.seasonNumber>999)||!["tv","anime"].includes(item.mediaType)&&(item.seasonNumber!==null||item.seasonTitle!==null))fail();
    if(item.coverUrl!==null&&(typeof item.coverUrl!=="string"||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(item.coverUrl)))fail();
    for(const [index,viewing] of item.viewings.entries()){if(!viewing||!id(viewing.id)||viewings.has(viewing.id)||viewing.mediaId!==item.id||viewing.viewingNumber!==index+1||!day(viewing.watchedDate)||!timestamp(viewing.createdAt))fail();viewings.add(viewing.id);}
    getMediaDisplayTitle(item);
  }
  for(const series of value.series)if(series.itemCount!==value.items.filter(item=>item.seriesId===series.id).length)fail();
  if(new TextEncoder().encode(JSON.stringify(value)).length>8*1024*1024)throw new Error("Media snapshot exceeds 8 MiB; previous cache preserved");
  return value;
}
export function mediaListItems(items:MediaDetail[]):MediaListItem[]{return items.map(item=>({...item,viewingCount:item.viewings.length,latestWatchedDate:item.viewings.reduce<string|null>((date,row)=>!date||row.watchedDate>date?row.watchedDate:date,null)}));}
export function readMediaSnapshot(value:MediaReadonlySnapshot,path:string,init?:RequestInit){
  if(init?.method&&init.method!=="GET")throw new Error("Media read-only adapter refused a write");
  const match=/^\/api\/media(?:\/(series)(?:\/([1-9][0-9]*))?|\/([1-9][0-9]*))?(\?[^#]*)?$/.exec(path);
  if(!match)throw new Error("Media read-only path refused");
  let data:unknown;
  if(match[1])data=match[2]?value.series.find(row=>row.id===Number(match[2])):value.series;
  else if(match[3])data=value.items.find(row=>row.id===Number(match[3]));
  else {
    const q=new URLSearchParams(match[4]?.slice(1));
    if([...q.keys()].some(key=>!["q","mediaType","status","rating","favorite","rewatched","seriesId","limit","offset"].includes(key)))throw new Error("Media query refused");
    const offset=Number(q.get("offset")??0),limit=Number(q.get("limit")??100);if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>200)throw new Error("Media query refused");
    data=selectMediaItems(mediaListItems(value.items),{query:q.get("q")??undefined,mediaType:q.get("mediaType") as MediaListItem["mediaType"]||undefined,status:q.get("status") as MediaListItem["status"]||undefined,rating:q.get("rating") as MediaListItem["rating"]||undefined,favorite:q.has("favorite")?q.get("favorite")==="true":undefined,rewatched:q.get("rewatched")==="true",seriesId:q.has("seriesId")?Number(q.get("seriesId")):undefined,offset,limit});
  }
  return new Response(JSON.stringify(data??{error:"Not in downloaded Media snapshot"}),{status:data===undefined?404:200,headers:{"Content-Type":"application/json"}});
}
