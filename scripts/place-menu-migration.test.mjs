import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

test("place menu migration classifies explicit legacy links and preserves record choices", () => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"evaorbit-place-menu-"));
  const databasePath=path.join(directory,"test.db");
  const loader=pathToFileURL(path.join(process.cwd(),"scripts/typescript-test-loader.mjs")).href;
  function run(program){const result=spawnSync(process.execPath,["--experimental-loader",loader,"--input-type=module","--eval",program],{encoding:"utf8",env:{...process.env,EVAORBIT_DATA_BACKEND:"sqlite",EVAORBIT_SQLITE_PATH:databasePath,VERCEL:""}});assert.equal(result.status,0,result.stderr||result.stdout);}
  try {
    run('import "./src/lib/db.ts";');
    const old=new DatabaseSync(databasePath);
    try {old.exec(`DROP INDEX idx_drink_logs_menu;
      ALTER TABLE drink_logs DROP COLUMN drink_menu_id;
      DROP INDEX idx_food_dishes_identity;
      ALTER TABLE food_dishes DROP COLUMN kind;
      CREATE UNIQUE INDEX idx_food_dishes_identity ON food_dishes(user_id,food_place_id,lower(name));
      ALTER TABLE food_places DROP COLUMN service_type;
      DELETE FROM migrations WHERE version=66;
      INSERT INTO food_places(id,user_id,name) VALUES(1,'local','饭店'),(2,'local','茶店'),(3,'local','混合店'),(4,'local','菜品加饮品店'),(5,'local','名字带奶茶的未知店');
      INSERT INTO drink_logs(id,name,food_place_id,sugar_level,temperature,occurred_has_explicit_time,occurred_at) VALUES(1,'旧饮品',2,'无糖','hot',0,'2026-10-01T12:00:00+08:00'),(2,'旧饮品',3,'半糖','less_ice',1,'2026-10-01T12:00:00+08:00'),(3,'旧饮品',4,'标准','normal_ice',1,'2026-10-01T12:00:00+08:00');
      INSERT INTO food_logs(title,food_place_id,occurred_at,meal_type) VALUES('旧吃饭',3,'2026-10-01T12:00:00+08:00','lunch');
      INSERT INTO food_dishes(user_id,food_place_id,name) VALUES('local',4,'旧菜');`);}finally {old.close();}
    run(`import assert from "node:assert/strict";import * as db from "./src/lib/db.ts";
      assert.deepEqual([1,2,3,4,5].map(id=>db.getFoodPlace(id).serviceType),['food','drink','both','both','food']);
      const old=db.getDrinkLog(1);assert.equal(old.name,'旧饮品');assert.equal(old.sugarLevel,'无糖');assert.equal(old.temperature,'hot');assert.equal(old.occurredHasExplicitTime,false);assert.equal(old.drinkMenuId,null);
      assert.equal(db.listFoodDishes('',{kind:'drink'}).length,0);assert.equal(db.getFoodDish(1).kind,'food');
      assert.equal(db.getFoodPlace(4).dishCount,1);assert.equal(db.getFoodPlace(4).drinkMenuCount,0);
      assert.deepEqual(new Set(db.listFoodPlaces('',{purpose:'drink'}).map(p=>p.id)),new Set([2,3,4]));
    `);
    run('import "./src/lib/db.ts";');
  } finally {fs.rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});
