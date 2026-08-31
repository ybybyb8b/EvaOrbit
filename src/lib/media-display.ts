import type { MediaItem } from "./types";

export type MediaNameSource = Pick<MediaItem,"title"|"originalTitle"|"translatedTitle"|"seriesName"|"mediaType"|"seasonNumber"|"seasonTitle">;

export function mediaNameKey(value:string|null|undefined){return value?.normalize("NFKC").trim().replace(/\s+/g," ").toLocaleLowerCase()??"";}
function clean(value:string|null|undefined){const result=value?.trim();return result||null;}
function distinct(value:string|null|undefined,seen:Set<string>){const result=clean(value),key=mediaNameKey(result);if(!result||!key||seen.has(key))return null;seen.add(key);return result;}

export function getMediaDisplayTitle(item:MediaNameSource){
  const episodic=item.mediaType==="tv"||item.mediaType==="anime";
  const knownNames=[item.originalTitle,item.translatedTitle,item.seriesName].map(mediaNameKey).filter(Boolean);
  const primaryCandidates=[item.translatedTitle,item.originalTitle,episodic?item.seriesName:null,item.title];
  const seen=new Set<string>();
  let primary="Media";
  for(const candidate of primaryCandidates){const value=distinct(candidate,seen);if(value){primary=value;break;}}
  let alternate:string|null=null;
  for(const candidate of [item.originalTitle,item.translatedTitle,episodic?item.seriesName:null]){const value=distinct(candidate,seen);if(value){alternate=value;break;}}
  const seasonParts:string[]=[];
  if(item.seasonNumber)seasonParts.push(`S${item.seasonNumber}`);
  const seasonTitle=clean(item.seasonTitle);
  if(seasonTitle&&!knownNames.includes(mediaNameKey(seasonTitle))&&!seen.has(mediaNameKey(seasonTitle)))seasonParts.push(seasonTitle);
  const secondary=[alternate,...seasonParts].filter(Boolean).join(" · ")||null;
  return{primary,secondary,seasonLabel:seasonParts.join(" · ")||null};
}

export function buildMediaStorageTitle(item:Omit<MediaNameSource,"title">,fallback?:string|null){
  const display=getMediaDisplayTitle({...item,title:fallback?.trim()||"Media"});
  return [display.primary,display.seasonLabel].filter(Boolean).join(" · ").slice(0,300);
}

export function mediaMatchesQuery(item:MediaNameSource,query:string){
  const needle=mediaNameKey(query);if(!needle)return true;
  return[item.originalTitle,item.translatedTitle,item.seriesName,item.seasonTitle,item.title].some(value=>mediaNameKey(value).includes(needle));
}
