import "server-only";

import {isManualSubscription,subscriptionDate} from "../subscriptions";
import type {NewSubscriptionPurchase} from "../repositories/types";
import { ConflictError } from "../errors";
import { REMINDER_SOURCE_REGISTRY } from "../reminder-source-registry";
import { getRepository } from "../repositories";
import type { NewSubscription, NewSubscriptionPayment, SubscriptionListInput, SubscriptionPatch } from "../repositories/types";
import { AUTO_RENEWAL_PAYMENT_NOTE, automaticSubscriptionRenewalsThrough, nextSubscriptionRenewal } from "../subscriptions";
import { dateInEvaOrbit, shiftDate, zonedDateTimeToUtc } from "../time";

async function reconcileSubscriptionReminder(id:number){
  const repository=await getRepository(),subscription=await repository.getSubscription(id);
  if(!subscription)return null;
  const enabled=subscription.status==="active"&&subscription.reminderEnabled&&Boolean(subscription.reminderTime);
  const dueAt=subscription.reminderTime?zonedDateTimeToUtc(subscriptionDate(subscription),subscription.reminderTime):zonedDateTimeToUtc(subscriptionDate(subscription),"12:00");
  const projection={title:`${subscription.name} ${isManualSubscription(subscription)?"会员到期":"续费"}`,targetType:"subscription" as const,targetId:subscription.id,sourceType:REMINDER_SOURCE_REGISTRY.subscription_renewal.sourceType,sourceId:subscription.id,scheduleType:"one_time" as const,startsAt:dueAt,nextDueAt:enabled?dueAt:null,dueHasExplicitTime:Boolean(subscription.reminderTime),intervalValue:null,intervalUnit:null,timesOfDay:[],endsAt:null,timezone:"Asia/Shanghai",note:isManualSubscription(subscription)?`会员有效期至 ${subscriptionDate(subscription)}`:`${subscription.currency} ${(subscription.currentAmountMinor/100).toFixed(2)}`,leadTimeMinutes:subscription.reminderDaysBefore*1440,repeatWhileOverdue:false,status:enabled?"scheduled" as const:"cancelled" as const,isActive:enabled};
  const existing=subscription.reminderId?await repository.getReminder(subscription.reminderId):null;
  if(existing&&isManualSubscription(subscription)&&enabled&&existing.startsAt===dueAt&&existing.leadTimeMinutes===subscription.reminderDaysBefore*1440&&(existing.status==="completed"||existing.status==="sent"))return existing.id;
  if(existing){await repository.updateReminder(existing.id,{...projection,sentAt:null,cancelledAt:enabled?null:new Date().toISOString(),snoozedUntil:null,lastNotifiedAt:null});return existing.id;}
  if(!enabled)return null;
  const reminder=await repository.createReminder(projection);
  await repository.updateSubscription(subscription.id,{reminderId:reminder.id});
  return reminder.id;
}

export async function catchUpAutomaticSubscriptionPayments(now=new Date(),subscriptionId?:number){
  const repository=await getRepository(),through=dateInEvaOrbit(now),source=subscriptionId?[await repository.getSubscription(subscriptionId)]:await repository.listSubscriptions({status:"active",limit:500});
  for(const snapshot of source){
    if(!snapshot)continue;
    let changed=false;
    for(const scheduledFor of automaticSubscriptionRenewalsThrough(snapshot,through)){
      const current=await repository.getSubscription(snapshot.id);
      if(!current||isManualSubscription(current)||current.status!=="active"||!current.autoRenew)break;
      if(current.nextRenewalOn>scheduledFor)continue;
      if(current.nextRenewalOn<scheduledFor)break;
      const nextRenewalOn=nextSubscriptionRenewal(scheduledFor,current.billingIntervalValue,current.billingIntervalUnit);
      try{await repository.recordSubscriptionPayment(current.id,{scheduledFor,paidOn:scheduledFor,amountMinor:current.currentAmountMinor,currency:current.currency,note:AUTO_RENEWAL_PAYMENT_NOTE,updateCurrentPrice:false},nextRenewalOn);}
      catch(error){
        if(!(error instanceof ConflictError))throw error;
        const latest=await repository.getSubscription(current.id);
        if(!latest||latest.status!=="active"||!latest.autoRenew)break;
        if(latest.nextRenewalOn===scheduledFor&&(await repository.listSubscriptionPayments(current.id)).some(payment=>payment.scheduledFor===scheduledFor))await repository.updateSubscription(current.id,{nextRenewalOn});
        else if(latest.nextRenewalOn<=scheduledFor)throw error;
      }
      changed=true;
    }
    if(changed)await reconcileSubscriptionReminder(snapshot.id);
  }
}

export async function listSubscriptions(input:SubscriptionListInput={}){await catchUpAutomaticSubscriptionPayments();return(await getRepository()).listSubscriptions(input);}
export async function getSubscription(id:number){await catchUpAutomaticSubscriptionPayments(new Date(),id);return(await getRepository()).getSubscription(id);}
export async function getSubscriptionDetail(id:number){await catchUpAutomaticSubscriptionPayments(new Date(),id);const repository=await getRepository(),subscription=await repository.getSubscription(id);if(!subscription)return null;const[payments,priceChanges]=await Promise.all([repository.listSubscriptionPayments(id),repository.listSubscriptionPriceChanges(id)]);return{...subscription,payments,priceChanges};}
export async function createSubscription(input:NewSubscription){const item=await(await getRepository()).createSubscription(input);await catchUpAutomaticSubscriptionPayments(new Date(),item.id);await reconcileSubscriptionReminder(item.id);return await (await getRepository()).getSubscription(item.id)??item;}
export async function updateSubscription(id:number,input:SubscriptionPatch,effectiveOn=dateInEvaOrbit()){
  const repository=await getRepository(),before=await repository.getSubscription(id);
  if(!before)return null;
  const mode=input.mode??before.mode??"recurring";
  if(mode==="manual"){
    if(input.mode!=="manual"&&(input.currentAmountMinor!==undefined||input.currency!==undefined||input.billingIntervalValue!==undefined||input.billingIntervalUnit!==undefined||input.autoRenew===true))throw new ConflictError("手动会员没有固定扣款价格或周期；请记录实际购买");
    const expiresOn=input.expiresOn??before.expiresOn;
    if(!expiresOn)throw new ConflictError("请填写会员到期日");
    if(input.nextRenewalOn!==undefined&&input.nextRenewalOn!==expiresOn&&input.mode!=="manual")throw new ConflictError("手动续期请调整会员有效期，不设置下次付款日期");
    input={...input,mode,expiresOn,nextRenewalOn:expiresOn,autoRenew:false};
    // A manual member has no listed future price: preserve payment-derived history.
    delete input.currentAmountMinor;delete input.currency;delete input.billingIntervalValue;delete input.billingIntervalUnit;
  }else if(before.mode==="manual"){
    if(input.nextRenewalOn===undefined||input.billingIntervalValue===undefined||input.billingIntervalUnit===undefined||input.currentAmountMinor===undefined||input.currency===undefined)throw new ConflictError("切换固定周期时请填写金额、币种、周期与下次续费日期");
    input={...input,expiresOn:null};
  }else if(input.expiresOn!==undefined)throw new ConflictError("固定周期订阅不使用会员到期日");
  const rescheduling=input.nextRenewalOn!==undefined&&input.nextRenewalOn!==before.nextRenewalOn;
  if(rescheduling&&mode!=="manual"){
    const next=input.nextRenewalOn!;
    if(next<(input.startedOn??before.startedOn))throw new ConflictError("续费日期不能早于开始日期");
    if((input.autoRenew??before.autoRenew)&&next<=dateInEvaOrbit())throw new ConflictError("自动记账订阅请选未来的续费日期；如需保留过去的计划日期，请先关闭自动记账");
  }
  // A schedule correction is not a payment. Move the date before any catch-up;
  // unchanged schedules retain the existing automatic-payment behaviour.
  if(!rescheduling&&mode!=="manual")await catchUpAutomaticSubscriptionPayments(new Date(),id);
  const current=await repository.getSubscription(id);
  if(!current)return null;
  const reminderEnabled=input.reminderEnabled??current.reminderEnabled,reminderTime=input.reminderTime===undefined?current.reminderTime:input.reminderTime;
  if(reminderEnabled&&!reminderTime)throw new ConflictError("开启订阅提醒时需要选择提醒时间");
  const item=await repository.updateSubscription(id,input,effectiveOn);
  if(item)await reconcileSubscriptionReminder(id);
  return repository.getSubscription(id);
}
export async function setSubscriptionStatus(id:number,status:"active"|"paused"|"ended",nextRenewalOn?:string){await catchUpAutomaticSubscriptionPayments(new Date(),id);const repository=await getRepository(),current=await repository.getSubscription(id);if(!current)return null;if(isManualSubscription(current)&&nextRenewalOn)throw new ConflictError("请通过有效期调整更新会员到期日");if(status==="active"&&!isManualSubscription(current)&&current.nextRenewalOn<dateInEvaOrbit()&&!nextRenewalOn)throw new ConflictError("恢复已过期订阅时需要选择新的续费日期");const item=await repository.setSubscriptionStatus(id,status,nextRenewalOn);if(item)await reconcileSubscriptionReminder(id);return repository.getSubscription(id);}
export async function recordSubscriptionPurchase(id:number,input:NewSubscriptionPurchase){
  if(input.paidOn>dateInEvaOrbit())throw new ConflictError("购买日期不能晚于今天");
  const repository=await getRepository(),item=await repository.getSubscription(id);
  if(!item||!isManualSubscription(item))throw new ConflictError("该订阅不是手动续期会员");
  const payment=await repository.recordSubscriptionPurchase(id,input);
  await reconcileSubscriptionReminder(id);return payment;
}
export async function recordSubscriptionPayment(id:number,input:NewSubscriptionPayment){const repository=await getRepository(),subscription=await repository.getSubscription(id);if(!subscription||subscription.status!=="active")throw new ConflictError("订阅不存在或未启用");if(isManualSubscription(subscription))throw new ConflictError("手动续期会员请使用记录购买");const nextRenewalOn=nextSubscriptionRenewal(subscription.nextRenewalOn,subscription.billingIntervalValue,subscription.billingIntervalUnit);const payment=await repository.recordSubscriptionPayment(id,input,nextRenewalOn);await reconcileSubscriptionReminder(id);return payment;}
export async function recordSubscriptionPaymentFromReminder(id:number,actedAt=new Date()){const repository=await getRepository(),subscription=await repository.getSubscription(id);if(!subscription)throw new ConflictError("订阅不存在");if(isManualSubscription(subscription)){if(subscription.reminderId)await repository.updateReminder(subscription.reminderId,{isActive:false,status:"completed",nextDueAt:null,lastCompletedAt:actedAt.toISOString()});return subscription.reminderId?repository.getReminder(subscription.reminderId):null;}if(subscription.autoRenew){await catchUpAutomaticSubscriptionPayments(actedAt,id);const current=await repository.getSubscription(id);if(current?.nextRenewalOn===subscription.nextRenewalOn&&subscription.reminderId)return repository.updateReminder(subscription.reminderId,{isActive:false,status:"completed",nextDueAt:null,lastCompletedAt:actedAt.toISOString()});return current?.reminderId?repository.getReminder(current.reminderId):null;}await recordSubscriptionPayment(id,{scheduledFor:subscription.nextRenewalOn,paidOn:dateInEvaOrbit(actedAt),amountMinor:subscription.currentAmountMinor,currency:subscription.currency,note:"",updateCurrentPrice:false});return subscription.reminderId?repository.getReminder(subscription.reminderId):null;}
export async function skipSubscriptionRenewal(id:number){const repository=await getRepository(),subscription=await repository.getSubscription(id);if(!subscription||subscription.status!=="active")throw new ConflictError("订阅不存在或未启用");if(isManualSubscription(subscription))return recordSubscriptionPaymentFromReminder(id);await repository.updateSubscription(id,{nextRenewalOn:nextSubscriptionRenewal(subscription.nextRenewalOn,subscription.billingIntervalValue,subscription.billingIntervalUnit)});await reconcileSubscriptionReminder(id);return subscription.reminderId?repository.getReminder(subscription.reminderId):null;}
export async function disableSubscriptionReminder(id:number){const repository=await getRepository(),item=await repository.updateSubscription(id,{reminderEnabled:false});if(item)await reconcileSubscriptionReminder(id);return Boolean(item);}

export function subscriptionReminderPreview(nextRenewalOn:string,daysBefore:number){return shiftDate(nextRenewalOn,-daysBefore);}
