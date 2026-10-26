import type {NewSubscriptionPurchase} from "./repositories/types";
import type {SubscriptionPayment} from "./types";
/** The same retry token must never silently acknowledge different purchase details. */
export function sameSubscriptionPurchase(payment:SubscriptionPayment,input:NewSubscriptionPurchase){
  return (["paidOn","amountMinor","currency","note","validUntil","purchasedValue","purchasedUnit","bonusValue","bonusUnit"] as const).every(key=>(payment[key]??null)===(input[key]??null));
}
