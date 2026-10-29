import type {DailySleepSummary} from "./sleep";
import type {DailyNutritionSummary,HealthRecord,MedicationDoseEvent,MedicationPreset,MenstrualFlowRecord,MenstrualPeriod,ScheduledNotification,TrainingInputSuggestions,TrainingLog,TrainingPlan,WeightRecord,WeightSettings} from "./types";
import {dateInEvaOrbit,dateRange} from "./time.ts";
import {parseTrainingPlanWrite} from "./training-plan.ts";
import { parseHealthKitReadChanges } from "./healthkit-read.ts";
import {parseTrainingSessionDetails,parseTrainingExercises} from "./validation.ts";

export type HealthReadonlySnapshot={format:"eo-health-readonly-v1";accountId:string;capturedAt:string;today:string;sleep:DailySleepSummary;records:HealthRecord[];energy:DailyNutritionSummary;energyHistory:DailyNutritionSummary[];training:TrainingLog[];recentTraining:TrainingLog[];pendingTraining?:TrainingLog[];suggestions:TrainingInputSuggestions;plan:TrainingPlan|null;weights:WeightRecord[];weightSettings:WeightSettings;periods:MenstrualPeriod[];flows:MenstrualFlowRecord[];presets:MedicationPreset[];doses:MedicationDoseEvent[];reminders:ScheduledNotification[]};
const day=(v:unknown):v is string=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const stamp=(v:unknown)=>typeof v==="string"&&Number.isFinite(Date.parse(v));
const id=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>0;
const number=(v:unknown)=>typeof v==="number"&&Number.isFinite(v);
const nullableNumber=(v:unknown)=>v===null||number(v);
const text=(v:unknown)=>typeof v==="string";
const bool=(v:unknown)=>typeof v==="boolean";
const fail=():never=>{throw new Error("Invalid or incomplete Health snapshot; previous cache preserved");};
export function validateHealthSnapshot(value:HealthReadonlySnapshot,accountId:string){
  if(!value||value.format!=="eo-health-readonly-v1"||value.accountId!==accountId||!stamp(value.capturedAt)||!day(value.today))fail();
  const groups=[value.records,value.training,value.recentTraining,value.pendingTraining??[],value.weights,value.periods,value.flows,value.presets,value.doses,value.reminders];
  const limits=[100,100,100,100,1000,31,60,100,60,1000];
  groups.forEach((rows,index)=>{if(!Array.isArray(rows)||rows.length>limits[index])fail();const ids=new Set<number>();for(const row of rows){if(!row||!id(row.id)||ids.has(row.id))fail();ids.add(row.id);}});
  for(const row of value.records)if(!stamp(row.occurredAt)||!bool(row.occurredHasExplicitTime)||!bool(row.startedHasExplicitTime)||!bool(row.endedHasExplicitTime)||!["symptom","medication","visit","test","condition","treatment","measurement","note"].includes(row.type)||!["active","resolved"].includes(row.status)||!text(row.title)||!text(row.summary)||!row.details||typeof row.details!=="object"||Array.isArray(row.details)||(row.startedAt!==null&&!stamp(row.startedAt))||(row.endedAt!==null&&!stamp(row.endedAt)))fail();
  for(const row of [...value.training,...value.recentTraining,...value.pendingTraining??[]])if(!stamp(row.occurredAt)||!bool(row.occurredHasExplicitTime)||!["cardio","strength","mixed"].includes(row.trainingType)||!Array.isArray(row.bodyParts)||row.bodyParts.some(part=>!["胸","背","腿","肩","手臂","核心","全身","其他"].includes(part))||!text(row.teacher)||!text(row.course)||!text(row.notes)||!nullableNumber(row.durationMinutes))fail();
  for(const row of [...value.training,...value.recentTraining,...value.pendingTraining??[]]) {
    if(row.planCompleted!==undefined&&!bool(row.planCompleted))fail();
    if(row.trainingContent!==undefined&&(!text(row.trainingContent)||row.trainingContent.length>5000))fail();
    if(row.workout){const parsed=parseHealthKitReadChanges([row.workout]);if(parsed[0].metric!=="workout"||parsed[0].operation!=="upsert"||!bool(row.workoutDeleted)||(row.detailsCompletedAt!==null&&!stamp(row.detailsCompletedAt)))fail();}
  }
  for(const row of value.weights)if(!stamp(row.occurredAt)||!bool(row.occurredHasExplicitTime)||!number(row.weightKg)||row.weightKg<=0||!["manual","apple_health"].includes(row.source))fail();
  for(const row of value.periods)if(!day(row.startedOn)||(row.endedOn!==null&&(!day(row.endedOn)||row.endedOn<row.startedOn))||!text(row.notes))fail();
  for(const row of value.flows)if(!stamp(row.occurredAt)||!bool(row.occurredHasExplicitTime)||!bool(row.isCycleStart)||!["none","unspecified","light","medium","heavy"].includes(row.flow)||!["manual","apple_health"].includes(row.source)||!text(row.notes))fail();
  for(const row of value.doses)if(!stamp(row.takenAt)||!id(row.medicationPresetId)||!text(row.medicationNameSnapshot)||!text(row.doseText)||!text(row.notes))fail();
  for(const row of value.presets)if(!text(row.name)||!text(row.defaultDoseText)||!number(row.minReminderIntervalMinutes)||!bool(row.reminderEnabled)||!bool(row.periodLinkEnabled)||!text(row.notes))fail();
  for(const row of value.reminders)if(!stamp(row.scheduledAt)||!text(row.title)||!text(row.sourceType))fail();
  const settings=value.weightSettings;
  if(!settings||!nullableNumber(settings.targetWeightKg)||!bool(settings.reminderEnabled)||!/^\d{2}:\d{2}$/.test(settings.reminderTime))fail();
  const suggestions=value.suggestions;
  for(const row of [...value.training,...value.recentTraining,...value.pendingTraining??[]])if(row.sessionDetails!==undefined)parseTrainingSessionDetails(row.sessionDetails);
  if(suggestions?.exercises!==undefined&&(!Array.isArray(suggestions.exercises)||suggestions.exercises.some(name=>!text(name))))fail();
  for(const presets of [suggestions?.exercisePresets,suggestions?.previousExercises])if(presets!==undefined){if(!Array.isArray(presets))fail();parseTrainingExercises(presets.map((preset,index)=>({...preset,id:String(index)})));}
  if(!suggestions||!Array.isArray(suggestions.teachers)||!Array.isArray(suggestions.courses)||!Array.isArray(suggestions.presets)||[...suggestions.teachers,...suggestions.courses].some(v=>!text(v)))fail();
  for(const row of suggestions.presets)if(!text(row.teacher)||!text(row.course)||!Array.isArray(row.bodyParts)||!["cardio","strength","mixed"].includes(row.trainingType)||!nullableNumber(row.durationMinutes))fail();
  if(value.plan!==null){parseTrainingPlanWrite({...value.plan,expectedVersion:value.plan.version});if(!Number.isSafeInteger(value.plan.version)||value.plan.version<1)fail();}
  const sleep=value.sleep;
  if(!sleep||sleep.date!==value.today||!Array.isArray(sleep.secondary)||!number(sleep.napMinutes)||!nullableNumber(sleep.efficiency)||!nullableNumber(sleep.windowMinusActualMinutes)||!bool(sleep.comparable)||!["apple_health","timeline_estimate","none"].includes(sleep.source))fail();
  for(const row of [sleep.actual,sleep.window,...sleep.secondary.map(row=>row.actual)].filter(row=>row!==null))if(!stamp(row.startAt)||!stamp(row.endAt)||!number(row.durationMinutes))fail();
  for(const actual of [sleep.actual,...sleep.secondary.map(row=>row.actual)].filter(row=>row!==null)){try{new Intl.DateTimeFormat("en",{timeZone:actual.timeZone});}catch{fail();}if(!text(actual.sourceName)||!text(actual.sourceBundle))fail();}
  if(!Array.isArray(value.energyHistory)||value.energyHistory.length>7||value.energy?.date!==value.today)fail();
  for(const energy of [value.energy,...value.energyHistory]){
    if(!day(energy.date)||!text(energy.notes))fail();
    for(const key of ["estimatedIntakeKcal","totalExpenditureKcal","energyBalance","restingEnergyKcal","activeEnergyKcal"] as const)if(!nullableNumber(energy[key]))fail();
  }
  if(new TextEncoder().encode(JSON.stringify(value)).length>8*1024*1024)throw new Error("Health snapshot exceeds 8 MiB; previous cache preserved");
  return value;
}

export function readHealthSnapshot(value:HealthReadonlySnapshot,path:string,init?:RequestInit){
  if(init?.method&&init.method!=="GET")throw new Error("Health read-only adapter refused a write");
  if(!/^\/api\/(health\/|nutrition\/daily(?:\?|$)|preferences\/weight$|notifications$)/.test(path)||path.includes("#")||path.includes("\\"))throw new Error("Health read-only path refused");
  const url=new URL(path,"https://offline.invalid"),p=url.pathname,q=url.searchParams;
  const size=q.has("limit")?Number(q.get("limit")):1000;
  if(!Number.isSafeInteger(size)||size<1||size>1000)throw new Error("Health read-only limit refused");
  const limit=<T>(rows:T[])=>rows.slice(0,size);
  const bound=(key:string)=>{const value=q.get(key);if(value===null)return null;if(day(value))return Date.parse(dateRange(value).from);if(!stamp(value))throw new Error("Health read-only date refused");return Date.parse(value);};
  const from=bound("from"),to=bound("to");
  const inRange=(when:string)=>(from===null||Date.parse(when)>=from)&&(to===null||Date.parse(when)<to);
  const period=<T extends {periodId:number|null}>(rows:T[],when:(row:T)=>string)=>limit(rows.filter(row=>(!q.has("periodId")||row.periodId===Number(q.get("periodId")))&&inRange(when(row))));
  let data:unknown;
  if(p==="/api/health/records")data=limit(value.records.filter(row=>(!q.has("type")||row.type===q.get("type"))&&(!q.has("status")||row.status===q.get("status"))));
  else if(/^\/api\/health\/records\/[1-9][0-9]*$/.test(p))data=value.records.find(row=>row.id===Number(p.split("/").at(-1)));
  else if(p==="/api/health/sleep")data=!q.has("date")||q.get("date")===value.today?value.sleep:undefined;
  else if(p==="/api/nutrition/daily")data=[value.energy,...value.energyHistory].find(row=>row.date===(q.get("date")??value.today));
  else if(p==="/api/health/weight")data=limit(value.weights.filter(row=>inRange(row.occurredAt)));
  else if(p==="/api/preferences/weight")data=value.weightSettings;
  else if(p==="/api/health/training/plan")data=value.plan;
  else if(p==="/api/health/training/suggestions")data=value.suggestions;
  else if(/^\/api\/health\/training\/[1-9][0-9]*$/.test(p))data=[...value.training,...value.recentTraining,...value.pendingTraining??[]].find(row=>row.id===Number(p.split("/").at(-1)));
  else if(p==="/api/health/training")data=limit(q.get("pendingDetails")==="true"?(value.pendingTraining??value.recentTraining.filter(row=>row.workout&&!row.workoutDeleted&&!row.detailsCompletedAt)):(q.has("date")?value.training.filter(row=>dateInEvaOrbit(new Date(row.occurredAt))===q.get("date")):value.recentTraining.filter(row=>inRange(row.occurredAt))));
  else if(p==="/api/health/periods")data=limit(value.periods.filter(row=>(q.get("activeOnly")!=="true"||!row.endedOn)&&(!q.has("from")||row.startedOn>=q.get("from")!)));
  else if(p==="/api/health/menstrual-flow")data=period(value.flows,row=>row.occurredAt);
  else if(p==="/api/health/medications")data=value.presets;
  else if(p==="/api/health/medication-doses")data=period(value.doses,row=>row.takenAt);
  else if(p==="/api/notifications")data={upcoming:value.reminders};
  else throw new Error("Health read-only path refused");
  return new Response(JSON.stringify(data===undefined?{error:"Not in downloaded Health snapshot"}:data),{status:data===undefined?404:200,headers:{"Content-Type":"application/json"}});
}
