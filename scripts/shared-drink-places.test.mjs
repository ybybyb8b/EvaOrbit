import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

test("shared places preserve legacy drinks, count both histories and archive drink references", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "evaorbit-shared-places-"));
  const databasePath = path.join(directory, "test.db");
  const loader = pathToFileURL(path.join(process.cwd(), "scripts/typescript-test-loader.mjs")).href;
  function run(program) {
    const result = spawnSync(process.execPath, ["--experimental-loader", loader, "--input-type=module", "--eval", program], { encoding: "utf8", env: { ...process.env, EVAORBIT_DATA_BACKEND: "sqlite", EVAORBIT_SQLITE_PATH: databasePath, VERCEL: "" } });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
  try {
    run('import "./src/lib/db.ts";');
    const old = new DatabaseSync(databasePath);
    old.exec(`DROP INDEX idx_drink_logs_place_occurred; ALTER TABLE drink_logs DROP COLUMN food_place_id;
      DELETE FROM migrations WHERE version=63;
      INSERT INTO drink_logs(id,occurred_at,name,brand,drink_type) VALUES(1,'2026-10-01T18:35:00+08:00','旧奶茶','原品牌','milk_tea');`);
    old.close();
    run(`import assert from "node:assert/strict";
      import * as db from "./src/lib/db.ts";
      import {parseNewDrinkLog,parseDrinkLogPatch,parseFoodPlace,parseNewFoodLog,parseFoodDish} from "./src/lib/validation.ts";
      const old=db.getDrinkLog(1);assert.equal(old.brand,"原品牌");assert.equal(old.foodPlaceId,null);assert.equal(old.occurredAt,"2026-10-01T18:35:00+08:00");
      const place=db.createFoodPlace(parseFoodPlace({name:"茶店",city:"成都",location:"高新区",branch:"一店"}));
      const drink=db.createDrinkLog(parseNewDrinkLog({name:"奶茶",brand:"品牌",foodPlaceId:place.id,occurredAt:"2026-10-03T12:00:00+08:00",occurredHasExplicitTime:false}));
      assert.equal(drink.foodPlaceName,"茶店");assert.equal(drink.foodPlaceCity,"成都");assert.equal(drink.foodPlaceBranch,"一店");
      db.createFoodLog(parseNewFoodLog({title:"蛋糕",foodPlaceId:place.id,occurredAt:"2026-10-02T12:00:00+08:00"}));
      for(const name of ["蛋糕","小食"])db.createFoodDish(parseFoodDish({foodPlaceId:place.id,name}));
      const stats=db.getFoodPlace(place.id);assert.equal(stats.foodVisitCount,1);assert.equal(stats.drinkVisitCount,1);assert.equal(stats.visitCount,2);assert.equal(stats.lastVisitedAt,drink.occurredAt);assert.equal(stats.dishCount,2);
      db.updateDrinkLog(drink.id,parseDrinkLogPatch({notes:"只改备注"}));assert.equal(db.getDrinkLog(drink.id).foodPlaceId,place.id);
      assert.throws(()=>parseNewDrinkLog({name:"invalid",foodPlaceId:1.5}));
      assert.throws(()=>db.createDrinkLog(parseNewDrinkLog({name:"invalid",foodPlaceId:999999})));
      db.updateFoodPlace(place.id,{name:"更名茶店"});assert.equal(db.getDrinkLog(drink.id).foodPlaceName,"更名茶店");
      db.updateDrinkLog(drink.id,parseDrinkLogPatch({foodPlaceId:null}));assert.equal(db.getFoodPlace(place.id).drinkVisitCount,0);
      const only=db.createFoodPlace(parseFoodPlace({name:"只有饮品的店"}));
      db.updateDrinkLog(drink.id,parseDrinkLogPatch({foodPlaceId:only.id}));assert.equal(db.listDrinkLogs({foodPlaceId:only.id}).length,1);
      assert.equal(db.removeFoodPlace(only.id).action,"archived");assert.equal(db.getDrinkLog(drink.id).foodPlaceName,"只有饮品的店");assert.equal(db.getDrinkLog(drink.id).occurredHasExplicitTime,false);
      assert.equal(db.listFoodPlaces().some(p=>p.id===only.id),false);
      const empty=db.createFoodPlace(parseFoodPlace({name:"空店"}));assert.equal(db.removeFoodPlace(empty.id).action,"deleted");
    `);
    run('import "./src/lib/db.ts";');
  } finally { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
});
