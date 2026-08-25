import "server-only";
import { getRepository } from "../repositories";
import type { NewFoodLibraryItem, NewFoodLog } from "../repositories/types";
import { dateInEvaOrbit, dateRange } from "../time";

export async function listFoodLogs(input: { date?: string; query?: string; mealType?: string; from?: string; to?: string } = {}) {
  const range = input.date ? dateRange(input.date) : null;
  return (await getRepository()).listFoodLogs({ ...input, from: range?.from ?? input.from, to: range?.to ?? input.to });
}
export async function getTodayFood() { return listFoodLogs({ date: dateInEvaOrbit() }); }
export async function createFoodLog(input: NewFoodLog) { return (await getRepository()).createFoodLog(input); }
export async function updateFoodLog(id: number, input: Record<string, unknown>) { return (await getRepository()).updateFoodLog(id, input); }
export async function deleteFoodLog(id: number) { return (await getRepository()).deleteFoodLog(id); }
export async function searchFoodLibrary(query = "", brand = "") { return (await getRepository()).searchFoodLibrary(query, brand); }
export async function upsertFoodLibraryItem(input: NewFoodLibraryItem) { return (await getRepository()).upsertFoodLibraryItem(input); }
