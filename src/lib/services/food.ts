import "server-only";
import { catalogServingKcal } from "../food-catalog";
import { defaultFoodUnit } from "../food-calculation";
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
  if (input.consumedWeightG !== undefined && (input.consumedWeightG !== null || existing?.consumedWeightG != null) && (inputs ?? existing?.foodLibraryItems)?.length === 1) {
    inputs = (inputs ?? existing!.foodLibraryItems!).map(item => ({ ...item, quantity: input.consumedWeightG as number | null, unit: "g" }));
  }
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
async function applyCatalogFoodLinks(repository:Awaited<ReturnType<typeof getRepository>>, input:Record<string,unknown>, existing?:FoodLog){
  const ids=(input.foodDishIds as number[]|undefined)??(input.foodDishId?[Number(input.foodDishId)]:existing?.foodDishIds??[]);
  const oldIds=existing?.foodDishIds??(existing?.foodDishId?[existing.foodDishId]:[]);
  const supplied=input.foodLibraryItems as FoodConsumption[]|undefined;
  const libraryChanged=supplied!==undefined?JSON.stringify(supplied.map(item=>item.foodLibraryId))!==JSON.stringify((existing?.foodLibraryItems??[]).map(item=>item.foodLibraryId)):input.foodLibraryId!==undefined&&input.foodLibraryId!==existing?.foodLibraryId;
  if(existing && JSON.stringify(ids)===JSON.stringify(oldIds) && !libraryChanged)return input;
  const menus=await Promise.all(ids.map(id=>repository.getFoodDish(id)));
  let consumptions=input.foodLibraryItems as FoodConsumption[]|undefined;
  let inferred=false;
  let libraryId=consumptions?.[0]?.foodLibraryId??input.foodLibraryId as number|null|undefined;
  if(consumptions===undefined && !input.foodLibraryId && menus.some(menu=>menu?.foodLibraryId)){
    const libraries=await Promise.all([...new Set(menus.flatMap(menu=>menu?.foodLibraryId?[menu.foodLibraryId]:[]))].map(id=>repository.getFoodLibraryItem(id)));
    consumptions=libraries.filter((item):item is FoodLibraryItem=>Boolean(item)).map(item=>({foodLibraryId:item.id,quantity:catalogServingKcal(item)!==null?1:null,unit:catalogServingKcal(item)!==null?"serving":defaultFoodUnit(item)}));
    libraryId=consumptions[0]?.foodLibraryId??null;inferred=true;
  }
  const library=libraryId?await repository.getFoodLibraryItem(libraryId):null;
  const placeId=existing&&input.foodPlaceId===null?null:input.foodPlaceId??menus[0]?.foodPlaceId??library?.foodPlaceId??existing?.foodPlaceId??null;
  if(library?.foodPlaceId && library.foodPlaceId!==placeId)throw new ValidationError("所选食品不属于该店铺");
  return {...input,foodPlaceId:placeId,...(consumptions?{foodLibraryItems:consumptions,foodLibraryId:libraryId,foodKcalMode:input.foodKcalMode??(!inferred && input.estimatedKcal!=null?"manual":"auto")}:{})};
}
export async function createFoodLog(input: NewFoodLog) { const repository=await getRepository();input={...input,...await applyCatalogFoodLinks(repository,input)} as NewFoodLog;const ids=input.foodDishIds??(input.foodDishId?[input.foodDishId]:[]);await validateFoodLinks(repository,input.foodPlaceId??null,ids);await validateLibraryLink(repository,input.foodLibraryId);const calculation=await prepareFoodCalculation(repository,input);const saved=await repository.createFoodLog({...input,...calculation,foodDishIds:ids,foodDishId:ids[0]??null} as NewFoodLog);return (await withMealTimes(repository,[saved]))[0]; }
export async function updateFoodLog(id: number, input: Record<string, unknown>) {
  const repository = await getRepository(); const existing = await repository.getFoodLog(id); if (!existing) return null;
  const [effective] = await withMealTimes(repository, [existing]);
  input = await applyCatalogFoodLinks(repository,{ ...input },existing);
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
export async function searchFoodLibraryForPlace(query = "", brand = "", foodPlaceId?: number, options?: FoodLibrarySearchOptions) {
  const repository = await getRepository();
  const [items, usage] = await Promise.all([
    repository.searchFoodLibrary(query, brand, options),
    foodPlaceId ? repository.getPlaceLibraryItems(foodPlaceId) : Promise.resolve([]),
  ]);
  const keyword = query.trim().toLocaleLowerCase();
  const preferred = usage.filter(({ item }) => !item.archivedAt && (!options?.category || item.category === options.category) && (!brand || item.brand === brand) &&
    (!keyword || `${item.name} ${item.brand}`.toLocaleLowerCase().includes(keyword)))
    .map(({ item, recordCount }) => ({ ...item, placeRecordCount: recordCount }));
  // Insert preferred items first without allowing the global list to replace their source metadata.
  const preferredIds = new Set(preferred.map(item => item.id));
  return [...preferred, ...items.filter(item => !preferredIds.has(item.id))].filter(item=>!foodPlaceId||!item.foodPlaceId||item.foodPlaceId===foodPlaceId).slice(0, 100);
}
function validateSourceType(kind: string, drinkType: NewFoodLibraryItem["drinkType"]) { if (drinkType && kind !== "drink") throw new ValidationError("只有饮品来源可以设置饮品类型"); }
async function validateLibraryOwner(repository: Awaited<ReturnType<typeof getRepository>>, input: NewFoodLibraryItem, existing?: FoodLibraryItem) {
  if(input.foodPlaceId && input.foodPlaceId!==existing?.foodPlaceId){const place=await repository.getFoodPlace(input.foodPlaceId);if(!place||place.archivedAt||!placeSupports(place,input.category==="drink"?"drink":"food"))throw new ValidationError("归属店铺不存在或不支持该物品类型");}
}
async function validateMenuReference(repository: Awaited<ReturnType<typeof getRepository>>, input: NewFoodDish, existing?: NewFoodDish) {
  if(!input.foodLibraryId)return;
  const item=await repository.getFoodLibraryItem(input.foodLibraryId);
  if(!item || (item.archivedAt && item.id!==existing?.foodLibraryId))throw new ValidationError("营养参考不存在或已归档");
  if(item.foodPlaceId && item.foodPlaceId!==input.foodPlaceId)throw new ValidationError("物品只能归属一个店铺，请选择本店物品或通用食品");
  if((input.kind==="drink")!==(item.category==="drink"))throw new ValidationError("菜单与营养参考的食品／饮品类型不一致");
}
export async function upsertFoodLibraryItem(input: NewFoodLibraryItem) { validateSourceType(input.category, input.drinkType); const repository=await getRepository();await validateLibraryOwner(repository,input);return repository.upsertFoodLibraryItem(input); }
const foodLibraryFields = [
  "name", "brand", "category", "foodPlaceId", "drinkType", "defaultPortion", "referenceType", "referenceEnergyKj", "referenceKcal",
  "servingWeight", "servingKcal", "dataSource", "notes",
] as const;

export function mergeFoodLibraryItem(item: FoodLibraryItem, patch: Partial<NewFoodLibraryItem>): NewFoodLibraryItem {
  const merged: NewFoodLibraryItem = {
    name: item.name, brand: item.brand, category: item.category, foodPlaceId:item.foodPlaceId??null, drinkType: item.drinkType ?? null, defaultPortion: item.defaultPortion,
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
  const merged = mergeFoodLibraryItem(existing, input);
  validateSourceType(merged.category, merged.drinkType);
  await validateLibraryOwner(repository,merged,existing);
  return repository.updateFoodLibraryItem(id, merged);
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
export async function createFoodDish(input:NewFoodDish){validateSourceType(input.kind??"food",input.drinkType);const repository=await getRepository();const place=await repository.getFoodPlace(input.foodPlaceId);if(!place||place.archivedAt)throw new ValidationError("店铺不存在或已归档");if(!placeSupports(place,input.kind??"food"))throw new ValidationError("菜单类型不符合该店铺类型");await validateMenuReference(repository,input);return repository.createFoodDish(input);}
export async function updateFoodDish(id:number,input:Partial<NewFoodDish>){const repository=await getRepository();const existing=await repository.getFoodDish(id);if(!existing||existing.archivedAt)return null;validateSourceType(input.kind??existing.kind??"food",input.drinkType===undefined?existing.drinkType:input.drinkType);const placeId=input.foodPlaceId??existing.foodPlaceId;const place=await repository.getFoodPlace(placeId);if(!place||place.archivedAt)throw new ValidationError("店铺不存在或已归档");if(!placeSupports(place,input.kind??existing.kind??"food"))throw new ValidationError("菜单类型不符合该店铺类型");if((placeId!==existing.foodPlaceId||(input.kind!==undefined&&input.kind!==(existing.kind??"food")))&&((await repository.listFoodLogs({foodDishId:id,limit:1})).length||(await repository.listDrinkLogs({drinkMenuId:id,limit:1})).length))throw new ValidationError("已关联饮食记录的菜品不能移动到其他店铺");await validateMenuReference(repository,{...existing,...input},existing);return repository.updateFoodDish(id,input);}
export async function removeFoodDish(id:number){return(await getRepository()).removeFoodDish(id);}
