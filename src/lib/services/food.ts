import "server-only";
import { validateLibraryLink } from "./food-library-link";
import { foodCalculatedTotal, snapshotFoodConsumptions } from "../food-calculation";
import { placeSupports } from "../place-menu";
import { getRepository } from "../repositories";
import type { FoodDishSearchOptions, FoodLibrarySearchOptions, FoodPlaceSearchOptions, NewFoodDish, NewFoodLibraryItem, NewFoodLog, NewFoodPlace } from "../repositories/types";
import type { FoodConsumption, FoodLibraryItem, FoodLog, FoodPlaceDetail } from "../types";
import { ValidationError } from "../validation";
import { dateInEvaOrbit, dateRange } from "../time";
import { withMealTimes } from "./meal-calendar";

export async function listFoodLogs(input: { date?: string; query?: string; mealType?: string; from?: string; to?: string; foodPlaceId?: number; foodDishId?: number; limit?: number } = {}) {
  const range = input.date ? dateRange(input.date) : null;
  const repository = await getRepository();
  return withMealTimes(repository, await repository.listFoodLogs({ ...input, from: range?.from ?? input.from, to: range?.to ?? input.to }));
}
export async function getTodayFood() { return listFoodLogs({ date: dateInEvaOrbit() }); }
export async function getFoodLog(id: number) {
  const repository = await getRepository(), item = await repository.getFoodLog(id);
  return item ? (await withMealTimes(repository, [item]))[0] : null;
}
export async function getFoodLibraryItem(id: number) { return (await getRepository()).getFoodLibraryItem(id); }
async function validateFoodLinks(repository:Awaited<ReturnType<typeof getRepository>>,foodPlaceId:number|null,foodDishIds:number[],preservePlace=false){
  if(foodDishIds.length&&foodPlaceId===null)throw new ValidationError("选择菜品前需要先选择店铺");
  if(foodPlaceId!==null){const place=await repository.getFoodPlace(foodPlaceId);if(!place)throw new ValidationError("所选店铺不存在");if(!preservePlace&&!placeSupports(place,"food"))throw new ValidationError("该店铺只提供饮品");}
  for(const foodDishId of foodDishIds){const dish=await repository.getFoodDish(foodDishId);if(!dish||dish.foodPlaceId!==foodPlaceId||(dish.kind??"food")!=="food")throw new ValidationError("所选菜品不属于该店铺");}
}
async function prepareFoodCalculation(repository: Awaited<ReturnType<typeof getRepository>>, input: Record<string, unknown>, existing?: FoodLog) {
  let inputs = input.foodLibraryItems as FoodConsumption[] | undefined;
  const legacyChanged = inputs === undefined && input.foodLibraryId !== undefined && input.foodLibraryId !== existing?.foodLibraryId;
  if (legacyChanged) inputs = [];
  if (inputs === undefined && input.foodKcalMode === undefined) return input;
  const previous = existing?.foodLibraryItems?.length ? existing.foodLibraryItems : existing?.foodLibraryId ? [{ foodLibraryId: existing.foodLibraryId, quantity: null, unit: "serving" as const }] : [];
  const snapshots = await snapshotFoodConsumptions(inputs ?? existing?.foodLibraryItems ?? [], previous, id => repository.getFoodLibraryItem(id));
  const mode = input.foodKcalMode ?? (input.estimatedKcal !== undefined ? "manual" : existing?.foodKcalMode ?? "auto");
  return { ...input, foodLibraryItems: snapshots, foodKcalMode: mode,
    ...(inputs !== undefined && !legacyChanged ? { foodLibraryId: snapshots[0]?.foodLibraryId ?? null } : {}),
    ...(mode === "auto" ? { estimatedKcal: foodCalculatedTotal(snapshots) } : {}) };
}
export async function createFoodLog(input: NewFoodLog) { const repository=await getRepository();const ids=input.foodDishIds??(input.foodDishId?[input.foodDishId]:[]);await validateFoodLinks(repository,input.foodPlaceId??null,ids);await validateLibraryLink(repository,input.foodLibraryId);const calculation=await prepareFoodCalculation(repository,input);const saved=await repository.createFoodLog({...input,...calculation,foodDishIds:ids,foodDishId:ids[0]??null} as NewFoodLog);return (await withMealTimes(repository,[saved]))[0]; }
export async function updateFoodLog(id: number, input: Record<string, unknown>) {
  const repository = await getRepository(); const existing = await repository.getFoodLog(id); if (!existing) return null;
  const [effective] = await withMealTimes(repository, [existing]);
  input = { ...input };
  const sameTime = (value: unknown, target: string) => typeof value === "string" && Date.parse(value) === Date.parse(target);
  if (input.occurredAt !== undefined && effective.calendarMeal && sameTime(input.occurredAt, effective.occurredAt) && input.calendarTimeEnabled !== false && input.occurredHasExplicitTime !== false) {
    delete input.occurredAt; delete input.occurredHasExplicitTime;
  } else if (input.calendarTimeEnabled === undefined && ((input.occurredAt !== undefined && !sameTime(input.occurredAt, existing.occurredAt)) || (input.occurredHasExplicitTime !== undefined && input.occurredHasExplicitTime !== (existing.occurredHasExplicitTime ?? true)))) input.calendarTimeEnabled = false;
  if (input.foodLibraryItems === undefined) await validateLibraryLink(repository,input.foodLibraryId as number|null|undefined,existing.foodLibraryId);
  const scene = (input.scene ?? existing.scene) as FoodLog["scene"];
  const rating = input.rating === undefined ? existing.rating : input.rating;
  const foodPlaceId=input.foodPlaceId===undefined?existing.foodPlaceId??null:input.foodPlaceId as number|null;
  const ids = input.foodDishIds !== undefined ? input.foodDishIds as number[] : input.foodDishId !== undefined ? (input.foodDishId ? [input.foodDishId as number] : []) : existing.foodDishIds ?? (existing.foodDishId ? [existing.foodDishId] : []);
  await validateFoodLinks(repository,foodPlaceId,ids,foodPlaceId===(existing.foodPlaceId??null));
  input = { ...input, foodDishIds: ids, foodDishId: ids[0] ?? null };
  if (scene !== "delivery" && scene !== "restaurant") {
    if (input.rating !== undefined && input.rating !== null) throw new ValidationError("只有外卖或外食记录可以填写评价");
    input = { ...input, rating: null };
  }
  else if (rating !== null && !["love", "good", "neutral", "dislike"].includes(String(rating))) throw new ValidationError("评价不正确");
  if (input.estimatedKcal !== undefined && input.foodKcalMode === undefined) input = { ...input, foodKcalMode: "manual" };
  const saved = await repository.updateFoodLog(id, await prepareFoodCalculation(repository, input, existing));
  return saved ? (await withMealTimes(repository, [saved]))[0] : null;
}
export async function deleteFoodLog(id: number) { return (await getRepository()).deleteFoodLog(id); }
export async function searchFoodLibrary(query = "", brand = "", options?: FoodLibrarySearchOptions) { return (await getRepository()).searchFoodLibrary(query, brand, options); }
export async function searchFoodLibraryForPlace(query = "", brand = "", foodPlaceId?: number) {
  const repository = await getRepository();
  const [items, usage] = await Promise.all([
    repository.searchFoodLibrary(query, brand),
    foodPlaceId ? repository.getPlaceLibraryItems(foodPlaceId) : Promise.resolve([]),
  ]);
  const keyword = query.trim().toLocaleLowerCase();
  const preferred = usage.filter(({ item }) => !item.archivedAt && (!brand || item.brand === brand) &&
    (!keyword || `${item.name} ${item.brand}`.toLocaleLowerCase().includes(keyword)))
    .map(({ item, recordCount }) => ({ ...item, placeRecordCount: recordCount }));
  // Insert preferred items first without allowing the global list to replace their source metadata.
  const preferredIds = new Set(preferred.map(item => item.id));
  return [...preferred, ...items.filter(item => !preferredIds.has(item.id))].slice(0, 100);
}
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
export async function getFoodPlaceDetail(id:number):Promise<FoodPlaceDetail|null>{const repository=await getRepository();const place=await repository.getFoodPlace(id);if(!place)return null;const[dishes,recentFoodLogs,recentDrinkLogs,drinkMenu,packagedFood]=await Promise.all([repository.listFoodDishes("",{foodPlaceId:id,kind:"food",limit:100}),repository.listFoodLogs({foodPlaceId:id,limit:20}),repository.listDrinkLogs({foodPlaceId:id,limit:20}),repository.listFoodDishes("",{foodPlaceId:id,kind:"drink",limit:100}),repository.getPlaceLibraryItems(id)]);return{place,dishes,recentFoodLogs:await withMealTimes(repository,recentFoodLogs),recentDrinkLogs,drinkMenu,packagedFood};}
export async function getPlaceLibraryItems(id:number){return(await getRepository()).getPlaceLibraryItems(id);}
export async function createFoodPlace(input:NewFoodPlace){return(await getRepository()).createFoodPlace(input);}
export async function updateFoodPlace(id:number,input:Partial<NewFoodPlace>){const repository=await getRepository();if(input.serviceType&&input.serviceType!=="both"){const incompatible=input.serviceType==="drink"?"food":"drink";if((await repository.listFoodDishes("",{foodPlaceId:id,kind:incompatible,limit:1})).length)throw new ValidationError("请先归档不符合新类型的菜单项，再修改店铺类型");}return repository.updateFoodPlace(id,input);}
export async function removeFoodPlace(id:number){return(await getRepository()).removeFoodPlace(id);}
export async function listFoodDishes(query="",options?:FoodDishSearchOptions){return(await getRepository()).listFoodDishes(query,options);}
export async function getFoodDish(id:number){return(await getRepository()).getFoodDish(id);}
export async function createFoodDish(input:NewFoodDish){const repository=await getRepository();const place=await repository.getFoodPlace(input.foodPlaceId);if(!place||place.archivedAt)throw new ValidationError("店铺不存在或已归档");if(!placeSupports(place,input.kind??"food"))throw new ValidationError("菜单类型不符合该店铺类型");return repository.createFoodDish(input);}
export async function updateFoodDish(id:number,input:Partial<NewFoodDish>){const repository=await getRepository();const existing=await repository.getFoodDish(id);if(!existing||existing.archivedAt)return null;const placeId=input.foodPlaceId??existing.foodPlaceId;const place=await repository.getFoodPlace(placeId);if(!place||place.archivedAt)throw new ValidationError("店铺不存在或已归档");if(!placeSupports(place,input.kind??existing.kind??"food"))throw new ValidationError("菜单类型不符合该店铺类型");if((placeId!==existing.foodPlaceId||(input.kind!==undefined&&input.kind!==(existing.kind??"food")))&&((await repository.listFoodLogs({foodDishId:id,limit:1})).length||(await repository.listDrinkLogs({drinkMenuId:id,limit:1})).length))throw new ValidationError("已关联饮食记录的菜品不能移动到其他店铺");return repository.updateFoodDish(id,input);}
export async function removeFoodDish(id:number){return(await getRepository()).removeFoodDish(id);}
