import { ConflictError } from "./errors.ts";
import type { EvaOrbitRepository, MediaItemPatch, MediaListInput, NewMediaItem } from "./repositories/types.ts";
import type { MediaDetail, MediaListItem } from "./types.ts";

export async function listMediaWithRepository(repository:EvaOrbitRepository,input:MediaListInput={}):Promise<MediaListItem[]> {
  const items=await repository.listMediaItems(input);
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
    return{...item,latestWatchedDate:latest,viewingCount:viewings.length};
  });
  return summaries.sort((left,right)=>right.latestWatchedDate.localeCompare(left.latestWatchedDate)||right.id-left.id);
}

export async function getMediaDetailWithRepository(repository:EvaOrbitRepository,id:number):Promise<MediaDetail|null> {
  const item=await repository.getMediaItem(id);
  return item?{...item,viewings:await repository.listMediaViewings(id)}:null;
}

export async function createMediaWithRepository(repository:EvaOrbitRepository,input:{item:NewMediaItem;watchedDate:string}):Promise<MediaDetail> {
  const item=await repository.createMediaItem(input.item);
  try{await repository.createMediaViewing({mediaId:item.id,watchedDate:input.watchedDate});}
  catch(error){await repository.deleteMediaItem(item.id).catch(()=>false);throw error;}
  return{...item,viewings:await repository.listMediaViewings(item.id)};
}

export async function updateMediaWithRepository(repository:EvaOrbitRepository,id:number,input:MediaItemPatch) {
  if(!await repository.getMediaItem(id))return null;
  const item=await repository.updateMediaItem(id,input);
  return item?{...item,viewings:await repository.listMediaViewings(id)}:null;
}

export async function addMediaRewatchWithRepository(repository:EvaOrbitRepository,mediaId:number,watchedDate:string) {
  if(!await repository.getMediaItem(mediaId))throw new ConflictError("Media not found.");
  return repository.createMediaViewing({mediaId,watchedDate});
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
