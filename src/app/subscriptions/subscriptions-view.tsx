"use client";
import {dateInEvaOrbit} from "@/lib/time";
import {SubscriptionModeFields} from "./subscription-mode-fields";
import {useBusinessRequest} from "@/components/business-request-context";
import { ErrorNotice } from "@/components/error-notice";
import { ChoiceSelect } from "@/components/choice-select";
import { SuggestedInput } from "@/components/suggested-input";
import {useFormPreview,FormPreviewNotice} from "@/components/form-preview";
import {useSubscriptionsData} from "@/components/subscriptions-data-context";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { FormSheet } from "@/components/form-sheet";
import { useLocale } from "@/components/locale-controller";
import type { ApiError, Subscription, SubscriptionIntervalUnit, SubscriptionPayment } from "@/lib/types";
import { SubscriptionIconField, saveIconSelection } from "./subscription-icon-field";
import { SubscriptionPreview } from "./preview/subscription-preview";

const today = () => dateInEvaOrbit();
const draft = () => ({ mode:"recurring" as "recurring"|"manual",expiresOn:"",name: "", amount: "", currency: "CNY", billingIntervalValue: "1", billingIntervalUnit: "month" as SubscriptionIntervalUnit, startedOn: today(), nextRenewalOn: today(), autoRenew: true, reminderEnabled: false, reminderDaysBefore: "3", reminderTime: "09:00", notes: "" });

export function SubscriptionsView(props:React.ComponentProps<typeof SubscriptionsContent>){const router=useRouter();return <SubscriptionsContent {...props} onSaved={()=>router.refresh()}/>;}

export function SubscriptionsContent({ initial, payments, today: currentDate,onSaved,initialView }: { onSaved?:()=>void; initial: Subscription[]; payments: SubscriptionPayment[]; today: string; initialView?: "home" | "trends" }) {
  const businessFetch=useBusinessRequest();
  const {english}=useLocale();
  const previewOnly=useFormPreview();const {iconSources}=useSubscriptionsData();
  const [show, setShow] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState(""), [form, setForm] = useState(draft);
  const [iconFile, setIconFile] = useState<File | null>(null);
  function openCreate() { setForm(draft()); setIconFile(null); setError(""); setShow(true); }
  function closeCreate() { setShow(false); setError(""); setIconFile(null); setForm(draft()); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (previewOnly || saving) return; setSaving(true); setError("");
    try {
      const response = await businessFetch("/api/subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, expiresOn:form.mode==="manual"?form.expiresOn:undefined, billingIntervalValue: Number(form.billingIntervalValue), reminderDaysBefore: Number(form.reminderDaysBefore) }) });
      const result = await response.json() as Subscription | ApiError;
      if (!response.ok) { setError((result as ApiError).error); return; }
      let iconError = "";
      try { await saveIconSelection((result as Subscription).id, iconFile, false, businessFetch); }
      catch { iconError = english ? "Subscription created, but its icon could not be uploaded. You can retry in Edit." : "订阅已创建，但图标上传失败，可在编辑订阅中重试。"; }
      closeCreate();
      if (iconError) setError(iconError);
      onSaved?.();
    } catch {
      setError(english ? "Couldn’t save. Please try again." : "保存失败，请重试。");
    } finally { setSaving(false); }
  }
  return <>
    {error && !show && <ErrorNotice role="alert">{error}</ErrorNotice>}
    <SubscriptionPreview initialView={initialView} items={initial} payments={payments} today={currentDate} iconSources={iconSources} onCreate={openCreate} refined />
    {show&&<FormSheet title={english?"Add subscription":"新增订阅"} onClose={closeCreate} formId="subscription-form" submitLabel={english?"Add subscription":"保存订阅"} busy={saving} submitDisabled={previewOnly}><form id="subscription-form" className="editor-card subscription-editor" onSubmit={submit}>{previewOnly&&<FormPreviewNotice/>}<div className="form-grid"><SubscriptionIconField name={form.name} file={iconFile} disabled={previewOnly || saving} onChange={next => setIconFile(next)} /><label className="field wide"><span>{english?"Name":"名称"}</span><input autoFocus required maxLength={200} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><SubscriptionModeFields mode={form.mode} expiresOn={form.expiresOn} onMode={mode=>setForm(current=>({...current,mode,expiresOn:current.expiresOn||current.nextRenewalOn,autoRenew:mode==="manual"?false:current.autoRenew}))} onExpiry={expiresOn=>setForm(current=>({...current,expiresOn}))}/>{form.mode!=="manual"&&<><label className="field"><span>{english?"Amount":"金额"}</span><input required inputMode="decimal" placeholder="30.00" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></label><div className="field"><span>{english?"Currency":"币种"}</span><SuggestedInput suggestionLabel="币种" suggestions={["CNY", "USD", "EUR", "HKD", "JPY", "GBP"]} required maxLength={3} value={form.currency} onValueChange={nextValue =>setForm({...form,currency:nextValue.toUpperCase()})}/></div><label className="field"><span>{english?"Every":"每隔"}</span><input required type="number" min="1" max="999" value={form.billingIntervalValue} onChange={e=>setForm({...form,billingIntervalValue:e.target.value})}/></label><label className="field"><span>{english?"Cycle":"周期"}</span><ChoiceSelect value={form.billingIntervalUnit} onChange={e=>setForm({...form,billingIntervalUnit:e.target.value as SubscriptionIntervalUnit})}><option value="day">{english?"Days":"天"}</option><option value="week">{english?"Weeks":"周"}</option><option value="month">{english?"Months":"月"}</option><option value="year">{english?"Years":"年"}</option></ChoiceSelect></label><label className="field"><span>{english?"Started":"开始日期"}</span><input required type="date" value={form.startedOn} onChange={e=>setForm({...form,startedOn:e.target.value})}/></label><label className="field"><span>{english?"Next renewal":"下次续费"}</span><input required type="date" value={form.nextRenewalOn} onChange={e=>setForm({...form,nextRenewalOn:e.target.value})}/></label><label className="check-row wide"><input role="switch" className="toggle-switch" type="checkbox" checked={form.autoRenew} onChange={e=>setForm({...form,autoRenew:e.target.checked})}/><span><strong>{english?"Auto-renew and record payments":"自动续费并自动记账"}</strong></span></label></>}<label className="check-row wide"><input role="switch" className="toggle-switch" type="checkbox" checked={form.reminderEnabled} onChange={e=>setForm({...form,reminderEnabled:e.target.checked})}/><span><strong>{form.mode==="manual"?(english?"Expiry reminder":"到期提醒"):(english?"Renewal reminder":"续费提醒")}</strong></span></label>{form.reminderEnabled&&<><label className="field"><span>{english?"Days before":"提前天数"}</span><input required type="number" min="0" max="3650" value={form.reminderDaysBefore} onChange={e=>setForm({...form,reminderDaysBefore:e.target.value})}/></label><label className="field"><span>{english?"Reminder time":"提醒时间"}</span><input required type="time" value={form.reminderTime} onChange={e=>setForm({...form,reminderTime:e.target.value})}/></label></>}<label className="field wide"><span>{english?"Notes":"备注"} <small>{english?"Optional":"可选"}</small></span><textarea rows={3} maxLength={5000} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label></div>{error&&<ErrorNotice>{error}</ErrorNotice>}</form></FormSheet>}
  </>;
}
