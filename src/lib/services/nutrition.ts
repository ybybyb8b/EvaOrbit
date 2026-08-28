import "server-only";
import { getRepository } from "../repositories";
import { calculateDailyNutrition } from "../nutrition";
import type { DailyNutritionSummary, DrinkLog, FoodLog } from "../types";
import { listDrinkLogs } from "./drink";
import { listFoodLogs } from "./food";
import { dateInEvaOrbit, dateRange } from "../time";

export async function getDailyNutritionSummary(date = dateInEvaOrbit()) {
  const repository = await getRepository();
  const [foods, drinks, settings] = await Promise.all([listFoodLogs({ date }), listDrinkLogs({ date }), repository.getNutritionSettings(date)]);
  return calculateDailyNutrition(date, foods, drinks, settings);
}

export async function listDailyNutritionHistory(limit = 30): Promise<DailyNutritionSummary[]> {
  const repository = await getRepository();
  const settings = await repository.listNutritionSettings(limit);
  if (!settings.length) return [];

  const dates = settings.map((item) => item.date);
  const from = dateRange(dates.reduce((earliest, date) => date < earliest ? date : earliest)).from;
  const to = dateRange(dates.reduce((latest, date) => date > latest ? date : latest)).to;
  const [foods, drinks] = await Promise.all([listFoodLogs({ from, to }), listDrinkLogs({ from, to })]);
  const foodsByDate = groupLogsByDate(foods);
  const drinksByDate = groupLogsByDate(drinks);

  return settings.map((item) => calculateDailyNutrition(item.date, foodsByDate.get(item.date) ?? [], drinksByDate.get(item.date) ?? [], item));
}

function groupLogsByDate<T extends FoodLog | DrinkLog>(records: T[]) {
  const grouped = new Map<string, T[]>();
  for (const record of records) {
    const date = dateInEvaOrbit(new Date(record.occurredAt));
    const bucket = grouped.get(date);
    if (bucket) bucket.push(record);
    else grouped.set(date, [record]);
  }
  return grouped;
}

export async function updateDailyEnergy(date: string, input: { restingEnergyKcal: number | null; activeEnergyKcal: number | null; notes: string }) {
  await (await getRepository()).updateNutritionSettings(date, input);
  return getDailyNutritionSummary(date);
}
