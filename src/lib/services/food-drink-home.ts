import "server-only";
import { getRepository } from "../repositories";
import { listFoodLogs } from "./food";
import { listDrinkLogs, checkDrinkLimits, getDrinkLimits } from "./drink";
import { dateInEvaOrbit, dateRange, shiftDate } from "../time";
import { buildFoodDrinkInsights, type FoodDrinkHomeData } from "../food-drink-insights";
import { foodDrinkTimeline } from "../food-drink-timeline";

export async function getFoodDrinkHome(): Promise<FoodDrinkHomeData> {
  const date = dateInEvaOrbit(), from = shiftDate(date, -13), end = dateRange(date).to;
  const repository = await getRepository();
  const [foods, drinks, todayFood, todayDrink, lastFood, lastDrink, limits, limitStatuses] = await Promise.all([
    listFoodLogs({ from: dateRange(from).from, to: end, limit: 500 }),
    listDrinkLogs({ from: dateRange(from).from, to: end, limit: 500 }),
    listFoodLogs({ date }), listDrinkLogs({ date }),
    repository.listFoodLogs({ to: end, limit: 1 }), repository.listDrinkLogs({ to: end, limit: 1 }),
    getDrinkLimits(), checkDrinkLimits(),
  ]);
  const complete = foods.length < 500 && drinks.length < 500;
  return {
    date, brief: { foodCount: todayFood.length, drinkCount: todayDrink.length, latest: foodDrinkTimeline(lastFood, lastDrink, true)[0] ?? null },
    insights: buildFoodDrinkInsights(foods, drinks, date, complete), window: { from, to: date, complete }, limits, limitStatuses,
  };
}
