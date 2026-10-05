import type { FoodConsumption, FoodLibraryItem, FoodNutritionReference, FoodQuantityUnit } from "./types.ts";
import { ValidationError } from "./validation.ts";

export function foodNutritionReference(item: FoodLibraryItem): FoodNutritionReference {
  const { referenceType, referenceEnergyKj, referenceKcal, servingWeight, servingKcal } = item;
  return { referenceType, referenceEnergyKj, referenceKcal, servingWeight, servingKcal };
}

export function defaultFoodUnit(reference: FoodNutritionReference): FoodQuantityUnit {
  return reference.referenceType === "per_100g" ? "g" : reference.referenceType === "per_100ml" ? "ml" : "serving";
}

export function foodReferenceKcal(reference: FoodNutritionReference) {
  return (reference.referenceType === "per_serving" ? reference.servingKcal : null)
    ?? reference.referenceKcal ?? (reference.referenceEnergyKj === null ? null : reference.referenceEnergyKj / 4.184);
}

export function calculateFoodKcal(reference: FoodNutritionReference, quantity: number | null, unit: FoodQuantityUnit): number | null {
  if (quantity === null || !Number.isFinite(quantity) || quantity < 0) return null;
  const kcal = foodReferenceKcal(reference);
  if (kcal === null || !Number.isFinite(kcal) || kcal < 0) return null;
  let factor: number;
  if (unit === defaultFoodUnit(reference)) factor = reference.referenceType === "per_serving" ? quantity : quantity / 100;
  else if (reference.servingWeight !== null && reference.servingWeight > 0 && Number.isFinite(reference.servingWeight)) {
    if (reference.referenceType === "per_100g" && unit === "serving") factor = quantity * reference.servingWeight / 100;
    else if (reference.referenceType === "per_serving" && unit === "g") factor = quantity / reference.servingWeight;
    else return null;
  } else return null;
  const result = kcal * factor;
  const rounded = Math.round(result * 100) / 100;
  return Number.isFinite(rounded) ? rounded : null;
}

export function foodCalculatedTotal(items: FoodConsumption[]): number | null {
  if (!items.length || items.some(item => item.calculatedKcal == null)) return null;
  return Math.round(items.reduce((sum, item) => sum + item.calculatedKcal!, 0));
}

// Existing references are immutable: changing a portion uses the historical reference.
// Client-supplied reference and calculatedKcal are never trusted for a new link.
export async function snapshotFoodConsumptions(
  inputs: FoodConsumption[], existing: FoodConsumption[], getItem: (id: number) => Promise<FoodLibraryItem | null>,
): Promise<FoodConsumption[]> {
  return Promise.all(inputs.map(async input => {
    const previous = existing.find(item => item.foodLibraryId === input.foodLibraryId);
    if (previous?.nutritionReference) {
      return { ...previous, quantity: input.quantity, unit: input.unit,
        calculatedKcal: previous.quantity === input.quantity && previous.unit === input.unit
          ? previous.calculatedKcal : calculateFoodKcal(previous.nutritionReference, input.quantity, input.unit) };
    }
    const item = await getItem(input.foodLibraryId);
    if (!item || (item.archivedAt && !previous)) throw new ValidationError("食品库项目不存在或已归档");
    const nutritionReference = foodNutritionReference(item);
    return { foodLibraryId: item.id, item: { id: item.id, name: item.name, brand: item.brand }, quantity: input.quantity, unit: input.unit,
      nutritionReference, calculatedKcal: calculateFoodKcal(nutritionReference, input.quantity, input.unit) };
  }));
}
