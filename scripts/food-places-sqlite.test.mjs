import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

test("food place migration preserves existing shops and distinguishes cities and locations", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "evaorbit-food-places-"));
  const databasePath = path.join(directory, "food.db");
  const loader = pathToFileURL(path.join(process.cwd(), "scripts/typescript-test-loader.mjs")).href;
  const run = (program) => {
    const result = spawnSync(process.execPath, ["--experimental-loader", loader, "--input-type=module", "--eval", program], {
      cwd: process.cwd(), encoding: "utf8",
      env: { ...process.env, NODE_ENV: "development", EVAORBIT_DATA_BACKEND: "sqlite", EVAORBIT_SQLITE_PATH: databasePath, VERCEL: "" },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  };
  try {
    run('import "./src/lib/db.ts";');
    // Recreate the pre-location schema with an existing shop and linked history.
    const database = new DatabaseSync(databasePath);
    try { database.exec(`DROP INDEX idx_food_places_identity;
      ALTER TABLE food_places DROP COLUMN city;
      ALTER TABLE food_places DROP COLUMN location;
      CREATE UNIQUE INDEX idx_food_places_identity ON food_places(user_id,name COLLATE NOCASE,branch COLLATE NOCASE);
      DELETE FROM migrations WHERE version=59;
      INSERT INTO food_places(id,user_id,name,branch) VALUES(1,'local','米线店','中心店');
      INSERT INTO food_logs(occurred_at,meal_type,title,food_place_id) VALUES('2026-10-01T12:00:00+08:00','lunch','旧午餐',1);`);
    } finally { database.close(); }
    run(`
      import assert from "node:assert/strict";
      import * as food from "./src/lib/db.ts";
      const old=food.getFoodPlace(1);
      assert.equal(old.city,"");assert.equal(old.location,"");assert.equal(old.visitCount,1);
      const input={name:"米线店",branch:"中心店",city:"成都",location:"高新区",category:"米线",rating:null,status:"occasional",notes:""};
      const chengdu=food.createFoodPlace(input);
      const chongqing=food.createFoodPlace({...input,city:"重庆"});
      const another=food.createFoodPlace({...input,location:"锦江区"});
      assert.throws(()=>food.createFoodPlace(input),/UNIQUE/);
      assert.deepEqual(food.listFoodPlaces("重庆").map(place=>place.id),[chongqing.id]);
      assert.deepEqual(food.listFoodPlaces("锦江区").map(place=>place.id),[another.id]);
      assert.equal(food.listFoodPlaces("成都").length,2);
      food.updateFoodPlace(1,{city:"杭州",location:"湖滨"});
      assert.equal(food.listFoodLogs({foodPlaceId:1})[0].foodPlaceCity,"杭州");
      assert.equal(food.getFoodLog(food.listFoodLogs({foodPlaceId:1})[0].id).foodPlaceLocation,"湖滨");
      food.updateFoodPlace(chengdu.id,{city:"",location:""});
      assert.equal(food.getFoodPlace(chengdu.id).city,"");
    `);
    run('import "./src/lib/db.ts";');
    const migrated = new DatabaseSync(databasePath, { readOnly: true });
    assert.ok(migrated.prepare("SELECT 1 FROM migrations WHERE version=59").get());
    assert.deepEqual(migrated.prepare("PRAGMA foreign_key_check").all(), []);
    migrated.close();
  } finally {
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});
