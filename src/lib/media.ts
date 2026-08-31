import { ConflictError } from "./errors.ts";
import { buildMediaStorageTitle, mediaMatchesQuery } from "./media-display.ts";
import type { EvaOrbitRepository, MediaDraftPatch, MediaListInput, NewMediaDraft } from "./repositories/types.ts";
import type { MediaDetail, MediaListItem } from "./types.ts";

export async function listMediaWithRepository(repository:EvaOrbitRepository,input:MediaListInput={}):Promise<MediaListItem[]> {
  const items=await repository.listMediaItems({...input,query:undefined,rewatched:undefined,limit:200});
  if(!items.length)return[];
  const itemIds=new Set(items.map(item=>item.id));
  const grouped=new Map<number,Awaited<ReturnType<EvaOrbitRepository["listMediaViewings"]>>>();
  for(const viewing of await repository.listMediaViewings()){
    if(!itemIds.has(viewing.mediaId))continue;
    const current=grouped.get(viewing.mediaId)??[];
    current.push(viewing);
    grouped.set(viewing.mediaId,current);
  }
  const summaries=items.map(item=>{
    const viewings=grouped.get(item.id)??[];
    const latest=viewings.reduce((value,viewing)=>viewing.watchedDate>value?viewing.watchedDate:value,"");
    return{...item,latestWatchedDate:latest||null,viewingCount:viewings.length};
  });
  const query=input.query?.trim().toLocaleLowerCase();
  return summaries
    .filter(item=>(!query||mediaMatchesQuery(item,query))&&(!input.rewatched||item.viewingCount>1))
    .sort((left,right)=>(right.latestWatchedDate??"").localeCompare(left.latestWatchedDate??"")||right.id-left.id)
    .slice(0,Math.min(Math.max(input.limit??100,1),200));
}

export async function getMediaDetailWithRepository(repository:EvaOrbitRepository,id:number):Promise<MediaDetail|null> {
  const item=await repository.getMediaItem(id);
  return item?{...item,viewings:await repository.listMediaViewings(id)}:null;
}

async function seriesName(repository:EvaOrbitRepository,id:number|null){if(!id)return null;const series=await repository.getMediaSeries(id);if(!series)throw new ConflictError("Media Series not found.");return series.name;}
function identifiable(item:{originalTitle:string|null;translatedTitle:string|null;mediaType:string},parent:string|null){return Boolean(item.originalTitle||item.translatedTitle||((["tv","anime"].includes(item.mediaType))&&parent));}

export async function createMediaWithRepository(repository:EvaOrbitRepository,input:{item:NewMediaDraft;watchedDate:string|null;legacyTitle?:string|null}):Promise<MediaDetail> {
  const parent=await seriesName(repository,input.item.seriesId);
  if(!identifiable(input.item,parent)&&!input.legacyTitle)throw new ConflictError("Media needs an original title, translated title, or episodic Series.");
  const title=buildMediaStorageTitle({...input.item,seriesName:parent},input.legacyTitle);
  const item=await repository.createMediaItem({...input.item,title});
  try{if(input.watchedDate)await repository.createMediaViewing({mediaId:item.id,watchedDate:input.watchedDate});}
  catch(error){await repository.deleteMediaItem(item.id).catch(()=>false);throw error;}
  return{...item,viewings:await repository.listMediaViewings(item.id)};
}

export async function updateMediaWithRepository(repository:EvaOrbitRepository,id:number,input:MediaDraftPatch) {
  const existing=await repository.getMediaItem(id);if(!existing)return null;
  const merged={...existing,...input};const parent=await seriesName(repository,merged.seriesId);
  const wasModern=identifiable(existing,existing.seriesName);
  if(!identifiable(merged,parent)&&wasModern)throw new ConflictError("Media needs an original title, translated title, or episodic Series.");
  const title=buildMediaStorageTitle({...merged,seriesName:parent},existing.title);
  const item=await repository.updateMediaItem(id,{...input,title});
  return item?{...item,viewings:await repository.listMediaViewings(id)}:null;
}

export async function addMediaRewatchWithRepository(repository:EvaOrbitRepository,mediaId:number,watchedDate:string) {
  const item=await repository.getMediaItem(mediaId);if(!item)throw new ConflictError("Media not found.");
  const viewing=await repository.createMediaViewing({mediaId,watchedDate});
  if(item.status!=="completed")await repository.updateMediaItem(mediaId,{status:"completed"});
  return viewing;
}

export async function updateMediaViewingWithRepository(repository:EvaOrbitRepository,mediaId:number,viewingId:number,watchedDate:string) {
  const viewing=await repository.getMediaViewing(viewingId);
  if(!viewing||viewing.mediaId!==mediaId)return null;
  return repository.updateMediaViewing(viewingId,watchedDate);
}

export async function deleteMediaViewingWithRepository(repository:EvaOrbitRepository,mediaId:number,viewingId:number) {
  const viewing=await repository.getMediaViewing(viewingId);
  if(!viewing||viewing.mediaId!==mediaId)return false;
  if(viewing.viewingNumber===1)throw new ConflictError("The first viewing cannot be deleted. Delete the Media item instead.");
  return repository.deleteMediaViewing(viewingId);
}
