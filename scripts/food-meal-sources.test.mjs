import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { pathToFileURL } from "node:url";

test("one meal keeps several sources, counts each once and preserves product source snapshots",()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"eo-meal-sources-"));
  const databasePath=path.join(directory,"food.db");
  const loader=pathToFileURL(path.join(process.cwd(),"scripts/typescript-test-loader.mjs")).href;
  try{
    const result=spawnSync(process.execPath,["--experimental-loader",loader,"--input-type=module","--eval",`
      import assert from 'node:assert/strict';
      import * as db from './src/lib/db.ts';
      import * as food from './src/lib/services/food.ts';
      import {parseFoodPlace,parseFoodDish,parseFoodLibraryItem,parseNewFoodLog,parseFoodLogPatch} from './src/lib/validation.ts';
      const a=await food.createFoodPlace(parseFoodPlace({name:'饭店 A'}));
      const b=await food.createFoodPlace(parseFoodPlace({name:'饭店 B'}));
      const retail=await food.createFoodPlace(parseFoodPlace({name:'便利店',kind:'retail'}));
      const other=await food.createFoodPlace(parseFoodPlace({name:'新零售来源',kind:'retail'}));
      const dishes=[];
      for(const [place,name] of [[a,'主菜'],[a,'配菜'],[b,'小吃']])dishes.push(await food.createFoodDish(parseFoodDish({name,foodPlaceId:place.id})));
      const product=await food.upsertFoodLibraryItem(parseFoodLibraryItem({name:'包装饼干',category:'snack',foodPlaceId:retail.id,referenceType:'per_100g',referenceKcal:500}));
      const log=await food.createFoodLog(parseNewFoodLog({title:'两家外卖和饼干',foodPlaceId:null,foodDishIds:dishes.map(d=>d.id),foodLibraryItems:[{foodLibraryId:product.id,quantity:20,unit:'g'}],foodKcalMode:'auto'}));
      assert.equal(log.foodPlaceId,null);assert.deepEqual(log.foodPlaceIds,[a.id,b.id,retail.id]);
      assert.deepEqual(log.foodPlaces.map(p=>p.name),['饭店 A','饭店 B','便利店']);assert.equal(log.foodDishes[2].foodPlaceId,b.id);
      assert.equal(log.estimatedKcal,100);assert.equal(log.foodLibraryItems[0].item.foodPlaceId,retail.id);
      for(const place of [a,b,retail]){assert.equal(db.getFoodPlace(place.id).foodVisitCount,1);assert.equal(db.listFoodLogs({foodPlaceId:place.id})[0].id,log.id);assert.equal((await food.getFoodPlaceDetail(place.id)).recentFoodLogs[0].id,log.id);}
      assert.equal(db.getFoodPlace(a.id).visitCount,1,'two dishes from one shop still count one meal');
      assert.equal(db.getPlaceLibraryItems(retail.id)[0].item.id,product.id);assert.deepEqual(db.getPlaceLibraryItems(a.id),[]);
      await food.updateFoodLibraryItem(product.id,{foodPlaceId:other.id});
      await food.updateFoodLog(log.id,parseFoodLogPatch({description:'保留历史'}));
      assert.deepEqual(db.getFoodLog(log.id).foodPlaceIds,[a.id,b.id,retail.id]);assert.equal(db.getFoodPlace(other.id).visitCount,0);
      const edited=await food.updateFoodLog(log.id,parseFoodLogPatch({foodDishIds:dishes.slice(0,2).map(d=>d.id)}));
      assert.deepEqual(edited.foodPlaceIds,[a.id,retail.id]);assert.equal(db.getFoodPlace(b.id).visitCount,0);assert.deepEqual(db.listFoodLogs({foodPlaceId:b.id}),[]);
      const restaurant=await food.updateFoodLog(log.id,parseFoodLogPatch({foodPlaceId:b.id}));
      assert.deepEqual(restaurant.foodPlaceIds,[a.id,b.id,retail.id]);
      await food.updateFoodDish(dishes[0].id,{notes:'可以改备注'});
      assert.throws(()=>db.updateFoodDish(dishes[0].id,{foodPlaceId:b.id}),/move/);
      const drink=await food.createFoodDish(parseFoodDish({name:'仅饮品',kind:'drink',foodPlaceId:retail.id}));
      await assert.rejects(()=>food.createFoodLog(parseNewFoodLog({title:'错误',foodDishIds:[drink.id]})),/餐食/);
      const cleared=await food.updateFoodLog(log.id,parseFoodLogPatch({foodPlaceId:null,foodDishIds:[],foodLibraryItems:[]}));
      assert.deepEqual(cleared.foodPlaceIds,[]);assert.deepEqual(cleared.foodPlaces,[]);
      for(const place of [a,b,retail])assert.equal(db.getFoodPlace(place.id).frequency,0);
      const fresh=await food.createFoodLog(parseNewFoodLog({title:'新的食品来源',foodPlaceId:a.id,foodLibraryItems:[{foodLibraryId:product.id,quantity:10,unit:'g'}]}));
      assert.deepEqual(fresh.foodPlaceIds,[a.id,other.id]);assert.equal((await food.removeFoodPlace(other.id)).action,'archived');
      await food.deleteFoodLog(fresh.id);assert.equal(db.getFoodPlace(a.id).frequency,0);
    `],{encoding:"utf8",env:{...process.env,NODE_ENV:"development",VERCEL:"",EVAORBIT_DATA_BACKEND:"sqlite",EVAORBIT_SQLITE_PATH:databasePath}});
    assert.equal(result.status,0,result.stderr||result.stdout);
    const reopen=spawnSync(process.execPath,["--experimental-loader",loader,"--input-type=module","--eval","import './src/lib/db.ts'"],{encoding:"utf8",env:{...process.env,NODE_ENV:"development",VERCEL:"",EVAORBIT_DATA_BACKEND:"sqlite",EVAORBIT_SQLITE_PATH:databasePath}});
    assert.equal(reopen.status,0,reopen.stderr);
  }finally{fs.rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});
