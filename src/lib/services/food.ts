import "server-only";
import { getRepository } from "../repositories";
import type { FoodLibrarySearchOptions, NewFoodLibraryItem, NewFoodLog } from "../repositories/types";
import type { FoodLibraryItem, FoodLog } from "../types";
import { ValidationError } from "../validation";
import { dateInEvaOrbit, dateRange } from "../time";

export async function listFoodLogs(input: { date?: string; query?: string; mealType?: string; from?: string; to?: string } = {}) {
  const range = input.date ? dateRange(input.date) : null;
  return (await getRepository()).listFoodLogs({ ...input, from: range?.from ?? input.from, to: range?.to ?? input.to });
}
export async function getTodayFood() { return listFoodLogs({ date: dateInEvaOrbit() }); }
export async function createFoodLog(input: NewFoodLog) { return (await getRepository()).createFoodLog(input); }
export async function updateFoodLog(id: number, input: Record<string, unknown>) {
  const repository = await getRepository(); const existing = await repository.getFoodLog(id); if (!existing) return null;
  const scene = (input.scene ?? existing.scene) as FoodLog["scene"];
  const rating = input.rating === undefined ? existing.rating : input.rating;
  if (scene !== "delivery" && scene !== "restaurant") {
    if (input.rating !== undefined && input.rating !== null) throw new ValidationError("只有外卖或外食记录可以填写评价");
    input = { ...input, rating: null };
  }
  else if (rating !== null && !["love", "good", "neutral", "dislike"].includes(String(rating))) throw new ValidationError("评价不正确");
  return repository.updateFoodLog(id, input);
}
export async function deleteFoodLog(id: number) { return (await getRepository()).deleteFoodLog(id); }
export async function searchFoodLibrary(query = "", brand = "", options?: FoodLibrarySearchOptions) { return (await getRepository()).searchFoodLibrary(query, brand, options); }
export async function upsertFoodLibraryItem(input: NewFoodLibraryItem) { return (await getRepository()).upsertFoodLibraryItem(input); }
const foodLibraryFields = [
  "name", "brand", "category", "defaultPortion", "referenceType", "referenceEnergyKj", "referenceKcal",
  "servingWeight", "servingKcal", "dataSource", "notes",
] as const;

export function mergeFoodLibraryItem(item: FoodLibraryItem, patch: Partial<NewFoodLibraryItem>): NewFoodLibraryItem {
  const merged: NewFoodLibraryItem = {
    name: item.name, brand: item.brand, category: item.category, defaultPortion: item.defaultPortion,
    referenceType: item.referenceType, referenceEnergyKj: item.referenceEnergyKj, referenceKcal: item.referenceKcal,
    servingWeight: item.servingWeight, servingKcal: item.servingKcal, dataSource: item.dataSource, notes: item.notes,
  };
  const target = merged as unknown as Record<(typeof foodLibraryFields)[number], unknown>;
  for (const field of foodLibraryFields) {
    const value = patch[field];
    if (value !== undefined) target[field] = value;
  }
  return merged;
}

export async function updateFoodLibraryItem(id: number, input: Partial<NewFoodLibraryItem>) {
  const repository = await getRepository();
  const existing = await repository.getFoodLibraryItem(id);
  if (!existing || existing.archivedAt !== null) return null;
  return repository.updateFoodLibraryItem(id, mergeFoodLibraryItem(existing, input));
}
export async function removeFoodLibraryItem(id: number) { return (await getRepository()).removeFoodLibraryItem(id); }
