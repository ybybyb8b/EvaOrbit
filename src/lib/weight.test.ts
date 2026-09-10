import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseNewWeightRecord, parseWeightRecordPatch, parseWeightSettings, ValidationError } from "./validation.ts";
import { formatWeightKg, normalizeWeightKg, weightRecordsInRange, weightReminderSchedules, weightTrend } from "./weight.ts";
import type { WeightRecord, WeightSettings } from "./types.ts";

function record(id:number,occurredAt:string,weightKg:number):WeightRecord{return{id,occurredAt,occurredHasExplicitTime:true,weightKg,source:"manual",healthKitSampleId:null,healthKitSourceBundle:null,healthKitSourceName:null,healthKitSyncIdentifier:`evaorbit.weight.${id}`,healthKitSyncVersion:1,createdAt:"",updatedAt:""};}
const settings:WeightSettings={targetWeightKg:60,reminderEnabled:true,reminderTime:"08:00",updatedAt:""};

test("weight trend averages multiple same-day records before the seven-day moving average",()=>{
  const records=[record(1,"2026-09-01T00:00:00Z",70),record(2,"2026-09-01T06:00:00Z",72),...Array.from({length:7},(_,index)=>record(index+3,`2026-09-${String(index+2).padStart(2,"0")}T00:00:00Z`,71-index))];
  const trend=weightTrend(records);
  assert.equal(trend[0].weightKg,71);
  assert.equal(trend.at(-1)?.movingAverageKg,68);
});

test("weight ranges and reminder scheduling use EvaOrbit calendar dates and skip recorded days",()=>{
  const now=new Date("2026-09-09T00:00:00.000Z");
  const records=[record(1,"2026-09-08T23:30:00.000Z",65),record(2,"2026-09-02T00:00:00.000Z",66)];
  assert.deepEqual(weightRecordsInRange(records,"7d",now).map(item=>item.id),[1]);
  const schedules=weightReminderSchedules(settings,records,now,2);
  assert.deepEqual(schedules.map(item=>item.date),["2026-09-10"]);
  assert.equal(schedules[0].triggerAt,"2026-09-10T00:00:00.000Z");
});

test("weight validation keeps nullable goals but never accepts a null record weight",()=>{
  assert.deepEqual(parseWeightSettings({targetWeightKg:null,reminderEnabled:false,reminderTime:"08:30"}),{targetWeightKg:null,reminderEnabled:false,reminderTime:"08:30"});
  assert.throws(()=>parseWeightRecordPatch({weightKg:null}),ValidationError);
});

test("weight precision snaps and validates at 0.05 kg while formatting two decimals",()=>{
  assert.equal(formatWeightKg(normalizeWeightKg(57.47)),"57.45");
  assert.equal(formatWeightKg(normalizeWeightKg(57.5)),"57.50");
  assert.equal(parseNewWeightRecord({occurredAt:"2026-09-10T08:00:00Z",occurredHasExplicitTime:true,weightKg:57.45}).weightKg,57.45);
  assert.throws(()=>parseNewWeightRecord({occurredAt:"2026-09-10T08:00:00Z",occurredHasExplicitTime:true,weightKg:57.43}),ValidationError);
  assert.throws(()=>parseWeightSettings({targetWeightKg:57.43,reminderEnabled:false,reminderTime:"08:30"}),ValidationError);
});

test("weight migration preserves multiple daily samples, ownership, source identity and HealthKit idempotency",()=>{
  const sql=readFileSync(new URL("../../supabase/migrations/202609090002_weight.sql",import.meta.url),"utf8");
  assert.match(sql,/create table if not exists public\.weight_records/i);
  assert.match(sql,/weight_kg numeric\(6,2\)/i);
  assert.doesNotMatch(sql,/unique[^;]*occurred_at/i);
  assert.match(sql,/healthkit_sample_id uuid/);
  assert.match(sql,/healthkit_sync_identifier text/);
  assert.match(sql,/unique index[^;]+\(user_id,healthkit_sync_identifier\)/i);
  assert.match(sql,/exists\(select 1 from public\.weight_records where user_id=p_user_id and healthkit_sync_identifier=sync_id\)/i);
  assert.match(sql,/healthkit:body-mass:write/);
  assert.match(sql,/grant select,insert,update,delete on public\.weight_records to service_role/i);
  assert.match(sql,/enable row level security/i);
  assert.match(sql,/weight_settings_owner_select/);
  assert.match(sql,/weight_settings_owner_update/);
});
