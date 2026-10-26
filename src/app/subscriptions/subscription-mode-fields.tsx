"use client";
import {ChoiceSelect} from "@/components/choice-select";
import {useLocale} from "@/components/locale-controller";
import {useId} from "react";
type Mode="recurring"|"manual";
export function SubscriptionModeFields({mode,expiresOn,onMode,onExpiry}:{mode:Mode;expiresOn:string;onMode:(value:Mode)=>void;onExpiry:(value:string)=>void}){
  const {english}=useLocale(),id=useId();
  return <><label className="field wide"><span>{english?"Subscription mode":"订阅模式"}</span><ChoiceSelect value={mode} onChange={e=>onMode(e.target.value as Mode)}><option value="recurring">{english?"Automatic / Recurring":"固定周期"}</option><option value="manual">{english?"Manual renewal":"手动续期会员"}</option></ChoiceSelect></label>{mode==="manual"&&<label className="field wide"><span id={id+"-label"}>{english?"Membership valid until":"会员有效期至"}</span><input required type="date" aria-labelledby={id+"-label"} aria-describedby={id+"-hint"} value={expiresOn} onChange={e=>onExpiry(e.target.value)}/><small id={id+"-hint"}>{english?"Purchases are recorded separately. Expiry alone never creates a payment.":"购买后单独记账，到期不会自动产生付款。"}</small></label>}</>;
}
