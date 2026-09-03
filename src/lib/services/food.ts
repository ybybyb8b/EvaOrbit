import "server-only";
import { getRepository } from "../repositories";
import type { FoodDishSearchOptions, FoodLibrarySearchOptions, FoodPlaceSearchOptions, NewFoodDish, NewFoodLibraryItem, NewFoodLog, NewFoodPlace } from "../repositories/types";
import type { FoodLibraryItem, FoodLog, FoodPlaceDetail } from "../types";
import { ValidationError } from "../validation";
import { dateInEvaOrbit, dateRange } from "../time";

export async function listFoodLogs(input: { date?: string; query?: string; mealType?: string; from?: string; to?: string; foodPlaceId?: number; foodDishId?: number; limit?: number } = {}) {
  const range = input.date ? dateRange(input.date) : null;
  return (await getRepository()).listFoodLogs({ ...input, from: range?.from ?? input.from, to: range?.to ?? input.to });
}
export async function getTodayFood() { return listFoodLogs({ date: dateInEvaOrbit() }); }
async function validateFoodLinks(repository:Awaited<ReturnType<typeof getRepository>>,foodPlaceId:number|null,foodDishId:number|null){
  if(foodDishId!==null&&foodPlaceId===null)throw new ValidationError("选择菜品前需要先选择店铺");
  if(foodPlaceId!==null&&!await repository.getFoodPlace(foodPlaceId))throw new ValidationError("所选店铺不存在");
  if(foodDishId!==null){const dish=await repository.getFoodDish(foodDishId);if(!dish||dish.foodPlaceId!==foodPlaceId)throw new ValidationError("所选菜品不属于该店铺");}
}
export async function createFoodLog(input: NewFoodLog) { const repository=await getRepository();await validateFoodLinks(repository,input.foodPlaceId??null,input.foodDishId??null);return repository.createFoodLog(input); }
export async function updateFoodLog(id: number, input: Record<string, unknown>) {
  const repository = await getRepository(); const existing = await repository.getFoodLog(id); if (!existing) return null;
  const scene = (input.scene ?? existing.scene) as FoodLog["scene"];
  const rating = input.rating === undefined ? existing.rating : input.rating;
  const foodPlaceId=input.foodPlaceId===undefined?existing.foodPlaceId??null:input.foodPlaceId as number|null;
  const foodDishId=input.foodDishId===undefined?existing.foodDishId??null:input.foodDishId as number|null;
  await validateFoodLinks(repository,foodPlaceId,foodDishId);
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

export async function listFoodPlaces(query="",options?:FoodPlaceSearchOptions){return(await getRepository()).listFoodPlaces(query,options);}
export async function getFoodPlace(id:number){return(await getRepository()).getFoodPlace(id);}
export async function getFoodPlaceDetail(id:number):Promise<FoodPlaceDetail|null>{const repository=await getRepository();const place=await repository.getFoodPlace(id);if(!place)return null;const[dishes,recentFoodLogs]=await Promise.all([repository.listFoodDishes("",{foodPlaceId:id,limit:100}),repository.listFoodLogs({foodPlaceId:id,limit:20})]);return{place,dishes,recentFoodLogs};}
export async function createFoodPlace(input:NewFoodPlace){return(await getRepository()).createFoodPlace(input);}
export async function updateFoodPlace(id:number,input:Partial<NewFoodPlace>){return(await getRepository()).updateFoodPlace(id,input);}
export async function removeFoodPlace(id:number){return(await getRepository()).removeFoodPlace(id);}
export async function listFoodDishes(query="",options?:FoodDishSearchOptions){return(await getRepository()).listFoodDishes(query,options);}
export async function getFoodDish(id:number){return(await getRepository()).getFoodDish(id);}
export async function createFoodDish(input:NewFoodDish){const repository=await getRepository();const place=await repository.getFoodPlace(input.foodPlaceId);if(!place||place.archivedAt)throw new ValidationError("店铺不存在或已归档");return repository.createFoodDish(input);}
export async function updateFoodDish(id:number,input:Partial<NewFoodDish>){const repository=await getRepository();const existing=await repository.getFoodDish(id);if(!existing||existing.archivedAt)return null;const placeId=input.foodPlaceId??existing.foodPlaceId;const place=await repository.getFoodPlace(placeId);if(!place||place.archivedAt)throw new ValidationError("店铺不存在或已归档");return repository.updateFoodDish(id,input);}
export async function removeFoodDish(id:number){return(await getRepository()).removeFoodDish(id);}
