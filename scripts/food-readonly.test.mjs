import assert from "node:assert/strict";
import test from "node:test";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import {validateFoodSnapshot} from "../src/lib/food-readonly.ts";

test("Food snapshots reject account mismatch, duplicate records and oversized data",()=>{
  const value={format:"eo-food-readonly-v1",accountId:"a",capturedAt:"2026-10-19T00:00:00Z",home:{date:"2026-10-19",brief:{},insights:[],limits:[],limitStatuses:[]},foods:[],drinks:[],window:{from:"2026-09-20",to:"2026-10-19",foodComplete:true,drinkComplete:true}};
  assert.equal(validateFoodSnapshot(value,"a"),value);
  assert.throws(()=>validateFoodSnapshot(value,"b"));
  assert.throws(()=>validateFoodSnapshot({...value,foods:[{id:1,occurredAt:value.capturedAt},{id:1,occurredAt:value.capturedAt}]},"a"));
  assert.throws(()=>validateFoodSnapshot({...value,window:{...value.window,to:"2026-10-20"}},"a"));
  assert.throws(()=>validateFoodSnapshot({...value,extra:"x".repeat(8*1024*1024)},"a"),/limit/);
});

test("Food services preserve date-only and historical links under a database write blockade",()=>{
  const directory=mkdtempSync(path.join(tmpdir(),"eo-food-readonly-"));
  try{
    const result=spawnSync(process.execPath,["--experimental-loader",pathToFileURL(path.resolve("scripts/typescript-test-loader.mjs")).href,"--input-type=module","--eval",String.raw`
      import assert from 'node:assert/strict';
      import {DatabaseSync} from 'node:sqlite';
      import {getRepository,withFoodReadOnlyRepository} from './src/lib/repositories/index.ts';
      import {getFoodDrinkHome} from './src/lib/services/food-drink-home.ts';
      import {createFoodLog,listFoodLogs,createFoodPlace,upsertFoodLibraryItem,createFoodDish,listFoodPlaces,searchFoodLibrary,getFoodPlaceDetail,getFoodLibraryItem} from './src/lib/services/food.ts';
      import {createDrinkLog,listDrinkLogs} from './src/lib/services/drink.ts';
      import {parseNewFoodLog,parseNewDrinkLog,parseFoodPlace,parseFoodLibraryItem,parseFoodDish} from './src/lib/validation.ts';
      import {dateInEvaOrbit} from './src/lib/time.ts';
      const date=dateInEvaOrbit();
      const place=await createFoodPlace(parseFoodPlace({name:'Read-only place',serviceType:'both'}));
      const library=await upsertFoodLibraryItem(parseFoodLibraryItem({name:'Nutrition reference',category:'snack',foodPlaceId:place.id,servingKcal:100}));
      await createFoodDish(parseFoodDish({name:'Read-only dish',kind:'food',foodPlaceId:place.id,foodLibraryId:library.id}));
      await createFoodLog(parseNewFoodLog({title:'Food offline canary',occurredAt:date,occurredHasExplicitTime:false,mealType:'lunch',scene:'other'}));
      await createDrinkLog(parseNewDrinkLog({name:'Drink offline canary',drinkType:'tea',occurredAt:date,occurredHasExplicitTime:false}));
      const connection=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
      const tables=connection.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
      for(const {name} of tables)for(const op of ['INSERT','UPDATE','DELETE'])connection.exec('CREATE TRIGGER "no_write_'+op+'_'+name+'" BEFORE '+op+' ON "'+name+'" BEGIN SELECT RAISE(ABORT,\'Read-only Food wrote data\'); END;');
      const home=await withFoodReadOnlyRepository(()=>getFoodDrinkHome());
      assert.equal(home.brief.foodCount,1);assert.equal(home.brief.drinkCount,1);
      const foods=await withFoodReadOnlyRepository(()=>listFoodLogs({date}));
      const drinks=await withFoodReadOnlyRepository(()=>listDrinkLogs({date}));
      assert.equal(foods[0].occurredHasExplicitTime,false);assert.equal(drinks[0].occurredHasExplicitTime,false);
      assert.equal((await withFoodReadOnlyRepository(()=>listFoodPlaces('',{limit:200})))[0].id,place.id);
      assert.equal((await withFoodReadOnlyRepository(()=>searchFoodLibrary()))[0].id,library.id);
      assert.equal((await withFoodReadOnlyRepository(()=>getFoodPlaceDetail(place.id))).dishes.length,1);
      assert.equal((await withFoodReadOnlyRepository(()=>getFoodLibraryItem(library.id))).servingKcal,100);
      await assert.rejects(withFoodReadOnlyRepository(async()=>(await getRepository()).deleteFoodLog(foods[0].id)),/refused/);
      await assert.rejects(withFoodReadOnlyRepository(async()=>(await getRepository()).createDrinkLimit({name:'Forbidden'})),/refused/);
      connection.close();
    `],{encoding:"utf8",env:{...process.env,EVAORBIT_DATA_BACKEND:"sqlite",EVAORBIT_SQLITE_PATH:path.join(directory,"test.db"),VERCEL:""}});
    assert.equal(result.status,0,result.stderr||result.stdout);
  }finally{rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});
