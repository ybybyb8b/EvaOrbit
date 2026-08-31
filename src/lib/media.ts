import { ConflictError } from "./errors.ts";
import type { EvaOrbitRepository, MediaItemPatch, MediaListInput, NewMediaItem } from "./repositories/types.ts";
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
    .filter(item=>(!query||item.title.toLocaleLowerCase().includes(query)||item.seriesName?.toLocaleLowerCase().includes(query))&&(!input.rewatched||item.viewingCount>1))
    .sort((left,right)=>(right.latestWatchedDate??"").localeCompare(left.latestWatchedDate??"")||right.id-left.id)
    .slice(0,Math.min(Math.max(input.limit??100,1),200));
}

export async function getMediaDetailWithRepository(repository:EvaOrbitRepository,id:number):Promise<MediaDetail|null> {
  const item=await repository.getMediaItem(id);
  return item?{...item,viewings:await repository.listMediaViewings(id)}:null;
}

export async function createMediaWithRepository(repository:EvaOrbitRepository,input:{item:NewMediaItem;watchedDate:string|null}):Promise<MediaDetail> {
  const item=await repository.createMediaItem(input.item);
  try{if(input.watchedDate)await repository.createMediaViewing({mediaId:item.id,watchedDate:input.watchedDate});}
  catch(error){await repository.deleteMediaItem(item.id).catch(()=>false);throw error;}
  return{...item,viewings:await repository.listMediaViewings(item.id)};
}

export async function updateMediaWithRepository(repository:EvaOrbitRepository,id:number,input:MediaItemPatch) {
  if(!await repository.getMediaItem(id))return null;
  const item=await repository.updateMediaItem(id,input);
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
