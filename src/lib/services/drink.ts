import "server-only";
import { ValidationError } from "../validation";
import { getRepository } from "../repositories";
import type { NewDrinkLimit, NewDrinkLog } from "../repositories/types";
import { buildDrinkInputSuggestions } from "../drink-suggestions";
import { buildDrinkPreferenceSummary } from "../drink-preferences";
import { calculateLimitStatus } from "../nutrition";
import { dateInEvaOrbit, dateRange, monthRange, weekRange } from "../time";

export async function listDrinkLogs(input: { date?: string; query?: string; from?: string; to?: string; drinkType?: string; foodPlaceId?: number; limit?: number } = {}) {
  const range = input.date ? dateRange(input.date) : null;
  const logs = await (await getRepository()).listDrinkLogs({ from: range?.from ?? input.from, to: range?.to ?? input.to, drinkType: input.drinkType, foodPlaceId: input.foodPlaceId, limit: input.limit });
  const query = input.query?.trim().toLocaleLowerCase();
  return query ? logs.filter((item) => [item.name, item.brand, item.notes, item.foodPlaceName ?? "", item.foodPlaceCity ?? "", item.foodPlaceLocation ?? "", item.foodPlaceBranch ?? ""].some((value) => value.toLocaleLowerCase().includes(query))) : logs;
}
export async function getTodayDrinks() { return listDrinkLogs({ date: dateInEvaOrbit() }); }
export async function getDrinkInputSuggestions() { return buildDrinkInputSuggestions(await (await getRepository()).listDrinkLogs()); }
export async function getDrinkPreferenceSummary() { return buildDrinkPreferenceSummary(await (await getRepository()).listDrinkLogs()); }
export async function getDrinkLimits() { return (await getRepository()).listDrinkLimits(); }
export async function checkDrinkLimits(at = new Date()) {
  const repository = await getRepository();
  const limits = (await repository.listDrinkLimits()).filter((limit) => limit.enabled);
  return Promise.all(limits.map(async (limit) => {
    const range = limit.period === "daily" ? dateRange(dateInEvaOrbit(at)) : limit.period === "weekly" ? weekRange(at) : monthRange(at);
    return calculateLimitStatus(limit, await repository.listDrinkLogs(range));
  }));
}
export async function createDrinkLog(input: NewDrinkLog) {
  const repository = await getRepository();
  if (input.foodPlaceId != null) { const place = await repository.getFoodPlace(input.foodPlaceId); if (!place || place.archivedAt) throw new ValidationError("店铺不存在或已归档"); }
  const drink = await repository.createDrinkLog(input);
  return { drink, limits: await checkDrinkLimits(new Date(drink.occurredAt)) };
}
export async function updateDrinkLog(id: number, input: Record<string, unknown>) {
  const repository = await getRepository();
  const existing = await repository.getDrinkLog(id);
  if (!existing) return null;
  if (input.foodPlaceId != null && input.foodPlaceId !== existing.foodPlaceId) { const place = await repository.getFoodPlace(Number(input.foodPlaceId)); if (!place || place.archivedAt) throw new ValidationError("店铺不存在或已归档"); }
  const drink = await repository.updateDrinkLog(id, input);
  return drink ? { drink, limits: await checkDrinkLimits(new Date(drink.occurredAt)) } : null;
}
export async function deleteDrinkLog(id: number) { return (await getRepository()).deleteDrinkLog(id); }
export async function createDrinkLimit(input: NewDrinkLimit) { return (await getRepository()).createDrinkLimit(input); }
export async function updateDrinkLimit(id: number, input: Record<string, unknown>) { return (await getRepository()).updateDrinkLimit(id, input); }
export async function deleteDrinkLimit(id: number) { return (await getRepository()).deleteDrinkLimit(id); }
