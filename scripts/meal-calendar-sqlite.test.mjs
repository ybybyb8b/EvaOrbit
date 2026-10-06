import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import test from "node:test";

test("meal migration preserves Food times; CRUD, history, Home and month summaries share reversible matching", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "eo-meal-calendar-"));
  const loader = pathToFileURL(path.join(process.cwd(), "scripts/typescript-test-loader.mjs")).href;
  const run = program => {
    const result = spawnSync(process.execPath, ["--conditions=react-server", "--experimental-loader", loader, "--input-type=module", "--eval", program], { cwd: process.cwd(), encoding: "utf8", timeout: 30000, env: { ...process.env, NODE_ENV: "development", EVAORBIT_DATA_BACKEND: "sqlite", EVAORBIT_SQLITE_PATH: path.join(directory, "qa.db"), VERCEL: "" } });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  };
  try {
    run(`import './src/lib/db.ts';import {DatabaseSync} from 'node:sqlite';const db=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);db.exec("ALTER TABLE food_logs DROP COLUMN calendar_time_enabled;DELETE FROM migrations WHERE version=71;INSERT INTO food_logs(occurred_at,meal_type,title) VALUES('2026-10-05T12:30:00+08:00','lunch','旧午餐');");db.close();`);
    run(`import assert from 'node:assert/strict';import * as db from './src/lib/db.ts';import * as food from './src/lib/services/food.ts';import {parseNewFoodLog,parseFoodLogPatch,parseNewCalendarEvent} from './src/lib/validation.ts';import {getHomeDayOverview} from './src/lib/services/home-day.ts';import {getTimelineMonthSummary} from './src/lib/services/timeline.ts';
      assert.equal(db.getFoodLog(1).occurredAt,'2026-10-05T12:30:00+08:00');assert.equal(db.getFoodLog(1).calendarTimeEnabled,true);
      const event=db.createCalendarEvent(parseNewCalendarEvent({title:'🍚吃饭饭',startAt:'2026-10-06T12:09:00+08:00',endAt:'2026-10-06T12:26:00+08:00',isAllDay:false,status:'confirmed'}));
      const record=await food.createFoodLog(parseNewFoodLog({title:'测试午餐',mealType:'lunch',occurredAt:'2026-10-06T12:30:00+08:00'}));
      assert.equal(record.occurredAt,event.startAt);assert.equal(db.getFoodLog(record.id).occurredAt,'2026-10-06T04:30:00.000Z');
      const day=await getHomeDayOverview('2026-10-06');assert.equal(day.events.length,1);assert.equal(day.events[0].endAt,event.endAt);assert.equal(day.meals.length,1);
      assert.equal((await getTimelineMonthSummary('2026-10')).days['2026-10-06'].count,1);
      await food.updateFoodLog(record.id,parseFoodLogPatch({title:'更新菜名',occurredAt:record.occurredAt,occurredHasExplicitTime:true}));assert.equal(db.getFoodLog(record.id).occurredAt,'2026-10-06T04:30:00.000Z');assert.equal(db.getFoodLog(record.id).calendarTimeEnabled,true);
      await food.updateFoodLog(record.id,parseFoodLogPatch({occurredAt:'2026-10-06T14:00:00+08:00'}));assert.equal(db.getFoodLog(record.id).calendarTimeEnabled,false);
      assert.equal((await food.listFoodLogs({date:'2026-10-06'}))[0].occurredAt,'2026-10-06T06:00:00.000Z');
      await food.updateFoodLog(record.id,{calendarTimeEnabled:true});db.updateCalendarEvent(event.id,{startAt:'2026-10-06T04:11:00.000Z'});
      assert.equal((await food.listFoodLogs({date:'2026-10-06',query:'更新菜名'}))[0].occurredAt,'2026-10-06T04:11:00.000Z');
      db.updateCalendarEvent(event.id,{status:'cancelled'});assert.equal((await food.listFoodLogs({date:'2026-10-06'}))[0].occurredAt,'2026-10-06T06:00:00.000Z');assert.equal((await getHomeDayOverview('2026-10-06')).events.length,1);
      const standalone=await food.createFoodLog(parseNewFoodLog({title:'外食晚餐',mealType:'dinner',occurredAt:'2026-10-06T12:00:00+08:00',occurredHasExplicitTime:false}));assert.equal(standalone.occurredHasExplicitTime,false);assert.equal(standalone.calendarMeal,undefined);
      assert.throws(()=>parseFoodLogPatch({calendarTimeEnabled:'false'}));
    `);
    run(`import assert from 'node:assert/strict';import * as db from './src/lib/db.ts';assert.equal(db.getFoodLog(1).occurredAt,'2026-10-05T12:30:00+08:00');`);
  } finally { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
});
