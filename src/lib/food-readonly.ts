import type {FoodDrinkHomeData} from "./food-drink-insights";
import type {FoodLog,DrinkLog} from "./types";

export type FoodReadonlySnapshot = {
  format:"eo-food-readonly-v1";
  accountId:string;
  capturedAt:string;
  home:FoodDrinkHomeData;
  foods:FoodLog[];
  drinks:DrinkLog[];
  window:{from:string;to:string;foodComplete:boolean;drinkComplete:boolean};
};
export function validateFoodSnapshot(value:FoodReadonlySnapshot,accountId:string) {
  if(!value || value.format!=="eo-food-readonly-v1" || value.accountId!==accountId || !Number.isFinite(Date.parse(value.capturedAt)) || !value.home?.brief || !Array.isArray(value.home.insights) || !Array.isArray(value.home.limits) || !Array.isArray(value.home.limitStatuses) || !value.window || value.window.to!==value.home.date || value.window.from>value.window.to || !/^\d{4}-\d{2}-\d{2}$/.test(value.window.from) || !/^\d{4}-\d{2}-\d{2}$/.test(value.window.to) || typeof value.window.foodComplete!=="boolean" || typeof value.window.drinkComplete!=="boolean")throw new Error("Invalid Food & Drink snapshot or account");
  for(const rows of [value.foods,value.drinks]) {
    if(!Array.isArray(rows) || rows.length>500 || new Set(rows.map(row=>row.id)).size!==rows.length || rows.some(row=>!Number.isSafeInteger(row.id)||row.id<=0||!Number.isFinite(Date.parse(row.occurredAt))))throw new Error("Incomplete Food & Drink records");
  }
  if(new TextEncoder().encode(JSON.stringify(value)).length>8*1024*1024)throw new Error("Food & Drink snapshot exceeds the cache limit");
  return value;
}
