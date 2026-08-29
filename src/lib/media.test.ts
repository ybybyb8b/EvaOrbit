import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { addMediaRewatchWithRepository, createMediaWithRepository, deleteMediaViewingWithRepository, getMediaDetailWithRepository, listMediaWithRepository, updateMediaViewingWithRepository, updateMediaWithRepository } from "./media.ts";
import type { EvaOrbitRepository, MediaItemPatch, MediaListInput, NewMediaItem } from "./repositories/types.ts";
import type { MediaItem, MediaViewing } from "./types.ts";
import { parseMediaPatch, parseMediaViewing, parseNewMedia } from "./validation.ts";

function fakeMediaRepository(){
  let itemId=0,viewingId=0;
  const items:MediaItem[]=[],viewings:MediaViewing[]=[];
  const repository={
    async listMediaItems(input:MediaListInput={}){return items.filter(item=>(!input.query||item.title.includes(input.query))&&(!input.mediaType||item.mediaType===input.mediaType));},
    async getMediaItem(id:number){return items.find(item=>item.id===id)??null;},
    async createMediaItem(input:NewMediaItem){const item={...input,id:++itemId,createdAt:"now",updatedAt:"now"};items.push(item);return item;},
    async updateMediaItem(id:number,input:MediaItemPatch){const item=items.find(value=>value.id===id);if(!item)return null;Object.assign(item,input,{updatedAt:"later"});return item;},
    async deleteMediaItem(id:number){const index=items.findIndex(item=>item.id===id);if(index<0)return false;items.splice(index,1);for(let offset=viewings.length-1;offset>=0;offset--)if(viewings[offset].mediaId===id)viewings.splice(offset,1);return true;},
    async listMediaViewings(mediaId?:number){return viewings.filter(viewing=>mediaId===undefined||viewing.mediaId===mediaId).sort((a,b)=>a.mediaId-b.mediaId||a.viewingNumber-b.viewingNumber);},
    async getMediaViewing(id:number){return viewings.find(viewing=>viewing.id===id)??null;},
    async createMediaViewing(input:{mediaId:number;watchedDate:string}){const viewing={id:++viewingId,...input,viewingNumber:viewings.filter(value=>value.mediaId===input.mediaId).length+1,createdAt:"now"};viewings.push(viewing);return viewing;},
    async updateMediaViewing(id:number,watchedDate:string){const viewing=viewings.find(value=>value.id===id);if(!viewing)return null;viewing.watchedDate=watchedDate;return viewing;},
    async deleteMediaViewing(id:number){const viewing=viewings.find(value=>value.id===id);if(!viewing||viewing.viewingNumber===1)return false;viewings.splice(viewings.indexOf(viewing),1);viewings.filter(value=>value.mediaId===viewing.mediaId&&value.viewingNumber>viewing.viewingNumber).forEach(value=>value.viewingNumber-=1);return true;},
  } as unknown as EvaOrbitRepository;
  return{repository,items,viewings};
}

test("validates Media type, rating and true date-only input",()=>{
  const parsed=parseNewMedia({title:"治愈者",mediaType:"tv",watchedDate:"2026-08-29",rating:"dope+",note:"重温"});
  assert.equal(parsed.watchedDate,"2026-08-29");
  assert.equal(parsed.item.rating,"dope+");
  assert.equal(parseMediaViewing({watchedDate:"2024-02-29"}).watchedDate,"2024-02-29");
  assert.equal(parseMediaPatch({rating:null}).rating,null);
  assert.throws(()=>parseNewMedia({title:"X",mediaType:"variety",watchedDate:"2026-08-29"}));
  assert.throws(()=>parseNewMedia({title:"X",mediaType:"movie",watchedDate:"2026-02-30"}));
  assert.throws(()=>parseMediaPatch({rating:"10/10"}));
});

test("creates first viewing, manages rewatch numbering, edits and deletes consistently",async()=>{
  const{repository}=fakeMediaRepository();
  const created=await createMediaWithRepository(repository,{item:{title:"Healer",mediaType:"tv",rating:"dope+",note:null,coverUrl:null},watchedDate:"2024-03-18"});
  assert.deepEqual(created.viewings.map(viewing=>[viewing.viewingNumber,viewing.watchedDate]),[[1,"2024-03-18"]]);
  const second=await addMediaRewatchWithRepository(repository,created.id,"2025-01-01");
  const third=await addMediaRewatchWithRepository(repository,created.id,"2026-08-29");
  assert.equal(second.viewingNumber,2);assert.equal(third.viewingNumber,3);
  assert.equal((await updateMediaViewingWithRepository(repository,created.id,third.id,"2026-08-28"))?.watchedDate,"2026-08-28");
  await assert.rejects(()=>deleteMediaViewingWithRepository(repository,created.id,created.viewings[0].id),/first viewing/i);
  assert.equal(await deleteMediaViewingWithRepository(repository,created.id,second.id),true);
  assert.deepEqual((await getMediaDetailWithRepository(repository,created.id))?.viewings.map(viewing=>viewing.viewingNumber),[1,2]);
  assert.equal((await updateMediaWithRepository(repository,created.id,{title:"힐러",rating:"goat"}))?.title,"힐러");
  assert.equal(await repository.deleteMediaItem(created.id),true);
  assert.equal(await getMediaDetailWithRepository(repository,created.id),null);
  assert.deepEqual(await repository.listMediaViewings(created.id),[]);
});

test("list filtering and migration preserve ownership and RLS",async()=>{
  const{repository}=fakeMediaRepository();
  await createMediaWithRepository(repository,{item:{title:"Movie A",mediaType:"movie",rating:null,note:null,coverUrl:null},watchedDate:"2026-01-01"});
  await createMediaWithRepository(repository,{item:{title:"Anime B",mediaType:"anime",rating:"mid-",note:null,coverUrl:null},watchedDate:"2026-02-01"});
  assert.deepEqual((await listMediaWithRepository(repository,{mediaType:"anime"})).map(item=>item.title),["Anime B"]);
  assert.deepEqual((await listMediaWithRepository(repository,{query:"Movie"})).map(item=>item.title),["Movie A"]);
  const sql=readFileSync(new URL("../../supabase/migrations/202608290002_media.sql",import.meta.url),"utf8");
  assert.match(sql,/watched_date date not null/);
  assert.match(sql,/foreign key \(media_id, user_id\)/);
  assert.match(sql,/auth\.uid\(\).*user_id/s);
  assert.match(sql,/enable row level security/g);
  assert.match(sql,/to authenticated/);
  assert.match(sql,/media_viewings_owner_delete[\s\S]*viewing_number > 1/);
  assert.match(sql,/renumber_media_viewings_after_delete/);
  assert.match(sql,/grant update \(watched_date\)/i);
  assert.doesNotMatch(sql,/grant all/i);
  assert.doesNotMatch(sql,/service_role/i);
});
