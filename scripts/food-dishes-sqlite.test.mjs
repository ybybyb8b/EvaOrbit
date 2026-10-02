import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { BACKUP_SCHEMA_VERSION, BACKUP_VERSION, emptyBackupResources } from "../src/lib/data-backup.ts";

test("multiple dishes preserve legacy history, per-dish counts, archive references and atomic edits", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "evaorbit-food-dishes-"));
  const databasePath = path.join(directory, "food.db");
  const loader = pathToFileURL(path.join(process.cwd(), "scripts/typescript-test-loader.mjs")).href;
  function run(program) {
    const result = spawnSync(process.execPath, ["--experimental-loader", loader, "--input-type=module", "--eval", program], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, NODE_ENV: "development", EVAORBIT_DATA_BACKEND: "sqlite", EVAORBIT_SQLITE_PATH: databasePath, VERCEL: "" } });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
  try {
    run('import "./src/lib/db.ts";');
    const old = new DatabaseSync(databasePath);
    old.exec(`DROP TRIGGER food_logs_dishes_insert; DROP TRIGGER food_logs_dishes_legacy; DROP TRIGGER food_logs_dishes_primary; DROP TRIGGER food_dishes_remove_links; DROP TRIGGER food_dishes_keep_place;
      ALTER TABLE food_logs DROP COLUMN food_dish_ids; DELETE FROM migrations WHERE version=60;
      INSERT INTO food_places(id,name) VALUES(1,'沙县小吃');
      INSERT INTO food_dishes(id,food_place_id,name) VALUES(1,1,'鸡腿饭'),(2,1,'汤');
      INSERT INTO food_logs(id,occurred_at,meal_type,title,food_place_id,food_dish_id) VALUES(1,'2026-10-01T12:00:00+08:00','lunch','旧午餐',1,1);`);
    old.close();
    run(`
      import assert from "node:assert/strict";
      import * as db from "./src/lib/db.ts";
      import * as service from "./src/lib/services/food.ts";
      import {parseNewFoodLog,parseFoodLogPatch} from "./src/lib/validation.ts";
      assert.deepEqual(db.getFoodLog(1).foodDishIds,[1]);
      const log=await service.createFoodLog(parseNewFoodLog({title:"午餐",foodPlaceId:1,foodDishIds:[1,2,1]}));
      assert.deepEqual(log.foodDishIds,[1,2]);assert.deepEqual(log.foodDishes.map(d=>d.name),["鸡腿饭","汤"]);
      assert.equal(db.getFoodDish(1).eatCount,2);assert.equal(db.getFoodDish(2).eatCount,1);
      assert.equal(db.listFoodLogs({foodDishId:2}).length,1);assert.equal(db.listFoodLogs({query:"汤"}).length,1);
      await service.updateFoodLog(log.id,parseFoodLogPatch({title:"修改标题"}));assert.deepEqual(db.getFoodLog(log.id).foodDishIds,[1,2]);
      await service.updateFoodLog(log.id,parseFoodLogPatch({foodDishIds:[2,1]}));assert.equal(db.getFoodLog(log.id).foodDishId,2);assert.deepEqual(db.getFoodLog(log.id).foodDishIds,[2,1]);
      assert.equal(db.removeFoodDish(1).action,"archived");assert.deepEqual(db.getFoodLog(log.id).foodDishIds,[2,1]);
      const other=db.createFoodPlace({name:"别家",branch:"",city:"",location:"",category:"",rating:null,status:"occasional",notes:""});
      await assert.rejects(()=>service.updateFoodLog(log.id,parseFoodLogPatch({foodPlaceId:other.id})),/不属于/);
      assert.equal(db.getFoodLog(log.id).foodPlaceId,1);
      await service.updateFoodLog(log.id,parseFoodLogPatch({foodDishIds:[]}));assert.deepEqual(db.getFoodLog(log.id).foodDishIds,[]);assert.equal(db.getFoodLog(log.id).foodDishId,null);
      await service.updateFoodLog(log.id,parseFoodLogPatch({foodDishId:2}));assert.deepEqual(db.getFoodLog(log.id).foodDishIds,[2]);
    `);
    run('import "./src/lib/db.ts";');
    const migrated = new DatabaseSync(databasePath);
    assert.ok(migrated.prepare("SELECT 1 FROM migrations WHERE version=60").get());
    const resources = emptyBackupResources();
    migrated.exec("UPDATE food_logs SET food_dish_ids='[1,2]' WHERE id=1");
    for (const table of ["food_places", "food_dishes", "food_logs"]) resources[table] = migrated.prepare(`SELECT * FROM ${table}`).all();
    // Supabase exports arrays, whereas SQLite stores their JSON representation.
    for (const log of resources.food_logs) log.food_dish_ids = JSON.parse(log.food_dish_ids);
    const backupPath = path.join(directory, "food-backup.json");
    fs.writeFileSync(backupPath, JSON.stringify({ backup_version: BACKUP_VERSION, exported_at: new Date().toISOString(), schema: { supabase_migration: BACKUP_SCHEMA_VERSION }, source: { backend: "supabase" }, resources }));
    migrated.close();
    const restored = spawnSync(process.execPath, ["scripts/restore-backup.mjs", backupPath], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, NODE_ENV: "development", EVAORBIT_DATA_BACKEND: "sqlite", EVAORBIT_SQLITE_PATH: databasePath, VERCEL: "" } });
    assert.equal(restored.status, 0, restored.stderr || restored.stdout);
    const restoredDb = new DatabaseSync(databasePath);
    assert.equal(restoredDb.prepare("SELECT food_dish_ids FROM food_logs WHERE id=1").get().food_dish_ids, "[1,2]");
    restoredDb.close();
    const cleaned = new DatabaseSync(databasePath);
    cleaned.exec("UPDATE food_logs SET food_dish_ids='[1,2]',food_dish_id=1 WHERE id=1; DELETE FROM food_dishes WHERE id=1;");
    assert.equal(cleaned.prepare("SELECT food_dish_ids FROM food_logs WHERE id=1").get().food_dish_ids, "[2]");
    assert.equal(cleaned.prepare("SELECT food_dish_id FROM food_logs WHERE id=1").get().food_dish_id, 2);
    assert.deepEqual(cleaned.prepare("PRAGMA foreign_key_check").all(), []);
    cleaned.close();
  } finally { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
});
