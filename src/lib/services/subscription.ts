import "server-only";

import { ConflictError } from "../errors";
import { REMINDER_SOURCE_REGISTRY } from "../reminder-source-registry";
import { getRepository } from "../repositories";
import type { NewSubscription, NewSubscriptionPayment, SubscriptionListInput, SubscriptionPatch } from "../repositories/types";
import { nextSubscriptionRenewal } from "../subscriptions";
import { dateInEvaOrbit, shiftDate, zonedDateTimeToUtc } from "../time";

async function reconcileSubscriptionReminder(id:number){
  const repository=await getRepository(),subscription=await repository.getSubscription(id);
  if(!subscription)return null;
  const enabled=subscription.status==="active"&&subscription.reminderEnabled&&Boolean(subscription.reminderTime);
  const dueAt=subscription.reminderTime?zonedDateTimeToUtc(subscription.nextRenewalOn,subscription.reminderTime):zonedDateTimeToUtc(subscription.nextRenewalOn,"12:00");
  const projection={title:`${subscription.name} 续费`,targetType:"subscription" as const,targetId:subscription.id,sourceType:REMINDER_SOURCE_REGISTRY.subscription_renewal.sourceType,sourceId:subscription.id,scheduleType:"one_time" as const,startsAt:dueAt,nextDueAt:enabled?dueAt:null,dueHasExplicitTime:Boolean(subscription.reminderTime),intervalValue:null,intervalUnit:null,timesOfDay:[],endsAt:null,timezone:"Asia/Shanghai",note:`${subscription.currency} ${(subscription.currentAmountMinor/100).toFixed(2)}`,leadTimeMinutes:subscription.reminderDaysBefore*1440,repeatWhileOverdue:false,status:enabled?"scheduled" as const:"cancelled" as const,isActive:enabled};
  const existing=subscription.reminderId?await repository.getReminder(subscription.reminderId):null;
  if(existing){await repository.updateReminder(existing.id,{...projection,sentAt:null,cancelledAt:enabled?null:new Date().toISOString(),snoozedUntil:null,lastNotifiedAt:null});return existing.id;}
  if(!enabled)return null;
  const reminder=await repository.createReminder(projection);
  await repository.updateSubscription(subscription.id,{reminderId:reminder.id});
  return reminder.id;
}

export async function listSubscriptions(input:SubscriptionListInput={}){return(await getRepository()).listSubscriptions(input);}
export async function getSubscription(id:number){return(await getRepository()).getSubscription(id);}
export async function getSubscriptionDetail(id:number){const repository=await getRepository(),subscription=await repository.getSubscription(id);if(!subscription)return null;const[payments,priceChanges]=await Promise.all([repository.listSubscriptionPayments(id),repository.listSubscriptionPriceChanges(id)]);return{...subscription,payments,priceChanges};}
export async function createSubscription(input:NewSubscription){const item=await(await getRepository()).createSubscription(input);await reconcileSubscriptionReminder(item.id);return await (await getRepository()).getSubscription(item.id)??item;}
export async function updateSubscription(id:number,input:SubscriptionPatch,effectiveOn=dateInEvaOrbit()){const repository=await getRepository(),current=await repository.getSubscription(id);if(!current)return null;const reminderEnabled=input.reminderEnabled??current.reminderEnabled,reminderTime=input.reminderTime===undefined?current.reminderTime:input.reminderTime;if(reminderEnabled&&!reminderTime)throw new ConflictError("开启订阅提醒时需要选择提醒时间");const item=await repository.updateSubscription(id,input,effectiveOn);if(item)await reconcileSubscriptionReminder(id);return repository.getSubscription(id);}
export async function setSubscriptionStatus(id:number,status:"active"|"paused"|"ended",nextRenewalOn?:string){const repository=await getRepository(),current=await repository.getSubscription(id);if(!current)return null;if(status==="active"&&current.nextRenewalOn<dateInEvaOrbit()&&!nextRenewalOn)throw new ConflictError("恢复已过期订阅时需要选择新的续费日期");const item=await repository.setSubscriptionStatus(id,status,nextRenewalOn);if(item)await reconcileSubscriptionReminder(id);return repository.getSubscription(id);}
export async function recordSubscriptionPayment(id:number,input:NewSubscriptionPayment){const repository=await getRepository(),subscription=await repository.getSubscription(id);if(!subscription||subscription.status!=="active")throw new ConflictError("订阅不存在或未启用");const nextRenewalOn=nextSubscriptionRenewal(subscription.nextRenewalOn,subscription.billingIntervalValue,subscription.billingIntervalUnit);const payment=await repository.recordSubscriptionPayment(id,input,nextRenewalOn);await reconcileSubscriptionReminder(id);return payment;}
export async function recordSubscriptionPaymentFromReminder(id:number,actedAt=new Date()){const repository=await getRepository(),subscription=await repository.getSubscription(id);if(!subscription)throw new ConflictError("订阅不存在");await recordSubscriptionPayment(id,{scheduledFor:subscription.nextRenewalOn,paidOn:dateInEvaOrbit(actedAt),amountMinor:subscription.currentAmountMinor,currency:subscription.currency,note:"",updateCurrentPrice:false});return subscription.reminderId?repository.getReminder(subscription.reminderId):null;}
export async function skipSubscriptionRenewal(id:number){const repository=await getRepository(),subscription=await repository.getSubscription(id);if(!subscription||subscription.status!=="active")throw new ConflictError("订阅不存在或未启用");await repository.updateSubscription(id,{nextRenewalOn:nextSubscriptionRenewal(subscription.nextRenewalOn,subscription.billingIntervalValue,subscription.billingIntervalUnit)});await reconcileSubscriptionReminder(id);return subscription.reminderId?repository.getReminder(subscription.reminderId):null;}
export async function disableSubscriptionReminder(id:number){const repository=await getRepository(),item=await repository.updateSubscription(id,{reminderEnabled:false});if(item)await reconcileSubscriptionReminder(id);return Boolean(item);}

export function subscriptionReminderPreview(nextRenewalOn:string,daysBefore:number){return shiftDate(nextRenewalOn,-daysBefore);}
