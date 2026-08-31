import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getMediaDisplayTitle, mediaMatchesQuery } from "./media-display.ts";
import { addMediaRewatchWithRepository, createMediaWithRepository, deleteMediaViewingWithRepository, getMediaDetailWithRepository, listMediaWithRepository, updateMediaViewingWithRepository, updateMediaWithRepository } from "./media.ts";
import type { EvaOrbitRepository, MediaItemPatch, MediaListInput, NewMediaItem } from "./repositories/types.ts";
import type { MediaItem, MediaViewing } from "./types.ts";
import { parseMediaPatch, parseMediaViewing, parseNewMedia } from "./validation.ts";

function fakeMediaRepository(){
  let itemId=0,viewingId=0;
  const items:MediaItem[]=[],viewings:MediaViewing[]=[];
  const repository={
    async listMediaItems(input:MediaListInput={}){return items.filter(item=>(!input.query||item.title.includes(input.query))&&(!input.mediaType||item.mediaType===input.mediaType)&&(!input.status||item.status===input.status)&&(!input.rating||item.rating===input.rating)&&(input.favorite===undefined||item.isFavorite===input.favorite)&&(!input.seriesId||item.seriesId===input.seriesId));},
    async getMediaItem(id:number){return items.find(item=>item.id===id)??null;},
    async getMediaSeries(id:number){return id===1?{id:1,name:"Reacher",createdAt:"now",updatedAt:"now"}:null;},
    async createMediaItem(input:NewMediaItem){const item={...input,seriesName:null,id:++itemId,createdAt:"now",updatedAt:"now"};items.push(item);return item;},
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
  const season=parseNewMedia({title:"Black Mirror",mediaType:"tv",status:"completed",watchedDate:"2026-08-29",seasonNumber:3,seasonTitle:"Part 2",isFavorite:true});
  assert.equal(season.item.seasonNumber,3);assert.equal(season.item.isFavorite,true);
  assert.throws(()=>parseNewMedia({title:"Movie",mediaType:"movie",status:"completed",watchedDate:"2026-08-29",seasonNumber:1}),/Season/);
  assert.equal(parseNewMedia({title:"Next",mediaType:"movie",status:"planned"}).watchedDate,null);
  assert.equal(parseNewMedia({mediaType:"tv",status:"planned",seriesId:1,seasonNumber:1}).item.originalTitle,null);
  assert.throws(()=>parseNewMedia({mediaType:"movie",status:"planned"}),/原名|译名/);
});

test("uses one deduplicated display title and searches every compatible name",()=>{
  const localized:MediaItem={id:1,title:"侠探杰克 · S1",originalTitle:"Reacher",translatedTitle:"侠探杰克",mediaType:"tv",status:"completed",rating:null,isFavorite:false,note:null,coverUrl:null,seriesId:1,seriesName:"Reacher",seasonNumber:1,seasonTitle:null,createdAt:"now",updatedAt:"now"};
  assert.deepEqual(getMediaDisplayTitle(localized),{primary:"侠探杰克",secondary:"Reacher · S1",seasonLabel:"S1"});
  assert.equal(mediaMatchesQuery(localized,"Reacher"),true);
  assert.equal(mediaMatchesQuery(localized,"侠探"),true);
  const plain={...localized,title:"Reacher · S1",translatedTitle:null,seasonTitle:"Reacher"};
  assert.deepEqual(getMediaDisplayTitle(plain),{primary:"Reacher",secondary:"S1",seasonLabel:"S1"});
  const named={...plain,seasonNumber:2,seasonTitle:"The Final Chapter"};
  assert.equal(getMediaDisplayTitle(named).secondary,"S2 · The Final Chapter");
  assert.equal(mediaMatchesQuery(named,"final chapter"),true);
  assert.equal(getMediaDisplayTitle({...localized,title:"Legacy",originalTitle:null,translatedTitle:null,seriesName:null}).primary,"Legacy");
});

test("creates first viewing, manages rewatch numbering, edits and deletes consistently",async()=>{
  const{repository}=fakeMediaRepository();
  const created=await createMediaWithRepository(repository,{item:{originalTitle:"Healer",translatedTitle:null,mediaType:"tv",status:"completed",rating:"dope+",isFavorite:true,note:null,coverUrl:null,seriesId:null,seasonNumber:1,seasonTitle:null},watchedDate:"2024-03-18"});
  assert.deepEqual(created.viewings.map(viewing=>[viewing.viewingNumber,viewing.watchedDate]),[[1,"2024-03-18"]]);
  const second=await addMediaRewatchWithRepository(repository,created.id,"2025-01-01");
  const third=await addMediaRewatchWithRepository(repository,created.id,"2026-08-29");
  assert.equal(second.viewingNumber,2);assert.equal(third.viewingNumber,3);
  assert.equal((await updateMediaViewingWithRepository(repository,created.id,third.id,"2026-08-28"))?.watchedDate,"2026-08-28");
  await assert.rejects(()=>deleteMediaViewingWithRepository(repository,created.id,created.viewings[0].id),/first viewing/i);
  assert.equal(await deleteMediaViewingWithRepository(repository,created.id,second.id),true);
  assert.deepEqual((await getMediaDetailWithRepository(repository,created.id))?.viewings.map(viewing=>viewing.viewingNumber),[1,2]);
  assert.equal((await updateMediaWithRepository(repository,created.id,{translatedTitle:"힐러",rating:"goat"}))?.title,"힐러 · S1");
  assert.equal(await repository.deleteMediaItem(created.id),true);
  assert.equal(await getMediaDetailWithRepository(repository,created.id),null);
  assert.deepEqual(await repository.listMediaViewings(created.id),[]);
});

test("list filtering and migration preserve ownership and RLS",async()=>{
  const{repository}=fakeMediaRepository();
  await createMediaWithRepository(repository,{item:{originalTitle:"Movie A",translatedTitle:null,mediaType:"movie",status:"completed",rating:null,isFavorite:false,note:null,coverUrl:null,seriesId:null,seasonNumber:null,seasonTitle:null},watchedDate:"2026-01-01"});
  await createMediaWithRepository(repository,{item:{originalTitle:"Anime B",translatedTitle:null,mediaType:"anime",status:"completed",rating:"mid-",isFavorite:false,note:null,coverUrl:null,seriesId:null,seasonNumber:2,seasonTitle:"Part 2"},watchedDate:"2026-02-01"});
  assert.deepEqual((await listMediaWithRepository(repository,{mediaType:"anime"})).map(item=>item.title),["Anime B · S2 · Part 2"]);
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
  const collectionSql=readFileSync(new URL("../../supabase/migrations/202608310004_media_collection.sql",import.meta.url),"utf8");
  assert.match(collectionSql,/create table if not exists public\.media_series/);
  assert.match(collectionSql,/foreign key \(series_id, user_id\)/);
  assert.match(collectionSql,/season_number/);
  assert.match(collectionSql,/default 'completed'/);
  assert.match(collectionSql,/media-covers/);
  assert.match(collectionSql,/enable row level security/);
  const titleSql=readFileSync(new URL("../../supabase/migrations/202608310005_media_titles.sql",import.meta.url),"utf8");
  assert.match(titleSql,/add column if not exists original_title/);
  assert.match(titleSql,/add column if not exists translated_title/);
  assert.doesNotMatch(titleSql,/\b(update|delete|truncate)\b/i);
});
