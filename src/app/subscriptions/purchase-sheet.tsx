"use client";
import {useId,useState,type FormEvent} from "react";
import {useBusinessRequest} from "@/components/business-request-context";
import {useFormPreview,FormPreviewNotice} from "@/components/form-preview";
import {useLocale} from "@/components/locale-controller";
import {ChoiceSelect} from "@/components/choice-select";
import {FormSheet} from "@/components/form-sheet";
import {ErrorNotice} from "@/components/error-notice";
import {responseError} from "@/lib/response-error";
import {dateInEvaOrbit} from "@/lib/time";
import {nextSubscriptionRenewal} from "@/lib/subscriptions";
import type {Subscription,SubscriptionPayment,SubscriptionIntervalUnit} from "@/lib/types";

export function PurchaseSheet({item,purchase,onClose,onSaved}:{item:Subscription;purchase?:SubscriptionPayment;onClose:()=>void;onSaved:()=>Promise<void>}){
  const request=useBusinessRequest(),preview=useFormPreview(),{english}=useLocale(),id=useId(),t=(en:string,zh:string)=>english?en:zh;
  // getRandomValues also works on the native eo-local custom origin.
  const [key]=useState(()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,"0")).join(""));
  const [form,setForm]=useState({paidOn:purchase?.paidOn??dateInEvaOrbit(),amount:purchase?(purchase.amountMinor/100).toFixed(2):"",currency:purchase?.currency??item.latestPayment?.currency??item.currency,validUntil:purchase?.validUntil??"",purchasedValue:purchase?.purchasedValue?String(purchase.purchasedValue):"",purchasedUnit:purchase?.purchasedUnit??"month" as SubscriptionIntervalUnit,bonusValue:purchase?.bonusValue?String(purchase.bonusValue):"",bonusUnit:purchase?.bonusUnit??"month" as SubscriptionIntervalUnit,note:purchase?.note??""});
  const update=<K extends keyof typeof form>(key:K,value:(typeof form)[K])=>setForm(current=>({...current,[key]:value}));
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  function estimate(){let end=[form.paidOn,item.expiresOn??form.paidOn].sort().at(-1)!;for(const [value,unit]of [[form.purchasedValue,form.purchasedUnit],[form.bonusValue,form.bonusUnit]] as const){if(value){const n=Number(value);if(!Number.isInteger(n)||n<1||n>36500)return;end=nextSubscriptionRenewal(end,n,unit);}}update("validUntil",end);}
  async function submit(event:FormEvent){event.preventDefault();if(busy||preview)return;setBusy(true);setError("");try{
    const body={...form,purchaseKey:purchase?.purchaseKey??key,purchasedValue:form.purchasedValue?Number(form.purchasedValue):null,purchasedUnit:form.purchasedValue?form.purchasedUnit:null,bonusValue:form.bonusValue?Number(form.bonusValue):null,bonusUnit:form.bonusValue?form.bonusUnit:null};
    const original=purchase?{...purchase,amount:(purchase.amountMinor/100).toFixed(2)}:undefined;
    const response=await request(`/api/subscriptions/${item.id}/purchases${purchase?`/${purchase.id}`:""}`,{method:purchase?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...body,original})});
    if(!response.ok){setError(await responseError(response,t("Couldn’t save purchase.","购买记录保存失败。")));return;}
    // An acknowledged purchase is final even if the following read is unavailable.
    await onSaved().catch(()=>{});onClose();
  }catch{setError(t("Couldn’t confirm the result. Refresh before changing details; retrying this purchase will not duplicate it.","暂时无法确认结果。修改内容前请先刷新；重试本次购买不会重复记账。"));}finally{setBusy(false);}}
  const units=(value:SubscriptionIntervalUnit,onChange:(value:SubscriptionIntervalUnit)=>void)=><ChoiceSelect value={value} onChange={e=>onChange(e.target.value as SubscriptionIntervalUnit)}>{(["day","week","month","year"] as const).map(unit=><option key={unit} value={unit}>{english?unit:({day:"天",week:"周",month:"个月",year:"年"}[unit])}</option>)}</ChoiceSelect>;
  return <FormSheet title={purchase?t("Edit purchase","修改购买记录"):t("Record purchase","记录购买")} onClose={onClose} formId={id} submitLabel={purchase?t("Save changes","保存修改"):t("Record purchase","保存购买")} busy={busy} submitDisabled={preview}><form id={id} className="editor-card subscription-purchase-form" onSubmit={submit}>{preview&&<FormPreviewNotice/>}<p>{item.name}</p><div className="form-grid">
    <label className="field"><span>{t("Purchased on","购买日期")}</span><input required type="date" max={dateInEvaOrbit()} value={form.paidOn} onChange={e=>update("paidOn",e.target.value)}/></label>
    <label className="field"><span>{t("Amount paid","实付金额")}</span><input required inputMode="decimal" value={form.amount} onChange={e=>update("amount",e.target.value)}/></label>
    <label className="field wide"><span>{t("Currency","币种")}</span><input required pattern="[A-Za-z]{3}" maxLength={3} value={form.currency} onChange={e=>update("currency",e.target.value.toUpperCase())}/></label>
    <label className="field"><span>{t("Purchased duration · optional","购买时长 · 选填")}</span><input type="number" min="1" max="36500" step="1" value={form.purchasedValue} onChange={e=>update("purchasedValue",e.target.value)}/></label><label className="field"><span>{t("Duration unit","购买时长单位")}</span>{units(form.purchasedUnit,v=>update("purchasedUnit",v))}</label>
    <label className="field"><span>{t("Bonus duration · optional","赠送时长 · 选填")}</span><input type="number" min="1" max="36500" step="1" value={form.bonusValue} onChange={e=>update("bonusValue",e.target.value)}/></label><label className="field"><span>{t("Bonus unit","赠送时长单位")}</span>{units(form.bonusUnit,v=>update("bonusUnit",v))}</label>
    <label className="field wide"><span>{t("Final membership expiry","最终会员有效期")}</span><input required type="date" aria-label={t("Final membership expiry","最终会员有效期")} aria-describedby={id+"-expiry-hint"} min={form.paidOn} value={form.validUntil} onChange={e=>update("validUntil",e.target.value)}/><small id={id+"-expiry-hint"}>{purchase?t("The latest purchase updates membership expiry. A separately adjusted expiry is preserved.","最新购买的有效期修正会同步到会员；曾单独调整的当前有效期将保留。所填时长仅记录权益。") : t("Use the expiry shown by the provider. Older purchases never shorten your current membership.","以平台实际显示日期为准。补录历史购买不会缩短当前会员有效期。")}</small></label>
    {!purchase&&(form.purchasedValue||form.bonusValue)&&<button className="text-button wide" type="button" onClick={estimate}>{t("Fill estimated expiry","填入预计到期日")}</button>}
    <label className="field wide"><span id={id+"-note-label"}>{t("Purchase note","购买备注")}</span><textarea aria-labelledby={id+"-note-label"} rows={3} maxLength={5000} value={form.note} onChange={e=>update("note",e.target.value)}/></label>
  </div>{error&&<ErrorNotice>{error}</ErrorNotice>}</form></FormSheet>;
}
