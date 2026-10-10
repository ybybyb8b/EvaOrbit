"use client";
import { ChoiceSelect } from "@/components/choice-select";
import { SuggestedInput } from "@/components/suggested-input";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { FormSheet } from "@/components/form-sheet";
import { useLocale } from "@/components/locale-controller";
import type { ApiError, Subscription, SubscriptionIntervalUnit, SubscriptionPayment } from "@/lib/types";
import { SubscriptionPreview } from "./preview/subscription-preview";

const today = () => new Date().toLocaleDateString("en-CA");
const draft = () => ({ name: "", amount: "", currency: "CNY", billingIntervalValue: "1", billingIntervalUnit: "month" as SubscriptionIntervalUnit, startedOn: today(), nextRenewalOn: today(), autoRenew: true, reminderEnabled: false, reminderDaysBefore: "3", reminderTime: "09:00", notes: "" });

export function SubscriptionsView({ initial, payments, today: currentDate, refined = false }: { initial: Subscription[]; payments: SubscriptionPayment[]; today: string; refined?: boolean }) {
  const { english } = useLocale();
  const router = useRouter();
  const [show, setShow] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState(""), [form, setForm] = useState(draft);
  function openCreate() { setForm(draft()); setError(""); setShow(true); }
  function closeCreate() { setShow(false); setError(""); setForm(draft()); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch("/api/subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, billingIntervalValue: Number(form.billingIntervalValue), reminderDaysBefore: Number(form.reminderDaysBefore) }) });
      const result = await response.json() as Subscription | ApiError;
      if (!response.ok) { setError((result as ApiError).error); return; }
      closeCreate();
      router.refresh();
    } catch {
      setError(english ? "Couldn’t save. Please try again." : "保存失败，请重试。");
    } finally { setSaving(false); }
  }
  return <>
    <SubscriptionPreview items={initial} payments={payments} today={currentDate} onCreate={openCreate} refined={refined} />
    {show&&<FormSheet title={english?"Add subscription":"新增订阅"} onClose={closeCreate} formId="subscription-form" submitLabel={english?"Add subscription":"保存订阅"} busy={saving}><form id="subscription-form" className="editor-card subscription-editor" onSubmit={submit}><div className="form-grid"><label className="field wide"><span>{english?"Name":"名称"}</span><input autoFocus required maxLength={200} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label className="field"><span>{english?"Amount":"金额"}</span><input required inputMode="decimal" placeholder="30.00" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></label><div className="field"><span>{english?"Currency":"币种"}</span><SuggestedInput suggestionLabel="币种" suggestions={["CNY", "USD", "EUR", "HKD", "JPY", "GBP"]} required maxLength={3} value={form.currency} onValueChange={nextValue =>setForm({...form,currency:nextValue.toUpperCase()})}/></div><label className="field"><span>{english?"Every":"每隔"}</span><input required type="number" min="1" max="999" value={form.billingIntervalValue} onChange={e=>setForm({...form,billingIntervalValue:e.target.value})}/></label><label className="field"><span>{english?"Cycle":"周期"}</span><ChoiceSelect value={form.billingIntervalUnit} onChange={e=>setForm({...form,billingIntervalUnit:e.target.value as SubscriptionIntervalUnit})}><option value="day">{english?"Days":"天"}</option><option value="week">{english?"Weeks":"周"}</option><option value="month">{english?"Months":"月"}</option><option value="year">{english?"Years":"年"}</option></ChoiceSelect></label><label className="field"><span>{english?"Started":"开始日期"}</span><input required type="date" value={form.startedOn} onChange={e=>setForm({...form,startedOn:e.target.value})}/></label><label className="field"><span>{english?"Next renewal":"下次续费"}</span><input required type="date" value={form.nextRenewalOn} onChange={e=>setForm({...form,nextRenewalOn:e.target.value})}/></label><label className="check-row wide"><input role="switch" className="toggle-switch" type="checkbox" checked={form.autoRenew} onChange={e=>setForm({...form,autoRenew:e.target.checked})}/><span><strong>{english?"Auto-renew and record payments":"自动续费并自动记账"}</strong></span></label><label className="check-row wide"><input role="switch" className="toggle-switch" type="checkbox" checked={form.reminderEnabled} onChange={e=>setForm({...form,reminderEnabled:e.target.checked})}/><span><strong>{english?"Renewal reminder":"续费提醒"}</strong></span></label>{form.reminderEnabled&&<><label className="field"><span>{english?"Days before":"提前天数"}</span><input required type="number" min="0" max="3650" value={form.reminderDaysBefore} onChange={e=>setForm({...form,reminderDaysBefore:e.target.value})}/></label><label className="field"><span>{english?"Reminder time":"提醒时间"}</span><input required type="time" value={form.reminderTime} onChange={e=>setForm({...form,reminderTime:e.target.value})}/></label></>}<label className="field wide"><span>{english?"Notes":"备注"} <small>{english?"Optional":"可选"}</small></span><textarea rows={3} maxLength={5000} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label></div>{error&&<p className="form-error">{error}</p>}</form></FormSheet>}
  </>;
}
