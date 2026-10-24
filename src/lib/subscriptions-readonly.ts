import type {SubscriptionDetail} from "./types";
import {subscriptionSpendByCurrency} from "./subscriptions.ts";
import {validSubscriptionIconKey} from "./subscription-icon.ts";
import type {LibraryEntry} from "./software-library.ts";
import {parseSoftwareLibraryInput} from "./software-library-validation.ts";

export type SubscriptionsReadonlySnapshot={format:"eo-subscriptions-readonly-v1";accountId:string;capturedAt:string;today:string;items:SubscriptionDetail[];iconSources:Record<number,string>;library?:LibraryEntry[];libraryIconSources?:Record<number,string>};
const validDay=(day:unknown)=>typeof day==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day;
const validId=(id:unknown)=>Number.isSafeInteger(id)&&Number(id)>0;
const money=(value:unknown)=>Number.isSafeInteger(value)&&Number(value)>=0;
export function validateSubscriptionsSnapshot(value:SubscriptionsReadonlySnapshot,accountId:string){
  const fail=()=>{throw new Error("Invalid or incomplete Subscriptions snapshot; previous cache preserved");};
  if(!value||value.format!=="eo-subscriptions-readonly-v1"||value.accountId!==accountId||!Number.isFinite(Date.parse(value.capturedAt))||!validDay(value.today)||!Array.isArray(value.items)||value.items.length>200||!value.iconSources||typeof value.iconSources!=="object"||Array.isArray(value.iconSources))fail();
  const ids=new Set<number>(),paymentIds=new Set<number>(),changeIds=new Set<number>();let history=0;
  for(const item of value.items){
    if(!validId(item.id)||ids.has(item.id)||typeof item.name!=="string"||!money(item.currentAmountMinor)||!/^[A-Z]{3}$/.test(item.currency)||!validId(item.billingIntervalValue)||!["day","week","month","year"].includes(item.billingIntervalUnit)||!validDay(item.startedOn)||!validDay(item.nextRenewalOn)||!["active","paused","ended"].includes(item.status)||typeof item.autoRenew!=="boolean"||typeof item.reminderEnabled!=="boolean"||!Array.isArray(item.payments)||!Array.isArray(item.priceChanges)||item.payments.length>=1000||item.priceChanges.length>=1000)fail();
    ids.add(item.id);history+=item.payments.length+item.priceChanges.length;
    for(const row of item.payments){if(!validId(row.id)||paymentIds.has(row.id)||row.subscriptionId!==item.id||!money(row.amountMinor)||!/^[A-Z]{3}$/.test(row.currency)||!validDay(row.scheduledFor)||!validDay(row.paidOn))fail();paymentIds.add(row.id);}
    for(const row of item.priceChanges){if(!validId(row.id)||changeIds.has(row.id)||row.subscriptionId!==item.id||!money(row.oldAmountMinor)||!money(row.newAmountMinor)||!validDay(row.effectiveOn)||!/^[A-Z]{3}$/.test(row.oldCurrency)||!/^[A-Z]{3}$/.test(row.newCurrency))fail();changeIds.add(row.id);}
    const spend=subscriptionSpendByCurrency(item.payments);
    if(item.paymentCount!==item.payments.length||item.totalSpentMinor!==(spend[item.currency]??0)||Object.values(spend).some(v=>!money(v))||!item.spendByCurrency||Object.keys(spend).length!==Object.keys(item.spendByCurrency).length||Object.entries(spend).some(([key,total])=>item.spendByCurrency[key]!==total))fail();
    if(item.iconPath&&(!validSubscriptionIconKey(item.iconPath)||!value.iconSources[item.id]))fail();
  }
  for(const [key,source] of Object.entries(value.iconSources))if(!ids.has(Number(key))||String(Number(key))!==key||typeof source!=="string"||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(source))fail();
  if(value.library!==undefined||value.libraryIconSources!==undefined){
    if(!Array.isArray(value.library)||value.library.length>500||!value.libraryIconSources||typeof value.libraryIconSources!=="object"||Array.isArray(value.libraryIconSources))fail();
    const libraryIds=new Set<number>();
    for(const item of value.library!){
      if(!item||!validId(item.id)||libraryIds.has(item.id)||typeof item.iconPath!=="string"||!Number.isFinite(Date.parse(item.createdAt))||!Number.isFinite(Date.parse(item.updatedAt)))fail();
      try{parseSoftwareLibraryInput(item);}catch{fail();}
      if(item.iconPath&&(!validSubscriptionIconKey(item.iconPath)||!value.libraryIconSources![item.id]))fail();
      libraryIds.add(item.id);
    }
    for(const [key,source] of Object.entries(value.libraryIconSources!))if(!libraryIds.has(Number(key))||String(Number(key))!==key||typeof source!=="string"||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(source))fail();
  }
  if(history>5000||new TextEncoder().encode(JSON.stringify(value)).length>8*1024*1024)throw new Error("Subscriptions snapshot exceeds the acceptance limit; previous cache preserved");
  return value;
}
export function readSubscriptionsSnapshot(value:SubscriptionsReadonlySnapshot,path:string,init?:RequestInit){
  if(init?.method&&init.method!=="GET")throw new Error("Subscriptions read-only adapter refused a write");
  if(path==="/api/subscriptions/library")return new Response(JSON.stringify(value.library??{error:"Refresh Subscriptions online to download your software library."}),{status:value.library?200:503,headers:{"Content-Type":"application/json"}});
  const match=/^\/api\/subscriptions(?:\/([1-9][0-9]*))?$/.exec(path);if(!match)throw new Error("Subscriptions read-only path refused");
  const data=match[1]?value.items.find(item=>item.id===Number(match[1])):value.items;
  return new Response(JSON.stringify(data??{error:"Not in downloaded Subscriptions snapshot"}),{status:data===undefined?404:200,headers:{"Content-Type":"application/json"}});
}
