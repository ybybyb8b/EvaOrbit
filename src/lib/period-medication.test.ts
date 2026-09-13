import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseNewMedicationDoseEvent,parseNewMedicationPreset,parseNewMenstrualFlowRecord,parseNewMenstrualPeriod,ValidationError } from "./validation.ts";
import { activePeriodMedicationPeriod, periodMedicationReminderProjection, periodMedicationWindow } from "./period-medication-reminder.ts";
import type { MedicationDoseEvent, MedicationPreset, MenstrualPeriod } from "./types.ts";
import { reminderNotificationCopy } from "./notification-copy.ts";

test("period and menstrual flow validation preserve date-only and category semantics",()=>{
  assert.deepEqual(parseNewMenstrualPeriod({startedOn:"2026-09-13",endedOn:null,notes:""}),{startedOn:"2026-09-13",endedOn:null,notes:""});
  const flow=parseNewMenstrualFlowRecord({periodId:3,occurredAt:"2026-09-13T04:00:00.000Z",occurredHasExplicitTime:false,flow:"heavy",isCycleStart:true,notes:""});
  assert.equal(flow.flow,"heavy");assert.equal(flow.occurredHasExplicitTime,false);
  assert.throws(()=>parseNewMenstrualFlowRecord({periodId:null,occurredAt:"2026-09-13T04:00:00.000Z",flow:"medium",isCycleStart:true}),ValidationError);
  assert.throws(()=>parseNewMenstrualPeriod({startedOn:"2026-09-14",endedOn:"2026-09-13"}),ValidationError);
});

test("medication dose requires an explicit taken date and time",()=>{
  assert.throws(()=>parseNewMedicationDoseEvent({medicationPresetId:1,periodId:null,takenAt:"2026-09-13",doseText:"2片",notes:""}),ValidationError);
  assert.equal(parseNewMedicationDoseEvent({medicationPresetId:1,periodId:null,takenAt:"2026-09-13T08:30:00+08:00",doseText:"2片",notes:""}).doseText,"2片");
});

test("medication inputs are user configured facts without name-based inference",()=>{
  const preset=parseNewMedicationPreset({name:"User supplied name",defaultDoseText:"User supplied amount",minReminderIntervalMinutes:375,reminderEnabled:true,periodLinkEnabled:true,notes:""});
  assert.equal(preset.minReminderIntervalMinutes,375);
  assert.equal(preset.defaultDoseText,"User supplied amount");
  assert.throws(()=>parseNewMedicationPreset({...preset,minReminderIntervalMinutes:0}),ValidationError);
  const dose=parseNewMedicationDoseEvent({medicationPresetId:4,periodId:2,takenAt:"2026-09-13T06:30:00.000Z",doseText:"one record",notes:""});
  assert.deepEqual(Object.keys(dose).sort(),["doseText","medicationPresetId","notes","periodId","takenAt"]);
});

test("phase 2.5 keeps period association in the business service and the empty Health state explicit",()=>{
  const service=readFileSync(new URL("./services/period-medication.ts",import.meta.url),"utf8");
  const section=readFileSync(new URL("../app/health/period-medication-section.tsx",import.meta.url),"utf8");
  assert.match(service,/activePeriodFor\(input\.occurredAt\)/);
  assert.match(service,/activePeriodFor\(input\.takenAt\)/);
  assert.match(section,/StartPeriodEditor/);
  assert.match(section,/Taken date/);
  assert.match(section,/Taken time/);
  assert.doesNotMatch(section,/setDoseText\(presets\.find/);
});

test("phase one migration separates business facts and adds no notification schedule table",()=>{
  const sql=readFileSync(new URL("../../supabase/migrations/202609130001_period_medication.sql",import.meta.url),"utf8");
  for(const table of ["menstrual_periods","menstrual_flow_records","medication_presets","medication_dose_events"])assert.match(sql,new RegExp(`create table if not exists public\\.${table}`,"i"));
  assert.match(sql,/foreign key\(medication_preset_id,user_id\)/i);
  assert.match(sql,/foreign key\(period_id,user_id\)/i);
  assert.doesNotMatch(sql,/create table[^;]*notification[^;]*schedule/i);
  assert.doesNotMatch(sql,/healthkit_/i);
});

const period:MenstrualPeriod={id:3,startedOn:"2026-09-13",endedOn:null,notes:"",createdAt:"",updatedAt:""};
const preset:MedicationPreset={id:4,name:"User supplied name",defaultDoseText:"",minReminderIntervalMinutes:360,reminderEnabled:true,periodLinkEnabled:true,notes:"",archivedAt:null,createdAt:"",updatedAt:""};
const dose:MedicationDoseEvent={id:5,medicationPresetId:4,periodId:3,takenAt:"2026-09-13T01:00:00.000Z",medicationNameSnapshot:"User supplied name",doseText:"",notes:"",createdAt:"",updatedAt:""};

test("period medication projection uses the latest real dose and a three-day local window",()=>{
  assert.deepEqual(periodMedicationWindow(period),{from:"2026-09-12T16:00:00.000Z",to:"2026-09-15T16:00:00.000Z"});
  assert.equal(periodMedicationWindow({...period,endedOn:"2026-09-13"}).to,"2026-09-13T16:00:00.000Z");
  assert.equal(activePeriodMedicationPeriod([period],new Date("2026-09-13T02:00:00.000Z"))?.id,3);
  const projected=periodMedicationReminderProjection(preset,period,[dose,{...dose,id:6,takenAt:"2026-09-13T03:00:00.000Z"}],new Date("2026-09-13T04:00:00.000Z"));
  assert.equal(projected?.startsAt,"2026-09-13T03:00:00.000Z");
  assert.equal(projected?.nextDueAt,"2026-09-13T09:00:00.000Z");
  assert.equal(projected?.endsAt,"2026-09-15T16:00:00.000Z");
});

test("period medication projection stops for disabled links, ended windows, and intervals beyond the window",()=>{
  assert.equal(periodMedicationReminderProjection({...preset,reminderEnabled:false},period,[dose],new Date("2026-09-13T04:00:00.000Z")),null);
  assert.equal(periodMedicationReminderProjection({...preset,periodLinkEnabled:false},period,[dose],new Date("2026-09-13T04:00:00.000Z")),null);
  assert.equal(periodMedicationReminderProjection(preset,period,[{...dose,takenAt:"2026-09-15T14:00:00.000Z"}],new Date("2026-09-15T14:30:00.000Z")),null);
  assert.equal(periodMedicationReminderProjection(preset,period,[dose],new Date("2026-09-15T16:00:00.000Z")),null);
});

test("phase two migration adds one Reminder projection per preset without a schedule table",()=>{
  const sql=readFileSync(new URL("../../supabase/migrations/202609130002_period_medication_reminder_projection.sql",import.meta.url),"utf8");
  assert.match(sql,/target_type in \('cat','cat_household','tracker','health'\)/i);
  assert.match(sql,/unique index[^;]*user_id,source_type,source_id[^;]*period_medication/is);
  assert.doesNotMatch(sql,/create table[^;]*notification[^;]*schedule/i);
});

test("period medication notification copy is optional rather than directive",()=>{
  const copy=reminderNotificationCopy({title:"Pain relief",sourceType:"period_medication"},"zh-CN");
  assert.match(copy.body,/如仍有需要/);
  assert.doesNotMatch(copy.body,/该吃药了|必须服用/);
});
