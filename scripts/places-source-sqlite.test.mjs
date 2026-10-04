import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

test("place migration preserves branches, independent scopes and record-derived packaged food links",()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"eo-place-source-"));
  const databasePath=path.join(directory,"test.db");
  const run=program=>{const result=spawnSync(process.execPath,["--experimental-loader","./scripts/typescript-test-loader.mjs","--input-type=module","--eval",program],{cwd:process.cwd(),encoding:"utf8",env:{...process.env,EVAORBIT_DATA_BACKEND:"sqlite",EVAORBIT_SQLITE_PATH:databasePath,NODE_ENV:"development",VERCEL:""}});assert.equal(result.status,0,result.stderr||result.stdout);};
  try {
    run('import "./src/lib/db.ts";');
    const old=new DatabaseSync(databasePath);
    old.exec(`DROP INDEX idx_food_places_identity; DROP INDEX idx_food_logs_library;
      ALTER TABLE food_places DROP COLUMN kind; ALTER TABLE food_places DROP COLUMN scope; ALTER TABLE food_places DROP COLUMN address;
      ALTER TABLE food_logs DROP COLUMN food_library_id; DELETE FROM migrations WHERE version=67;
      CREATE UNIQUE INDEX idx_food_places_identity ON food_places(user_id,name COLLATE NOCASE,branch COLLATE NOCASE,city COLLATE NOCASE,location COLLATE NOCASE);
      INSERT INTO food_places(name,service_type,city,branch,rating,status) VALUES('原饮品门店','drink','成都','中心店','love','frequent'),('原饮品品牌','drink','','',null,'occasional');`);
    old.close();
    run(`
      import assert from "node:assert/strict";
      import * as db from "./src/lib/db.ts";
      import {parseFoodPlace,parseFoodPlacePatch,parseNewFoodLog,parseNewDrinkLog,parseFoodLibraryItem} from "./src/lib/validation.ts";
      import * as food from "./src/lib/services/food.ts";
      import * as drinks from "./src/lib/services/drink.ts";
      assert.equal(db.getFoodPlace(1).scope,"branch");assert.equal(db.getFoodPlace(1).city,"成都");assert.equal(db.getFoodPlace(1).rating,"love");assert.equal(db.getFoodPlace(1).frequency,0);
      assert.equal(db.getFoodPlace(2).scope,"brand");assert.equal(db.getFoodPlace(2).kind,"drink");
      for(const kind of ["restaurant","drink","retail","homemade","other"]) for(const scope of ["brand","branch","virtual"]) assert.equal(parseFoodPlace({name:"来源",kind,scope}).scope,scope);
      assert.equal(parseFoodPlace({name:"自制",kind:"homemade"}).scope,"virtual");assert.equal(parseFoodPlace({name:"饮品",kind:"drink"}).scope,"brand");
      assert.deepEqual(parseFoodPlacePatch({kind:"retail"}),{kind:"retail"});assert.deepEqual(parseFoodPlacePatch({scope:"branch"}),{scope:"branch"});
      const retail=await food.createFoodPlace(parseFoodPlace({name:"盒马",kind:"retail",rating:"good"}));
      const home=await food.createFoodPlace(parseFoodPlace({name:"厨房",kind:"homemade"}));
      const item=db.upsertFoodLibraryItem(parseFoodLibraryItem({name:"包装酸奶",category:"drink",dataSource:"package_label"}));
      const log=await food.createFoodLog(parseNewFoodLog({title:"早餐酸奶",scene:"packaged_food",foodPlaceId:retail.id,foodLibraryId:item.id,occurredAt:"2026-10-04T04:00:00Z",occurredHasExplicitTime:false}));
      const {drink}=await drinks.createDrinkLog(parseNewDrinkLog({name:"酸奶",foodPlaceId:retail.id,foodLibraryId:item.id,occurredAt:"2026-10-04T05:00:00Z"}));
      assert.equal(log.foodLibraryId,item.id);assert.equal(log.occurredHasExplicitTime,false);assert.equal(db.getFoodPlace(retail.id).frequency,2);assert.equal(db.getFoodPlace(retail.id).rating,"good");
      assert.equal((await food.getFoodPlaceDetail(retail.id)).packagedFood[0].recordCount,2);
      await food.updateFoodLog(log.id,{foodPlaceId:home.id});assert.equal(db.getFoodPlace(retail.id).frequency,1);assert.equal(db.getPlaceLibraryItems(home.id)[0].recordCount,1);
      await drinks.updateDrinkLog(drink.id,{notes:"仅修改备注"});assert.equal(db.getDrinkLog(drink.id).foodLibraryId,item.id);
      assert.equal(db.removeFoodLibraryItem(item.id).action,"archived");
      await food.updateFoodLog(log.id,{notes:"保留已归档关联"});
      await assert.rejects(()=>food.createFoodLog(parseNewFoodLog({title:"新记录",foodLibraryId:item.id})),/归档/);
      await food.updateFoodLog(log.id,{foodLibraryId:null});assert.deepEqual(db.getPlaceLibraryItems(home.id),[]);
      await drinks.deleteDrinkLog(drink.id);assert.equal(db.getFoodPlace(retail.id).frequency,0);assert.deepEqual(db.getPlaceLibraryItems(retail.id),[]);
      await assert.rejects(()=>food.createFoodLog(parseNewFoodLog({title:"错关联",foodLibraryId:999999})),/不存在/);
    `);
    run('import "./src/lib/db.ts";');
    const database=new DatabaseSync(databasePath);assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(),[]);assert.equal(database.prepare("SELECT COUNT(*) AS count FROM migrations WHERE version=67").get().count,1);database.close();
  } finally {fs.rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});
