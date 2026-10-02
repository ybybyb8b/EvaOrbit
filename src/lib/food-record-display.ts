import type { FoodLog } from "./types";

export function foodRecordDisplay(log: Pick<FoodLog, "title" | "foodPlaceName" | "foodPlaceBranch" | "foodDishes" | "foodDishId" | "foodDishName">) {
  let title = log.title.trim();
  const parts = title.split(/[|｜]/);
  if (parts.length === 2 && log.foodPlaceName) {
    const normalize = (value: string) => value.replace(/[（]/g, "(").replace(/[）]/g, ")").replace(/\s+/g, "");
    const prefixes = [log.foodPlaceName, `${log.foodPlaceName}(${log.foodPlaceBranch ?? ""})`];
    if (parts[1].trim() && prefixes.some(prefix => normalize(prefix) === normalize(parts[0]))) title = parts[1].trim();
  }
  const dishes = log.foodDishes ?? (log.foodDishId && log.foodDishName ? [{ id: log.foodDishId, name: log.foodDishName }] : []);
  const titles = new Set([title, ...title.split(/[+＋、]/)].map(value => value.trim().toLocaleLowerCase()));
  return { title, dishes: dishes.filter(dish => !titles.has(dish.name.trim().toLocaleLowerCase())) };
}
