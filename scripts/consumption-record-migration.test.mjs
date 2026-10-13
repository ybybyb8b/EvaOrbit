import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import test from "node:test";

test("SQLite migrates historical consumption fields before removing columns and reruns safely", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "eo-consumption-migration-"));
  const loader = pathToFileURL(path.join(process.cwd(), "scripts/typescript-test-loader.mjs")).href;
  const env = { ...process.env, EVAORBIT_SQLITE_PATH: path.join(directory, "records.db"), EVAORBIT_DATA_BACKEND: "sqlite", VERCEL: "" };
  const run = program => {
    const result = spawnSync(process.execPath, ["--conditions=react-server", "--experimental-loader", loader, "--input-type=module", "--eval", program], { env, encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  };
  try {
    run(`import './src/lib/db.ts'; import {DatabaseSync} from 'node:sqlite'; const db=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
      db.exec("ALTER TABLE food_logs ADD COLUMN portion TEXT NOT NULL DEFAULT ''; ALTER TABLE food_logs ADD COLUMN notes TEXT NOT NULL DEFAULT ''; ALTER TABLE food_logs ADD COLUMN calendar_time_enabled INTEGER DEFAULT 1; ALTER TABLE drink_logs ADD COLUMN brand TEXT NOT NULL DEFAULT ''; ALTER TABLE drink_logs ADD COLUMN volume_ml REAL; ALTER TABLE drink_logs ADD COLUMN caffeine_mg REAL; DELETE FROM migrations WHERE version=80;");
      db.exec("INSERT INTO food_logs(id,occurred_at,meal_type,title,description,portion,notes,estimated_kcal) VALUES(501,'2026-10-12T04:00:00Z','lunch','饭','明细','半碗','补充',0); INSERT INTO drink_logs(id,occurred_at,name,brand,volume_ml,caffeine_mg,notes) VALUES(502,'2026-10-12T05:00:00Z','茶','旧品牌',350,0,'半杯');"); db.close();`);
    const check = `import assert from 'node:assert/strict'; import * as db from './src/lib/db.ts'; import {DatabaseSync} from 'node:sqlite';
      const food=db.getFoodLog(501),drink=db.getDrinkLog(502);
      assert.equal(food.description,'明细\\n\\n份量说明：半碗\\n\\n补充'); assert.equal(food.estimatedKcal,0); assert.equal(food.occurredAt,'2026-10-12T04:00:00Z');
      assert.equal(drink.notes,'半杯\\n\\n品牌：旧品牌\\n\\n原记录容量：350 ml\\n\\n原记录咖啡因：0 mg'); assert.equal(drink.consumedVolumeMl,null);
      const raw=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
      for(const [table,fields] of [['food_logs',['portion','notes','calendar_time_enabled']],['drink_logs',['brand','volume_ml','caffeine_mg']]]) {
        const columns=raw.prepare('PRAGMA table_info('+table+')').all().map(column=>column.name); for(const field of fields)assert.equal(columns.includes(field),false);
      } raw.close();`;
    run(check); run(check);
  } finally { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
});
