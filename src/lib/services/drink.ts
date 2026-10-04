import "server-only";
import { validateLibraryLink } from "./food-library-link";
import { placeSupports } from "../place-menu";
import { ValidationError } from "../validation";
import { getRepository } from "../repositories";
import type { NewDrinkLimit, NewDrinkLog } from "../repositories/types";
import { buildDrinkInputSuggestions } from "../drink-suggestions";
import { buildDrinkPreferenceSummary } from "../drink-preferences";
import { calculateLimitStatus } from "../nutrition";
import { dateInEvaOrbit, dateRange, monthRange, weekRange } from "../time";

export async function listDrinkLogs(input: { date?: string; query?: string; from?: string; to?: string; drinkType?: string; foodPlaceId?: number; drinkMenuId?: number; limit?: number } = {}) {
  const range = input.date ? dateRange(input.date) : null;
  const logs = await (await getRepository()).listDrinkLogs({ from: range?.from ?? input.from, to: range?.to ?? input.to, drinkType: input.drinkType, foodPlaceId: input.foodPlaceId, drinkMenuId:input.drinkMenuId, limit: input.limit });
  const query = input.query?.trim().toLocaleLowerCase();
  return query ? logs.filter((item) => [item.name, item.brand, item.notes, item.foodPlaceName ?? "", item.foodPlaceCity ?? "", item.foodPlaceLocation ?? "", item.foodPlaceBranch ?? ""].some((value) => value.toLocaleLowerCase().includes(query))) : logs;
}
export async function getTodayDrinks() { return listDrinkLogs({ date: dateInEvaOrbit() }); }
export async function getDrinkInputSuggestions() { return buildDrinkInputSuggestions(await (await getRepository()).listDrinkLogs()); }
export async function getDrinkPreferenceSummary() { return buildDrinkPreferenceSummary(await (await getRepository()).listDrinkLogs()); }
export async function getDrinkLimits() { return (await getRepository()).listDrinkLimits(); }
export async function checkDrinkLimits(at = new Date()) {
  const repository = await getRepository();
  const limits = (await repository.listDrinkLimits()).filter((limit) => limit.enabled);
  return Promise.all(limits.map(async (limit) => {
    const range = limit.period === "daily" ? dateRange(dateInEvaOrbit(at)) : limit.period === "weekly" ? weekRange(at) : monthRange(at);
    return calculateLimitStatus(limit, await repository.listDrinkLogs(range));
  }));
}
async function validateDrinkLinks(repository:Awaited<ReturnType<typeof getRepository>>,placeId:number|null,menuId:number|null,preserve=false){
 if(placeId!==null){const place=await repository.getFoodPlace(placeId);if(!place||(!preserve&&(place.archivedAt||!placeSupports(place,"drink"))))throw new ValidationError("请选择提供饮品的店铺");}
 if(menuId!==null){const menu=await repository.getFoodDish(menuId);if(!menu||menu.foodPlaceId!==placeId||menu.kind!=="drink"||(!preserve&&menu.archivedAt))throw new ValidationError("饮品菜单不属于所选店铺或已归档");}
}
export async function createDrinkLog(input: NewDrinkLog) {
  const repository = await getRepository();
  await validateLibraryLink(repository,input.foodLibraryId);
  await validateDrinkLinks(repository,input.foodPlaceId??null,input.drinkMenuId??null);
  const menu=input.drinkMenuId?await repository.getFoodDish(input.drinkMenuId):null;
  const drink = await repository.createDrinkLog(menu?{...input,name:menu.name}:input);
  return { drink, limits: await checkDrinkLimits(new Date(drink.occurredAt)) };
}
export async function updateDrinkLog(id: number, input: Record<string, unknown>) {
  const repository = await getRepository();
  const existing = await repository.getDrinkLog(id);
  if (!existing) return null;
  await validateLibraryLink(repository,input.foodLibraryId as number|null|undefined,existing.foodLibraryId);
  const placeId=input.foodPlaceId===undefined?existing.foodPlaceId??null:input.foodPlaceId as number|null;
  const menuId=input.drinkMenuId===undefined?existing.drinkMenuId??null:input.drinkMenuId as number|null;
  await validateDrinkLinks(repository,placeId,menuId,placeId===(existing.foodPlaceId??null)&&menuId===(existing.drinkMenuId??null));
  const menu=menuId!==null&&(menuId!==(existing.drinkMenuId??null)||input.name!==undefined)?await repository.getFoodDish(menuId):null;
  const drink = await repository.updateDrinkLog(id, menu?{...input,name:menu.name}:input);
  return drink ? { drink, limits: await checkDrinkLimits(new Date(drink.occurredAt)) } : null;
}
export async function deleteDrinkLog(id: number) { return (await getRepository()).deleteDrinkLog(id); }
export async function createDrinkLimit(input: NewDrinkLimit) { return (await getRepository()).createDrinkLimit(input); }
export async function updateDrinkLimit(id: number, input: Record<string, unknown>) { return (await getRepository()).updateDrinkLimit(id, input); }
export async function deleteDrinkLimit(id: number) { return (await getRepository()).deleteDrinkLimit(id); }
