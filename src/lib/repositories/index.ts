import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { cache } from "react";
import { usesSupabase } from "../config";
import type { McpOAuthIdentity } from "../mcp-oauth";
import type { EvaOrbitRepository } from "./types";

const repositoryContext = new AsyncLocalStorage<EvaOrbitRepository>();
// React cache lasts only for this server render, never across users or requests.
const requestSupabaseRepository = cache(async () => {
  const { createSupabaseRepository } = await import("./supabase");
  const repository = await createSupabaseRepository();
  return {
    ...repository,
    getCalendarInterpretation: cache(repository.getCalendarInterpretation.bind(repository)),
    getUiPreferences: cache(repository.getUiPreferences.bind(repository)),
    listTrackers: cache(repository.listTrackers.bind(repository)),
  };
});

export async function getRepository(): Promise<EvaOrbitRepository> {
  const contextual = repositoryContext.getStore();
  if (contextual) return contextual;
  if (usesSupabase()) {
    return requestSupabaseRepository();
  }
  const { sqliteRepository } = await import("./sqlite");
  return sqliteRepository;
}

export async function withMcpRepository<T>(action: () => Promise<T>): Promise<T> {
  if (!repositoryContext.getStore()) throw new Error("MCP repository is not initialized for this request");
  return action();
}

// Audited Home aggregation reads. No command method can escape through a nested service.
export async function withHomeReadOnlyRepository<T>(action: () => Promise<T>): Promise<T> {
  const repository = await getRepository();
  const allowed = new Set(["listFoodLogs", "listDrinkLogs", "listTrackerEntries", "listTrackers", "listHealthRecords", "listRelationEvents", "listRelationPeople", "listTrainingLogs", "listWeightRecords", "listMenstrualFlowRecords", "listMedicationDoseEvents", "listCalendarEvents", "listSubscriptions", "listSubscriptionPayments", "getCalendarInterpretation", "getNutritionSettings", "listCatEvents", "listCatSymptoms", "listCatVetVisits", "listCatMedications", "listCatMeasurements", "listMenstrualPeriods", "listTasks", "listDailyJournalEntries", "listSleepSamples", "listReminders", "getPet", "getCatFoodItem", "getTracker", "getSubscription", "getTrackerReminder"]);
  const guarded = new Proxy(repository, { get(target, key) {
    // Await probes `then` when an async service returns this plain repository.
    if (key === "then") return undefined;
    if (typeof key !== "string" || !allowed.has(key)) throw new Error("Home read-only aggregation refused a repository operation");
    const method = Reflect.get(target, key);
    return typeof method === "function" ? method.bind(target) : method;
  } });
  return repositoryContext.run(guarded, action);
}

// Food aggregation has a smaller, independently audited read surface than Home.
export async function withFoodReadOnlyRepository<T>(action:()=>Promise<T>):Promise<T>{
  const repository=await getRepository();
  const allowed=new Set(["listFoodLogs","listDrinkLogs","listDrinkLimits","getCalendarInterpretation","listCalendarEvents","listFoodPlaces","searchFoodLibrary","getFoodPlace","listFoodDishes","getPlaceLibraryItems","getFoodLibraryItem"]);
  return repositoryContext.run(new Proxy(repository,{get(target,key){
    if(key==="then")return undefined;
    if(typeof key!=="string"||!allowed.has(key))throw new Error("Food read-only aggregation refused a repository operation");
    return Reflect.get(target,key).bind(target);
  }}),action);
}

// Cats GETs must never complete care, project reminders, or consume inventory.
export async function withCatsReadOnlyRepository<T>(action:()=>Promise<T>):Promise<T>{
  const repository=await getRepository();
  const allowed=new Set(["listPets","getPet","listCatEvents","listCatSymptoms","listCatVetVisits","listCatMedications","listCatMeasurements","listCatRoutines","listReminders","getCatEvent","getCatSymptom","getCatVetVisit","getCatMedication","getCatMeasurement","listCatFoodItems","listCatFoodPurchases"]);
  return repositoryContext.run(new Proxy(repository,{get(target,key){
    if(key==="then")return undefined;
    if(typeof key!=="string"||!allowed.has(key))throw new Error("Cats read-only aggregation refused a repository operation");
    return async(...args:unknown[])=>{
      const result=await Reflect.get(target,key).apply(target,args);
      // Existing Supabase lists use its default row ceiling; don't label a capped list complete.
      if(Array.isArray(result)&&result.length>=1000)throw new Error("Cats list reached the 1,000-row acceptance boundary; cache preserved. Full pagination is required.");
      return result;
    };
  }}),action);
}

// Subscriptions' ordinary GET services can create payments and advance reminders.
export async function withSubscriptionsReadOnlyRepository<T>(action:()=>Promise<T>):Promise<T>{
  const repository=await getRepository(),allowed=new Set(["listSubscriptions","getSubscription","listSubscriptionPayments","listSubscriptionPriceChanges"]);
  return repositoryContext.run(new Proxy(repository,{get(target,key){
    if(key==="then")return undefined;
    if(typeof key!=="string"||!allowed.has(key))throw new Error("Subscriptions read-only aggregation refused a repository operation");
    return Reflect.get(target,key).bind(target);
  }}),action);
}

// Health snapshots may read existing reminders but must never reconcile or write them.
export async function withHealthReadOnlyRepository<T>(action:()=>Promise<T>):Promise<T>{
  const repository=await getRepository(),allowed=new Set(["listHealthRecords","listSleepSamples","listCalendarEvents","getCalendarInterpretation","listFoodLogs","listDrinkLogs","getNutritionSettings","listNutritionSettings","listTrainingLogs","getTrainingPlan","listWeightRecords","getWeightSettings","listMenstrualPeriods","listMenstrualFlowRecords","listMedicationPresets","listMedicationDoseEvents","listReminders","getTaskReminder","getTrackerReminder","listTrackerEntries","getPet","getCatFoodItem","getTracker","getSubscription"]);
  return repositoryContext.run(new Proxy(repository,{get(target,key){
    if(key==="then")return undefined;
    if(typeof key!=="string"||!allowed.has(key))throw new Error("Health read-only aggregation refused a repository operation");
    return Reflect.get(target,key).bind(target);
  }}),action);
}

// Refuse capped ledgers: incomplete event history must not appear to be a full balance.
export async function withRelationsReadOnlyRepository<T>(action:()=>Promise<T>):Promise<T>{
  const repository=await getRepository(),allowed=new Set(["listRelationPeople","getRelationPerson","listRelationEvents","listPersonMemoryNotes"]);
  return repositoryContext.run(new Proxy(repository,{get(target,key){
    if(key==="then")return undefined;
    if(typeof key!=="string"||!allowed.has(key))throw new Error("Relations read-only aggregation refused a repository operation");
    return async(...args:unknown[])=>{
      const result=await Reflect.get(target,key).apply(target,args);
      if(Array.isArray(result)&&result.length>=(key==="listRelationEvents"?500:1000))throw new Error("Relations reached a read limit; previous cache preserved. Complete pagination is required before displaying balances.");
      return result;
    };
  }}),action);
}

export async function withMcpRequestRepository<T>(identity: McpOAuthIdentity, action: () => Promise<T>): Promise<T> {
  const repository = usesSupabase()
    ? await import("./supabase").then(({ createMcpSupabaseRepository }) => createMcpSupabaseRepository(identity.accessToken, identity.userId))
    : await import("./sqlite").then(({ sqliteRepository }) => sqliteRepository);
  return repositoryContext.run(repository, action);
}

// Media caching has no command or upload capability. Refuse capped history.
export async function withMediaReadOnlyRepository<T>(action:()=>Promise<T>):Promise<T>{
 const repository=await getRepository(),allowed=new Set(["listMediaItems","getMediaItem","listMediaSeries","getMediaSeries","listMediaViewings"]);
 return repositoryContext.run(new Proxy(repository,{get(target,key){if(key==="then")return undefined;if(typeof key!=="string"||!allowed.has(key))throw new Error("Media read-only aggregation refused a repository operation");return async(...args:unknown[])=>{const result=await Reflect.get(target,key).apply(target,args);if(Array.isArray(result)&&key!=="listMediaItems"&&result.length>=1000)throw new Error("Media history reached a read boundary; previous cache preserved");return result;};}}),action);
}

// Bounded downloads for the remaining spaces never execute business commands.
export async function withWorkspaceReadOnlyRepository<T>(action:()=>Promise<T>):Promise<T>{
 const repository=await getRepository(),allowed=new Set(["listTasks","listTaskReminders","listProjects","listProjectItems","getLuciusState","listLuciusPosts","listLuciusPostComments","listLuciusDiaryEntries","listLuciusCases"]);
 return repositoryContext.run(new Proxy(repository,{get(target,key){if(key==="then")return undefined;if(typeof key!=="string"||!allowed.has(key))throw new Error("Workspace read-only aggregation refused a repository operation");return Reflect.get(target,key).bind(target);}}),action);
}
