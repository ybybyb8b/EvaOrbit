import "server-only";

import { getRepository } from "../repositories";
import type { MedicationDoseEventListInput, MedicationDoseEventPatch, MedicationPresetListInput, MedicationPresetPatch, MenstrualFlowRecordListInput, MenstrualFlowRecordPatch, MenstrualPeriodListInput, MenstrualPeriodPatch, NewMedicationDoseEvent, NewMedicationPreset, NewMenstrualFlowRecord, NewMenstrualPeriod } from "../repositories/types";
import { reconcilePeriodMedicationReminder, reconcilePeriodMedicationReminders } from "./period-medication-reminder";
import { dateInEvaOrbit } from "../time";

async function activePeriodFor(timestamp:string){const occurredOn=dateInEvaOrbit(new Date(timestamp));return(await(await getRepository()).listMenstrualPeriods({limit:500})).find(item=>!item.endedOn&&item.startedOn<=occurredOn)??null;}

export async function listMenstrualPeriods(input:MenstrualPeriodListInput={}){return(await getRepository()).listMenstrualPeriods(input);}
export async function getMenstrualPeriod(id:number){return(await getRepository()).getMenstrualPeriod(id);}
export async function createMenstrualPeriod(input:NewMenstrualPeriod){const item=await(await getRepository()).createMenstrualPeriod(input);await reconcilePeriodMedicationReminders();return item;}
export async function updateMenstrualPeriod(id:number,input:MenstrualPeriodPatch){const item=await(await getRepository()).updateMenstrualPeriod(id,input);if(item)await reconcilePeriodMedicationReminders();return item;}
export async function deleteMenstrualPeriod(id:number){const deleted=await(await getRepository()).deleteMenstrualPeriod(id);if(deleted)await reconcilePeriodMedicationReminders();return deleted;}
export async function listMenstrualFlowRecords(input:MenstrualFlowRecordListInput={}){return(await getRepository()).listMenstrualFlowRecords(input);}
export async function getMenstrualFlowRecord(id:number){return(await getRepository()).getMenstrualFlowRecord(id);}
export async function createMenstrualFlowRecord(input:NewMenstrualFlowRecord){const period=input.periodId===null&&!input.isCycleStart?await activePeriodFor(input.occurredAt):null;return(await getRepository()).createMenstrualFlowRecord({...input,periodId:input.periodId??period?.id??null});}
export async function updateMenstrualFlowRecord(id:number,input:MenstrualFlowRecordPatch){return(await getRepository()).updateMenstrualFlowRecord(id,input);}
export async function deleteMenstrualFlowRecord(id:number){return(await getRepository()).deleteMenstrualFlowRecord(id);}
export async function finalizeMenstrualFlowRecordDeletion(id:number){return(await getRepository()).finalizeMenstrualFlowRecordDeletion(id);}
export async function listPendingMenstrualFlowRecords(){return(await(await getRepository()).listMenstrualFlowRecords({includeDeleted:true,limit:500})).filter(item=>item.healthKitSyncStatus!=="synced");}
export async function listMedicationPresets(input:MedicationPresetListInput={}){return(await getRepository()).listMedicationPresets(input);}
export async function getMedicationPreset(id:number){return(await getRepository()).getMedicationPreset(id);}
export async function createMedicationPreset(input:NewMedicationPreset){const item=await(await getRepository()).createMedicationPreset(input);await reconcilePeriodMedicationReminder(item.id);return item;}
export async function updateMedicationPreset(id:number,input:MedicationPresetPatch){const item=await(await getRepository()).updateMedicationPreset(id,input);if(item)await reconcilePeriodMedicationReminder(id);return item;}
export async function deleteMedicationPreset(id:number){const deleted=await(await getRepository()).deleteMedicationPreset(id);if(deleted)await reconcilePeriodMedicationReminder(id);return deleted;}
export async function listMedicationDoseEvents(input:MedicationDoseEventListInput={}){return(await getRepository()).listMedicationDoseEvents(input);}
export async function getMedicationDoseEvent(id:number){return(await getRepository()).getMedicationDoseEvent(id);}
export async function createMedicationDoseEvent(input:NewMedicationDoseEvent){const period=input.periodId===null?await activePeriodFor(input.takenAt):null;const item=await(await getRepository()).createMedicationDoseEvent({...input,periodId:input.periodId??period?.id??null});await reconcilePeriodMedicationReminder(item.medicationPresetId);return item;}
export async function updateMedicationDoseEvent(id:number,input:MedicationDoseEventPatch){const repository=await getRepository(),before=await repository.getMedicationDoseEvent(id),item=await repository.updateMedicationDoseEvent(id,input);if(item){await reconcilePeriodMedicationReminder(item.medicationPresetId);if(before&&before.medicationPresetId!==item.medicationPresetId)await reconcilePeriodMedicationReminder(before.medicationPresetId);}return item;}
export async function deleteMedicationDoseEvent(id:number){const repository=await getRepository(),before=await repository.getMedicationDoseEvent(id),deleted=await repository.deleteMedicationDoseEvent(id);if(deleted&&before)await reconcilePeriodMedicationReminder(before.medicationPresetId);return deleted;}
