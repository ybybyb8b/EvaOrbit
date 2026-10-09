import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { pathToFileURL } from "node:url";

test("drink source migration backfills only unanimous types and services inherit without rewriting history", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "evaorbit-drink-types-"));
  const databasePath = path.join(directory, "test.db");
  const loader = pathToFileURL(path.join(process.cwd(), "scripts/typescript-test-loader.mjs")).href;
  function run(program) {
    const result = spawnSync(process.execPath, ["--experimental-loader", loader, "--input-type=module", "--eval", program], { encoding: "utf8", env: { ...process.env, EVAORBIT_DATA_BACKEND: "sqlite", EVAORBIT_SQLITE_PATH: databasePath, VERCEL: "" } });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
  try {
    run('import "./src/lib/db.ts";');
    const old = new DatabaseSync(databasePath);
    try {
      old.exec(`ALTER TABLE food_dishes DROP COLUMN drink_type;
        ALTER TABLE food_library DROP COLUMN drink_type;
        DELETE FROM migrations WHERE version=73;
        INSERT INTO food_places(id,user_id,name,service_type) VALUES(1,'local','茶店','drink');
        INSERT INTO food_dishes(id,user_id,food_place_id,name,kind) VALUES(1,'local',1,'一致菜单','drink'),(2,'local',1,'混合菜单','drink');
        INSERT INTO food_library(id,name,category) VALUES(1,'一致产品','drink'),(2,'混合产品','drink');
        INSERT INTO drink_logs(id,name,drink_type,food_place_id,drink_menu_id,food_library_id,occurred_has_explicit_time,occurred_at)
        VALUES(1,'旧饮品','coffee',1,1,1,0,'2026-10-01T12:00:00+08:00'),(2,'旧饮品','other',1,1,1,0,'2026-10-02T12:00:00+08:00'),
        (3,'旧饮品','tea',1,2,2,1,'2026-10-03T12:00:00+08:00'),(4,'旧饮品','milk_tea',1,2,2,1,'2026-10-04T12:00:00+08:00'),(5,'旧水','water',NULL,NULL,NULL,0,'2026-10-05T12:00:00+08:00');`);
    } finally { old.close(); }
    run(`import assert from "node:assert/strict";
      import * as db from "./src/lib/db.ts";
      import * as food from "./src/lib/services/food.ts";
      import * as drink from "./src/lib/services/drink.ts";
      import {parseNewDrinkLog,parseDrinkLogPatch,parseFoodDish,parseFoodLibraryItem} from "./src/lib/validation.ts";
      assert.equal(db.getFoodDish(1).drinkType,'coffee');assert.equal(db.getFoodDish(2).drinkType,null);
      assert.equal(db.getFoodLibraryItem(1).drinkType,'coffee');assert.equal(db.getFoodLibraryItem(2).drinkType,null);
      const old=db.getDrinkLog(1);assert.equal(old.name,'旧饮品');assert.equal(old.foodLibraryId,1);assert.equal(old.drinkMenuId,1);assert.equal(old.occurredHasExplicitTime,false);
      assert.equal(db.getDrinkLog(2).drinkType,'other');
      const created=(await drink.createDrinkLog(parseNewDrinkLog({foodPlaceId:1,drinkMenuId:1,foodLibraryId:1}))).drink;
      assert.equal(created.drinkType,'coffee');assert.equal(created.name,'一致菜单');
      await food.updateFoodDish(1,{drinkType:'tea'});await food.updateFoodLibraryItem(1,{drinkType:'juice'});
      const unchanged=(await drink.updateDrinkLog(created.id,parseDrinkLogPatch({notes:'只改备注'}))).drink;
      assert.equal(unchanged.drinkType,'coffee');assert.equal(unchanged.foodLibraryId,1);assert.equal(unchanged.drinkMenuId,1);
      const changed=(await drink.updateDrinkLog(created.id,parseDrinkLogPatch({drinkMenuId:null,foodPlaceId:null}))).drink;
      assert.equal(changed.drinkType,'juice');
      assert.equal((await drink.createDrinkLog(parseNewDrinkLog({foodLibraryId:1}))).drink.drinkType,'juice');
      await assert.rejects(()=>food.createFoodDish(parseFoodDish({foodPlaceId:1,name:'错误菜品',kind:'food',drinkType:'tea'})),/只有饮品/);
      await assert.rejects(()=>food.upsertFoodLibraryItem(parseFoodLibraryItem({name:'错误食品',category:'snack',drinkType:'tea'})),/只有饮品/);
      assert.throws(()=>parseNewDrinkLog({drinkType:'water'}));
      assert.equal((await drink.updateDrinkLog(5,parseDrinkLogPatch({drinkType:'water',notes:'保留历史'}))).drink.drinkType,'water');
      await assert.rejects(()=>drink.updateDrinkLog(created.id,parseDrinkLogPatch({drinkType:'water'})),/停用/);
      assert.equal((await food.searchFoodLibraryForPlace('','',undefined,{category:'drink'})).length,2);
    `);
    run('import "./src/lib/db.ts";');
  } finally { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
});
