import { calculateFoodKcal, foodNutritionReference } from "./food-calculation.ts";
import type { FoodDish, FoodLibraryItem } from "./types";

export type FoodCatalogItem = {
  key: string; name: string; placeId: number | null; placeName: string;
  menu?: FoodDish; library?: FoodLibraryItem; servingKcal: number | null;
};

export function catalogServingKcal(item?: FoodLibraryItem | null): number | null {
  return item ? calculateFoodKcal(foodNutritionReference(item), 1, "serving") : null;
}
