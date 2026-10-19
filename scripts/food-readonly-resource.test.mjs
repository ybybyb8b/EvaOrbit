import assert from "node:assert/strict";
import test from "node:test";
import {foodResourceKey,validateFoodResource} from "../src/lib/food-readonly-resource.ts";
import {createFoodLocalReader} from "../src/lib/food-local-reader.ts";

const account="account-a",capturedAt="2026-10-19T00:00:00Z";
const resource=(kind,key,data)=>({format:"eo-food-resource-v1",accountId:account,kind,key,capturedAt,data});
const place={id:1,name:"Cafe",kind:"drink",scope:"branch",serviceType:"both",branch:"North",city:"Chengdu",category:"Cafe",rating:null,status:"occasional",notes:"",address:"",location:""};
const item={id:10,name:"Tea",brand:"Canary",foodPlaceId:1,category:"drink",referenceType:"per_serving",servingKcal:30,referenceKcal:30,referenceEnergyKj:null,servingWeight:null,defaultPortion:"1 cup",archivedAt:null};
const catalog={places:[place],library:[item],placesComplete:true,libraryComplete:true};
const detail={place,dishes:[],drinkMenu:[{id:100,foodPlaceId:1,foodLibraryId:10,name:"Tea menu",kind:"drink"}],recentFoodLogs:[],recentDrinkLogs:[],packagedFood:[{item,recordCount:1,lastRecordedAt:null}]};

test("catalog and place boundaries reject invalid paths, mismatches and oversized resources",()=>{
  for(const pair of [["catalog","../session"],["place","1?write=1"],["item","0"],["place","9007199254740992"],["other","1"]])assert.throws(()=>foodResourceKey(...pair));
  assert.equal(validateFoodResource(resource("catalog","current",catalog),account,"catalog","current").data,catalog);
  assert.throws(()=>validateFoodResource(resource("catalog","current",catalog),"other","catalog","current"));
  assert.throws(()=>validateFoodResource(resource("catalog","current",{...catalog,library:[item,item]}),account,"catalog","current"));
  assert.throws(()=>validateFoodResource(resource("place","2",detail),account,"place","2"));
  assert.throws(()=>validateFoodResource(resource("place","1",{...detail,place:{...place,notes:"x".repeat(512*1024)}}),account,"place","1"),/limit/);
  assert.equal(validateFoodResource(resource("place","1",null),account,"place","1").data,null);
});

test("original UI reads filter cached places, Library references and menus without network",async()=>{
  const values={"catalog/current":resource("catalog","current",catalog),"place/1":resource("place","1",detail),"item/10":resource("item","10",item),"place/2":resource("place","2",null)};
  const read=createFoodLocalReader(async(kind,key)=>values[kind+"/"+key]??null);
  assert.equal((await (await read("/api/food/places?city=Chengdu&purpose=food")).json()).length,1);
  assert.equal((await (await read("/api/food/places?city=Elsewhere")).json()).length,0);
  assert.equal((await (await read("/api/food/library?q=tea&placeId=1&category=drink")).json())[0].id,10);
  assert.equal((await (await read("/api/food/library/10")).json()).servingKcal,30);
  assert.equal((await (await read("/api/food/catalog?kind=drink&placeId=1&q=menu")).json())[0].menu.id,100);
  assert.equal((await read("/api/food/places/2")).status,404);
  await assert.rejects(read("/api/food/places/3"),/not been downloaded/);
  for(const path of ["https://example.invalid/api/food/places","/api/food/places/1/dishes","/api/food/../session"])await assert.rejects(read(path),/refused/);
});
