import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

test("food time migration preserves historical times and supports optional time edits", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "evaorbit-food-time-"));
  const databasePath = path.join(directory, "food.db");
  const loader = pathToFileURL(path.join(process.cwd(), "scripts/typescript-test-loader.mjs")).href;
  function run(program) {
    const result = spawnSync(process.execPath, ["--experimental-loader", loader, "--input-type=module", "--eval", program], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, NODE_ENV: "development", EVAORBIT_DATA_BACKEND: "sqlite", EVAORBIT_SQLITE_PATH: databasePath, VERCEL: "" } });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
  try {
    run('import "./src/lib/db.ts";');
    const old = new DatabaseSync(databasePath);
    old.exec(`ALTER TABLE food_logs DROP COLUMN occurred_has_explicit_time; DELETE FROM migrations WHERE version=62;
      INSERT INTO food_logs(id,occurred_at,meal_type,title) VALUES(1,'2026-10-01T18:35:24+08:00','dinner','旧晚餐');`);
    old.close();
    run(`import assert from "node:assert/strict";
      import * as db from "./src/lib/db.ts";
      import {parseFoodLogPatch,parseNewFoodLog} from "./src/lib/validation.ts";
      const old=db.getFoodLog(1);assert.equal(old.occurredAt,"2026-10-01T18:35:24+08:00");assert.equal(old.occurredHasExplicitTime,true);
      db.updateFoodLog(1,parseFoodLogPatch({occurredAt:"2026-10-02T20:10:00+08:00",occurredHasExplicitTime:true}));
      assert.equal(db.getFoodLog(1).occurredAt,"2026-10-02T12:10:00.000Z");
      db.updateFoodLog(1,parseFoodLogPatch({occurredAt:"2026-10-02T12:00:00+08:00",occurredHasExplicitTime:false}));assert.equal(db.getFoodLog(1).occurredHasExplicitTime,false);
      db.updateFoodLog(1,parseFoodLogPatch({title:"改名"}));assert.equal(db.getFoodLog(1).occurredHasExplicitTime,false);
      assert.throws(()=>parseFoodLogPatch({occurredHasExplicitTime:"false"}));
      const created=db.createFoodLog(parseNewFoodLog({title:"只记日期",occurredAt:"2026-10-02T12:00:00+08:00",occurredHasExplicitTime:false}));assert.equal(created.occurredHasExplicitTime,false);
    `);
    run('import "./src/lib/db.ts";');
  } finally { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
});
