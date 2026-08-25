import "server-only";
import { getRepository } from "../repositories";
import { calculateDailyNutrition } from "../nutrition";
import { listDrinkLogs } from "./drink";
import { listFoodLogs } from "./food";
import { dateInEvaOrbit } from "../time";

export async function getDailyNutritionSummary(date = dateInEvaOrbit()) {
  const repository = await getRepository();
  const [foods, drinks, settings] = await Promise.all([listFoodLogs({ date }), listDrinkLogs({ date }), repository.getNutritionSettings(date)]);
  return calculateDailyNutrition(date, foods, drinks, settings);
}

export async function updateDailyEnergy(date: string, input: { restingEnergyKcal: number | null; activeEnergyKcal: number | null; notes: string }) {
  await (await getRepository()).updateNutritionSettings(date, input);
  return getDailyNutritionSummary(date);
}
