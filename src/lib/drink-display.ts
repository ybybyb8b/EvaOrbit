import type { DrinkLog, DrinkType } from "./types";

export const drinkTypeLabels: Record<DrinkType,string> = {coffee:"咖啡",milk_tea:"奶茶",tea:"茶",soda:"汽水",juice:"果汁",water:"水",alcohol:"酒",other:"饮品"};
export function drinkRecordName(record:Pick<DrinkLog,"name"|"drinkMenuName"|"drinkType">) {
  return record.drinkMenuName?.trim() || record.name.trim() || drinkTypeLabels[record.drinkType];
}
