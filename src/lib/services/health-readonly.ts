import "server-only";
import {getRepository,withHealthReadOnlyRepository} from "../repositories";
import {getDailySleepSummary} from "./sleep";
import {getDailyNutritionSummary,listDailyNutritionHistory} from "./nutrition";
import {getTrainingInputSuggestions,listTrainingLogs} from "./training";
import {listScheduledNotifications} from "./reminder";
import {dateInEvaOrbit,dateRange,shiftDate} from "../time";
import {healthPeriodHistoryFrom} from "../health-period-range";
import {PERIOD_MEDICATION_REMINDER_SOURCE} from "../reminder-source-registry";
import {validateHealthSnapshot} from "../health-readonly";

export async function getHealthReadonlySnapshot(accountId:string){return withHealthReadOnlyRepository(async()=>{
  const repo=await getRepository(),today=dateInEvaOrbit(),from=healthPeriodHistoryFrom(today),instant=dateRange(from).from;
  const [sleep,records,energy,energyHistory,training,recentTraining,suggestions,plan,weights,weightSettings,periods,active,flows,presets,doses,notifications]=await Promise.all([
    getDailySleepSummary(today),repo.listHealthRecords({limit:100}),getDailyNutritionSummary(today),listDailyNutritionHistory(7),
    listTrainingLogs({date:today,limit:100}),listTrainingLogs({from:dateRange(shiftDate(today,-6)).from,to:dateRange(shiftDate(today,1)).from,limit:100}),getTrainingInputSuggestions(),repo.getTrainingPlan(),
    repo.listWeightRecords({limit:1000}),repo.getWeightSettings(),repo.listMenstrualPeriods({from,limit:30}),repo.listMenstrualPeriods({activeOnly:true,limit:1}),
    repo.listMenstrualFlowRecords({from:instant,limit:30}),repo.listMedicationPresets({limit:100}),repo.listMedicationDoseEvents({from:instant,limit:30}),listScheduledNotifications(new Date(),{readOnly:true}),
  ]);
  const old=active.find(row=>row.startedOn<from);
  const [olderFlows,olderDoses]=old?await Promise.all([repo.listMenstrualFlowRecords({periodId:old.id,limit:30}),repo.listMedicationDoseEvents({periodId:old.id,limit:30})]):[[],[]];
  const unique=<T extends {id:number}>(rows:T[])=>[...new Map(rows.map(row=>[row.id,row])).values()];
  return validateHealthSnapshot({format:"eo-health-readonly-v1",accountId,capturedAt:new Date().toISOString(),today,sleep,records,energy,energyHistory,training,recentTraining,suggestions,plan,weights,weightSettings,periods:unique([...periods,...active]).sort((a,b)=>b.startedOn.localeCompare(a.startedOn)),flows:unique([...flows,...olderFlows]).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)),presets,doses:unique([...doses,...olderDoses]).sort((a,b)=>b.takenAt.localeCompare(a.takenAt)),reminders:notifications.filter(row=>row.sourceType===PERIOD_MEDICATION_REMINDER_SOURCE)},accountId);
});}
