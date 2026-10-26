import "server-only";
import {getRepository,withSubscriptionsReadOnlyRepository} from "../repositories";
import {dateInEvaOrbit} from "../time";
import {subscriptionSpendByCurrency} from "../subscriptions";
import {validateSubscriptionsSnapshot,type SubscriptionsReadonlySnapshot} from "../subscriptions-readonly";
import {readSubscriptionIcon} from "./subscription-icon";
import {readSoftwareLibraryIcon} from "./software-library-icon";

export async function getSubscriptionsReadonlySnapshot(accountId:string){return withSubscriptionsReadOnlyRepository(async()=>{
  const repository=await getRepository();
  // Never use list/getSubscription services: their reads intentionally catch up automatic payments.
  const subscriptions=await repository.listSubscriptions({limit:201});
  if(subscriptions.length>200)throw new Error("Subscriptions exceeds 200 items; previous cache preserved");
  const items:SubscriptionsReadonlySnapshot["items"]=[],iconSources:Record<number,string>={};let bytes=0,history=0;
  for(const item of subscriptions){
    const [payments,priceChanges]=await Promise.all([repository.listSubscriptionPayments(item.id),repository.listSubscriptionPriceChanges(item.id)]);
    history+=payments.length+priceChanges.length;
    if(payments.length>=1000||priceChanges.length>=1000||history>5000)throw new Error("Subscription history reached the acceptance boundary; full pagination required. Previous cache preserved.");
    const spendByCurrency=subscriptionSpendByCurrency(payments);
    items.push({...item,latestPayment:payments[0]??null,payments,priceChanges,paymentCount:payments.length,spendByCurrency,totalSpentMinor:spendByCurrency[item.currency]??0,latestPriceChange:priceChanges[0]??null});
    if(item.iconPath){
      const image=await readSubscriptionIcon(item.id,item.iconPath);
      if(!image){items[items.length-1].iconPath="";continue;}
      if(image.bytes.length>4*1024*1024)throw new Error("Subscription icon exceeds the cache limit; previous cache preserved");
      iconSources[item.id]=`data:${image.mime};base64,${Buffer.from(image.bytes).toString("base64")}`;
      bytes+=iconSources[item.id].length;if(bytes>8*1024*1024)throw new Error("Subscription icons exceed the acceptance limit; previous cache preserved");
    }
  }
  const library=(await repository.listSoftwareLibrary()).map(item=>({...item})),libraryIconSources:Record<number,string>={};
  if(library.length>500)throw new Error("Software library exceeds 500 items; previous cache preserved");
  for(const item of library){
    if(!item.iconPath)continue;
    const image=await readSoftwareLibraryIcon(item.id,item.iconPath);
    if(!image){item.iconPath="";continue;}
    if(image.bytes.length>4*1024*1024)throw new Error("Software icon exceeds the cache limit; previous cache preserved");
    libraryIconSources[item.id]=`data:${image.mime};base64,${Buffer.from(image.bytes).toString("base64")}`;
    bytes+=libraryIconSources[item.id].length;
    if(bytes>8*1024*1024)throw new Error("Subscription and software icons exceed the cache limit; previous cache preserved");
  }
  return validateSubscriptionsSnapshot({format:"eo-subscriptions-readonly-v1",accountId,capturedAt:new Date().toISOString(),today:dateInEvaOrbit(),items,iconSources,library,libraryIconSources},accountId);
});}
