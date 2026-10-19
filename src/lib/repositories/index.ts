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

export async function withMcpRequestRepository<T>(identity: McpOAuthIdentity, action: () => Promise<T>): Promise<T> {
  const repository = usesSupabase()
    ? await import("./supabase").then(({ createMcpSupabaseRepository }) => createMcpSupabaseRepository(identity.accessToken, identity.userId))
    : await import("./sqlite").then(({ sqliteRepository }) => sqliteRepository);
  return repositoryContext.run(repository, action);
}
