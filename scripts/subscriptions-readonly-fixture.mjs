import {getRepository} from "../src/lib/repositories/index.ts";
import {parseNewSubscription,parseSubscriptionPayment} from "../src/lib/validation.ts";
import {saveSubscriptionIcon} from "../src/lib/services/subscription-icon.ts";
import {dateInEvaOrbit,shiftDate} from "../src/lib/time.ts";
export async function seedSubscriptions(){
  const repository=await getRepository(),today=dateInEvaOrbit();
  const create=(name,more={})=>repository.createSubscription(parseNewSubscription({name,amount:"30",currency:"CNY",billingIntervalValue:1,billingIntervalUnit:"month",startedOn:"2024-01-01",nextRenewalOn:"2025-01-01",autoRenew:true,notes:"Historical subscription canary",...more}));
  const automatic=await create("Offline ledger",{reminderEnabled:true,reminderTime:"09:00"});
  await repository.recordSubscriptionPayment(automatic.id,parseSubscriptionPayment({scheduledFor:"2024-12-01",paidOn:"2024-12-01",amount:"20",currency:"USD",note:"Old currency canary"}),"2025-01-01");
  await repository.updateSubscription(automatic.id,{currentAmountMinor:4900},"2025-01-01");
  const manual=await create("ChatGPT",{autoRenew:false,nextRenewalOn:shiftDate(today,20),amount:"20",currency:"USD"});
  await repository.recordSubscriptionPayment(manual.id,parseSubscriptionPayment({scheduledFor:today,paidOn:today,amount:"20",currency:"USD",note:"Current payment canary"}),shiftDate(today,20));
  const paused=await create("Paused service");await repository.setSubscriptionStatus(paused.id,"paused");
  const ended=await create("Ended service");await repository.setSubscriptionStatus(ended.id,"ended");
  const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6hUAAAAASUVORK5CYII=","base64");
  await saveSubscriptionIcon(automatic.id,new File([png],"subscription.png",{type:"image/png"}));
  return {automatic,manual,paused,ended};
}
