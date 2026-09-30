import "server-only";

import { buildCatFoodSummary } from "../cat-food";
import { ConflictError } from "../errors";
import { getRepository } from "../repositories";
import type { CatFoodItemPatch, CatFoodPurchasePatch, NewCatFoodItem, NewCatFoodPurchase } from "../repositories/types";
import { zonedDateTimeToUtc } from "../time";

const timezone = "Asia/Shanghai";

function addDays(date:string,days:number){const value=new Date(`${date}T00:00:00Z`);value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);}

export async function listCatFood(query="") {
  const repository=await getRepository();
  const [items,purchases]=await Promise.all([repository.listCatFoodItems(query),repository.listCatFoodPurchases()]);
  return items.map(item=>buildCatFoodSummary(item,purchases.filter(purchase=>purchase.itemId===item.id))).sort((a,b)=>(b.latestPurchase?.purchasedOn??"").localeCompare(a.latestPurchase?.purchasedOn??"")||b.updatedAt.localeCompare(a.updatedAt));
}

export async function getCatFoodDetail(id:number){const repository=await getRepository();const item=await repository.getCatFoodItem(id);if(!item||item.archivedAt)return null;return buildCatFoodSummary(item,await repository.listCatFoodPurchases(id));}
export async function createCatFoodItem(input:NewCatFoodItem){return(await getRepository()).createCatFoodItem(input);}
export async function updateCatFoodItem(id:number,input:CatFoodItemPatch){const repository=await getRepository();const item=await repository.getCatFoodItem(id);if(!item||item.archivedAt)return null;return repository.updateCatFoodItem(id,input);}
export async function removeCatFoodItem(id:number){const repository=await getRepository();const item=await repository.getCatFoodItem(id);if(!item||item.archivedAt)return false;if(item.restockReminderId)await repository.updateReminder(item.restockReminderId,{isActive:false,status:"cancelled",cancelledAt:new Date().toISOString(),nextDueAt:null});return repository.removeCatFoodItem(id);}

async function resetRestockReminder(itemId:number,purchasedOn:string){const repository=await getRepository();const item=await repository.getCatFoodItem(itemId);if(!item?.restockReminderId||!item.restockIntervalDays||!item.restockReminderTime)return;const reminderDate=addDays(purchasedOn,item.restockIntervalDays-item.restockLeadDays);const nextDueAt=zonedDateTimeToUtc(reminderDate,item.restockReminderTime,timezone);await repository.updateReminder(item.restockReminderId,{startsAt:nextDueAt,nextDueAt,status:"scheduled",isActive:true,snoozedUntil:null,lastNotifiedAt:null,sentAt:null,cancelledAt:null});}

export async function createCatFoodPurchase(input:NewCatFoodPurchase){const repository=await getRepository();const item=await repository.getCatFoodItem(input.itemId);if(!item||item.archivedAt)throw new ConflictError("Cat food item not found.");const purchase=await repository.createCatFoodPurchase(input);await resetRestockReminder(item.id,purchase.purchasedOn);return purchase;}
export async function updateCatFoodPurchase(id:number,input:CatFoodPurchasePatch){const repository=await getRepository();const existing=await repository.getCatFoodPurchase(id);if(!existing)return null;const packageCount=input.packageCount??existing.packageCount;const remaining=input.remainingPackageCount??existing.remainingPackageCount;if(remaining>packageCount)throw new ConflictError("Remaining packages cannot exceed purchased packages.");const purchase=await repository.updateCatFoodPurchase(id,input);if(purchase)await resetRestockReminder(purchase.itemId,purchase.purchasedOn);return purchase;}
export async function deleteCatFoodPurchase(id:number){return(await getRepository()).deleteCatFoodPurchase(id);}
export async function consumeCatFoodPackage(itemId:number){const repository=await getRepository();const purchases=(await repository.listCatFoodPurchases(itemId)).filter(item=>item.remainingPackageCount>0).sort((a,b)=>a.purchasedOn.localeCompare(b.purchasedOn)||a.id-b.id);const purchase=purchases[0];if(!purchase)throw new ConflictError("No packages remain in stock.");await repository.updateCatFoodPurchase(purchase.id,{remainingPackageCount:purchase.remainingPackageCount-1});return getCatFoodDetail(itemId);}

export async function configureCatFoodRestock(id:number,input:{enabled:boolean;intervalDays:number;leadDays:number;reminderTime:string|null}){
  const repository=await getRepository();const item=await repository.getCatFoodItem(id);if(!item||item.archivedAt)return null;
  if(!input.enabled){if(item.restockReminderId)await repository.updateReminder(item.restockReminderId,{isActive:false,status:"cancelled",cancelledAt:new Date().toISOString(),nextDueAt:null});await repository.updateCatFoodItem(id,{restockIntervalDays:input.intervalDays,restockLeadDays:input.leadDays,restockReminderTime:input.reminderTime,restockReminderId:null});return getCatFoodDetail(id);}
  if(!input.reminderTime)throw new ConflictError("Choose a reminder time first.");
  const latest=(await repository.listCatFoodPurchases(id))[0];if(!latest)throw new ConflictError("Add a purchase before enabling a restock reminder.");
  const reminderDate=addDays(latest.purchasedOn,input.intervalDays-input.leadDays),nextDueAt=zonedDateTimeToUtc(reminderDate,input.reminderTime,timezone);
  const reminderInput={title:`Restock ${item.name}`,targetType:"cat_food" as const,targetId:id,sourceType:"cat_food_restock",sourceId:id,scheduleType:"interval" as const,startsAt:nextDueAt,nextDueAt,dueHasExplicitTime:true,intervalValue:input.intervalDays,intervalUnit:"day" as const,timesOfDay:[input.reminderTime],endsAt:null,timezone,note:"",leadTimeMinutes:0,repeatWhileOverdue:false,status:"scheduled" as const,isActive:true};
  const current=item.restockReminderId?await repository.getReminder(item.restockReminderId):null;
  const reminder=current?await repository.updateReminder(current.id,reminderInput):await repository.createReminder(reminderInput);
  if(!reminder)throw new ConflictError("Could not save the restock reminder.");
  await repository.updateCatFoodItem(id,{restockIntervalDays:input.intervalDays,restockLeadDays:input.leadDays,restockReminderTime:input.reminderTime,restockReminderId:reminder.id});return getCatFoodDetail(id);
}
