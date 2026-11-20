"use client";
import {dateInEvaOrbit} from "@/lib/time";
import { SubscriptionFormFields, type SubscriptionDraft } from "./subscription-form-fields";
import {useBusinessRequest} from "@/components/business-request-context";
import { ErrorNotice } from "@/components/error-notice";
import {useFormPreview,FormPreviewNotice} from "@/components/form-preview";
import {useSubscriptionsData} from "@/components/subscriptions-data-context";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { FormSheet } from "@/components/form-sheet";
import { useLocale } from "@/components/locale-controller";
import type { ApiError, Subscription, SubscriptionPayment } from "@/lib/types";
import { SubscriptionIconField, saveIconSelection } from "./subscription-icon-field";
import { SubscriptionPreview } from "./preview/subscription-preview";

const today = () => dateInEvaOrbit();
const draft = (): SubscriptionDraft => ({ mode:"recurring",expiresOn:"",name: "", amount: "", currency: "CNY", billingIntervalValue: "1", billingIntervalUnit: "month", startedOn: today(), nextRenewalOn: today(), autoRenew: true, reminderEnabled: false, reminderDaysBefore: "3", reminderTime: "09:00", notes: "" });

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
      const response = await businessFetch("/api/subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, autoRenew: form.mode === "recurring" && form.autoRenew, expiresOn:form.mode==="manual"?form.expiresOn:undefined, billingIntervalValue: Number(form.billingIntervalValue), reminderDaysBefore: Number(form.reminderDaysBefore) }) });
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
    {show&&<FormSheet title={english?"Add subscription":"新增订阅"} onClose={closeCreate} formId="subscription-form" submitLabel={english?"Add subscription":"保存订阅"} busy={saving} submitDisabled={previewOnly}><form id="subscription-form" className="editor-card" onSubmit={submit}>{previewOnly&&<FormPreviewNotice/>}<SubscriptionFormFields draft={form} setDraft={setForm} icon={<SubscriptionIconField name={form.name} file={iconFile} disabled={previewOnly || saving} onChange={next => setIconFile(next)} />} />{error&&<ErrorNotice>{error}</ErrorNotice>}</form></FormSheet>}
  </>;
}
