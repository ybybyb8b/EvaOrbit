import type {SubscriptionDetail} from "./types";
import {subscriptionSpendByCurrency} from "./subscriptions.ts";
import {validSubscriptionIconKey} from "./subscription-icon.ts";
import type {LibraryEntry} from "./software-library.ts";
import {parseSoftwareLibraryInput} from "./software-library-validation.ts";
import {parseSubscriptionPurchase} from "./validation.ts";

export type SubscriptionsReadonlySnapshot={format:"eo-subscriptions-readonly-v1";accountId:string;capturedAt:string;today:string;items:SubscriptionDetail[];iconSources:Record<number,string>;library?:LibraryEntry[];libraryIconSources?:Record<number,string>};
const validDay=(day:unknown)=>typeof day==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day;
const validId=(id:unknown)=>Number.isSafeInteger(id)&&Number(id)>0;
const money=(value:unknown)=>Number.isSafeInteger(value)&&Number(value)>=0;
export function validateSubscriptionsSnapshot(value:SubscriptionsReadonlySnapshot,accountId:string){
  function fail(reason:string):never {throw new Error(`Invalid or incomplete Subscriptions snapshot (${reason}); previous cache preserved`);}
  if(!value||value.format!=="eo-subscriptions-readonly-v1")fail("unsupported snapshot format");
  if(value.accountId!==accountId)fail("account mismatch");
  if(!Number.isFinite(Date.parse(value.capturedAt))||!validDay(value.today))fail("invalid snapshot date");
  if(!Array.isArray(value.items)||value.items.length>200)fail("invalid subscription list or more than 200 items");
  if(!value.iconSources||typeof value.iconSources!=="object"||Array.isArray(value.iconSources))fail("invalid subscription icon map");
  const ids=new Set<number>(),paymentIds=new Set<number>(),changeIds=new Set<number>();let history=0;
  for(const item of value.items){
    if(!item||!validId(item.id)||ids.has(item.id))fail("invalid or duplicate subscription ID");
    const label=`subscription #${item.id}`;
    if(item.mode!==undefined&&item.mode!=="recurring"&&item.mode!=="manual")fail(`${label}: invalid mode`);
    if(item.mode==="manual"&&(!validDay(item.expiresOn)||item.nextRenewalOn!==item.expiresOn||item.autoRenew))fail(`${label}: manual expiry or auto-renew mismatch`);
    if(typeof item.name!=="string"||!["active","paused","ended"].includes(item.status)||typeof item.autoRenew!=="boolean"||typeof item.reminderEnabled!=="boolean")fail(`${label}: invalid subscription fields`);
    if(!money(item.currentAmountMinor)||!/^[A-Z]{3}$/.test(item.currency))fail(`${label}: invalid amount or currency`);
    if(!validId(item.billingIntervalValue)||!["day","week","month","year"].includes(item.billingIntervalUnit))fail(`${label}: invalid billing interval`);
    if(!validDay(item.startedOn)||!validDay(item.nextRenewalOn))fail(`${label}: invalid start or renewal date`);
    if(!Array.isArray(item.payments)||!Array.isArray(item.priceChanges))fail(`${label}: missing payment or price history`);
    if(item.payments.length>=1000||item.priceChanges.length>=1000)fail(`${label}: history reached the 1000-row limit`);
    ids.add(item.id);history+=item.payments.length+item.priceChanges.length;
    const purchaseKeys=new Set<string>();
    for(const row of item.payments){
      if(!row||!validId(row.id)||paymentIds.has(row.id))fail(`${label}: invalid or duplicate payment ID`);
      const payment=`${label}, payment #${row.id}`;
      if(row.subscriptionId!==item.id)fail(`${payment}: subscription reference mismatch`);
      if(!money(row.amountMinor)||!/^[A-Z]{3}$/.test(row.currency))fail(`${payment}: invalid amount or currency`);
      if(!validDay(row.scheduledFor)||!validDay(row.paidOn))fail(`${payment}: invalid scheduled or paid date`);
      paymentIds.add(row.id);
      if(row.purchaseKey){
        try{parseSubscriptionPurchase({...row,amount:row.amountMinor/100});}catch{fail(`${payment}: invalid membership purchase metadata`);}
        if(purchaseKeys.has(row.purchaseKey))fail(`${payment}: duplicate purchase key`);
        purchaseKeys.add(row.purchaseKey);
      }else if(row.validUntil||row.purchasedValue||row.purchasedUnit||row.bonusValue||row.bonusUnit)fail(`${payment}: membership metadata has no purchase key`);
    }
    if(item.latestPayment!==undefined){
      const latest=[...item.payments].sort((a,b)=>b.paidOn.localeCompare(a.paidOn)||b.id-a.id)[0]??null,actual=item.latestPayment;
      // Native JSON round trips may reorder object keys. Payment fields are scalar.
      if(latest===null?actual!==null:!actual||Array.isArray(actual)||Object.keys(actual).length!==Object.keys(latest).length||Object.entries(latest).some(([key,entry])=>!Object.hasOwn(actual,key)||actual[key as keyof typeof actual]!==entry))fail(`${label}: latest payment does not match payment history`);
    }
    for(const row of item.priceChanges){
      if(!row||!validId(row.id)||changeIds.has(row.id))fail(`${label}: invalid or duplicate price-change ID`);
      if(row.subscriptionId!==item.id||!money(row.oldAmountMinor)||!money(row.newAmountMinor)||!validDay(row.effectiveOn)||!/^[A-Z]{3}$/.test(row.oldCurrency)||!/^[A-Z]{3}$/.test(row.newCurrency))fail(`${label}, price change #${row.id}: invalid reference, amount, currency or date`);
      changeIds.add(row.id);
    }
    const spend=subscriptionSpendByCurrency(item.payments);
    if(item.paymentCount!==item.payments.length)fail(`${label}: payment count does not match history`);
    if(item.totalSpentMinor!==(spend[item.currency]??0)||Object.values(spend).some(v=>!money(v))||!item.spendByCurrency||Object.keys(spend).length!==Object.keys(item.spendByCurrency).length||Object.entries(spend).some(([key,total])=>item.spendByCurrency[key]!==total))fail(`${label}: spending totals do not match payment history`);
    if(item.iconPath&&(!validSubscriptionIconKey(item.iconPath)||!value.iconSources[item.id]))fail(`${label}: invalid icon path or missing icon data`);
  }
  for(const [key,source] of Object.entries(value.iconSources))if(!ids.has(Number(key))||String(Number(key))!==key||typeof source!=="string"||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(source))fail("invalid subscription icon data or reference");
  if(value.library!==undefined||value.libraryIconSources!==undefined){
    if(!Array.isArray(value.library)||value.library.length>500)fail("invalid software library or more than 500 items");
    if(!value.libraryIconSources||typeof value.libraryIconSources!=="object"||Array.isArray(value.libraryIconSources))fail("invalid software icon map");
    const libraryIds=new Set<number>();
    for(const item of value.library){
      if(!item||!validId(item.id)||libraryIds.has(item.id))fail("invalid or duplicate software ID");
      const label=`software #${item.id}`;
      if(typeof item.iconPath!=="string"||!Number.isFinite(Date.parse(item.createdAt))||!Number.isFinite(Date.parse(item.updatedAt)))fail(`${label}: invalid icon path or timestamps`);
      try{parseSoftwareLibraryInput(item);}catch{fail(`${label}: invalid software metadata`);}
      if(item.iconPath&&(!validSubscriptionIconKey(item.iconPath)||!value.libraryIconSources[item.id]))fail(`${label}: invalid icon path or missing icon data`);
      libraryIds.add(item.id);
    }
    for(const [key,source] of Object.entries(value.libraryIconSources))if(!libraryIds.has(Number(key))||String(Number(key))!==key||typeof source!=="string"||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(source))fail("invalid software icon data or reference");
  }
  if(history>5000)fail("combined history exceeds the 5000-row limit");
  if(new TextEncoder().encode(JSON.stringify(value)).length>8*1024*1024)fail("snapshot exceeds the 8 MiB limit");
  return value;
}
export function readSubscriptionsSnapshot(value:SubscriptionsReadonlySnapshot,path:string,init?:RequestInit){
  if(init?.method&&init.method!=="GET")throw new Error("Subscriptions read-only adapter refused a write");
  if(path==="/api/subscriptions/library")return new Response(JSON.stringify(value.library??{error:"Refresh Subscriptions online to download your software library."}),{status:value.library?200:503,headers:{"Content-Type":"application/json"}});
  const match=/^\/api\/subscriptions(?:\/([1-9][0-9]*))?$/.exec(path);if(!match)throw new Error("Subscriptions read-only path refused");
  const data=match[1]?value.items.find(item=>item.id===Number(match[1])):value.items;
  return new Response(JSON.stringify(data??{error:"Not in downloaded Subscriptions snapshot"}),{status:data===undefined?404:200,headers:{"Content-Type":"application/json"}});
}
