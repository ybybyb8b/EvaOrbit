"use client";
import {useId,useState,type FormEvent} from "react";
import {useBusinessRequest} from "@/components/business-request-context";
import {useFormPreview,FormPreviewNotice} from "@/components/form-preview";
import {useLocale} from "@/components/locale-controller";
import {FormSheet} from "@/components/form-sheet";
import {ErrorNotice} from "@/components/error-notice";
import {responseError} from "@/lib/response-error";
import {dateInEvaOrbit} from "@/lib/time";
import type {SubscriptionPayment} from "@/lib/types";

export function PaymentDateSheet({payment,onClose,onSaved}:{payment:SubscriptionPayment;onClose:()=>void;onSaved:()=>Promise<void>}){
  const request=useBusinessRequest(),preview=useFormPreview(),{english}=useLocale(),id=useId();
  const [paidOn,setPaidOn]=useState(payment.paidOn),[busy,setBusy]=useState(false),[error,setError]=useState("");
  async function save(event:FormEvent){event.preventDefault();if(busy||preview||paidOn===payment.paidOn)return;setBusy(true);setError("");try{
    const response=await request(`/api/subscriptions/${payment.subscriptionId}/payments/${payment.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({paidOn,expectedPaidOn:payment.paidOn})});
    if(!response.ok){setError(await responseError(response,english?"Couldn’t save the date.":"付款日期修改失败。"));return;}
    await onSaved().catch(()=>{});onClose();
  }catch{setError(english?"Couldn’t confirm the result. Check your connection and retry.":"暂时无法确认结果，请检查网络后重试。");}finally{setBusy(false);}}
  return <FormSheet title={english?"Correct payment date":"修正付款日期"} formId={id} onClose={onClose} busy={busy} submitLabel={english?"Save date":"保存日期"} submitDisabled={preview||paidOn===payment.paidOn}>
    <form id={id} className="editor-card" onSubmit={save}>{preview&&<FormPreviewNotice/>}
      <p className="date-only-note">{english?`Billing date stays ${payment.scheduledFor}. This corrects when you paid; the renewal schedule stays unchanged.`:`账期归属日仍为 ${payment.scheduledFor}。此处修正实际付款日，续费计划保持不变。`}</p>
      <label className="field"><span>{english?"Actual payment date":"实际付款日期"}</span><input required type="date" max={dateInEvaOrbit()} value={paidOn} onChange={event=>setPaidOn(event.target.value)}/></label>
      {error&&<ErrorNotice>{error}</ErrorNotice>}
    </form>
  </FormSheet>;
}
