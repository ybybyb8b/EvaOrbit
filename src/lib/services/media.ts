import "server-only";

import { addMediaRewatchWithRepository, createMediaWithRepository, deleteMediaViewingWithRepository, getMediaDetailWithRepository, listMediaWithRepository, updateMediaViewingWithRepository, updateMediaWithRepository } from "../media";
import { getRepository } from "../repositories";
import type { MediaItemPatch, MediaListInput, NewMediaItem } from "../repositories/types";
import { resetMediaCover } from "./media-cover";

export async function listMedia(input:MediaListInput={}){return listMediaWithRepository(await getRepository(),input);}

export async function getMediaDetail(id:number){return getMediaDetailWithRepository(await getRepository(),id);}

export async function createMedia(input:{item:NewMediaItem;watchedDate:string|null}) {
  return createMediaWithRepository(await getRepository(),input);
}

export async function updateMedia(id:number,input:MediaItemPatch){return updateMediaWithRepository(await getRepository(),id,input);}

export async function deleteMedia(id:number){await resetMediaCover(id);return(await getRepository()).deleteMediaItem(id);}

export async function addMediaRewatch(mediaId:number,watchedDate:string){
  return addMediaRewatchWithRepository(await getRepository(),mediaId,watchedDate);
}

export async function updateMediaViewing(mediaId:number,viewingId:number,watchedDate:string){
  return updateMediaViewingWithRepository(await getRepository(),mediaId,viewingId,watchedDate);
}

export async function deleteMediaViewing(mediaId:number,viewingId:number){
  return deleteMediaViewingWithRepository(await getRepository(),mediaId,viewingId);
}

export async function listMediaSeries(){return(await getRepository()).listMediaSeries();}
export async function getMediaSeries(id:number){return(await getRepository()).getMediaSeries(id);}
export async function createMediaSeries(name:string){return(await getRepository()).createMediaSeries(name);}
