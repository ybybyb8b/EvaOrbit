"use client";

import { useId, useState, type FormEvent } from "react";
import { useBusinessRequest } from "@/components/business-request-context";
import { useFormPreview, FormPreviewNotice } from "@/components/form-preview";
import { FormSheet } from "@/components/form-sheet";
import { ErrorNotice } from "@/components/error-notice";
import { useLocale } from "@/components/locale-controller";
import { dateInEvaOrbit, shiftDate } from "@/lib/time";
import { responseError } from "@/lib/response-error";
import type { Subscription } from "@/lib/types";

export function RenewalDateSheet({ item, onClose, onSaved }: { item: Subscription; onClose: () => void; onSaved: (item: Subscription) => void }) {
  const { english } = useLocale(), request = useBusinessRequest(), previewOnly = useFormPreview(), formId = useId();
  const [next, setNext] = useState(item.nextRenewalOn), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const minimum = item.autoRenew ? [item.startedOn, shiftDate(dateInEvaOrbit(), 1)].sort().at(-1)! : item.startedOn;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (previewOnly || busy || next === item.nextRenewalOn) return;
    setBusy(true); setError("");
    try {
      const response = await request(`/api/subscriptions/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nextRenewalOn: next }) });
      if (!response.ok) { setError(await responseError(response, english ? "Couldn’t update the date. Try again." : "日期修改失败，请重试。")); return; }
      onSaved(await response.json() as Subscription); onClose();
    } catch { setError(english ? "Couldn’t update the date. Check your connection and try again." : "日期修改失败，请检查网络后重试。"); }
    finally { setBusy(false); }
  }
  return <FormSheet title={english ? "Adjust renewal date" : "调整续费日期"} onClose={onClose} formId={formId} submitLabel={english ? "Save date" : "保存日期"} busy={busy} submitDisabled={previewOnly || next === item.nextRenewalOn}>
    <form id={formId} className="editor-card" onSubmit={submit}>
      {previewOnly && <FormPreviewNotice />}
      <p>{item.name}</p>
      <p className="date-only-note">{english ? `Currently planned for ${item.nextRenewalOn}. This changes the next renewal and its reminder; it does not record a payment or change past payments.` : `原计划 ${item.nextRenewalOn}。仅调整下一次续费及其提醒，不记录付款，也不改写已有付款。`}</p>
      <label className="field"><span>{english ? "New renewal date" : "新的续费日期"}</span><input required type="date" min={minimum} value={next} onChange={event => setNext(event.target.value)} /></label>
      {item.autoRenew && <p className="date-only-note">{english ? "Automatic entries remain enabled and will follow the new date. Choose a future date. For payments confirmed by another person, you can turn off automatic entries in Edit." : "自动记账仍然开启，将按新日期执行，请选择未来日期。拼车等需对方确认付款的订阅，可在编辑中关闭自动记账。"}</p>}
      {error && <ErrorNotice>{error}</ErrorNotice>}
    </form>
  </FormSheet>;
}
