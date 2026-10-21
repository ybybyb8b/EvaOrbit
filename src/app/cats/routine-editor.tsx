"use client";
import {useBusinessRequest} from "@/components/business-request-context";
import {useFormPreview,FormPreviewNotice} from "@/components/form-preview";

import { ErrorNotice } from "@/components/error-notice";
import { ChoiceSelect } from "@/components/choice-select";
import { useLocale } from "@/components/locale-controller";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import type { CatRoutine, Pet } from "@/lib/types";
import { reconcileNativeNotifications } from "@/lib/native-bridge";
import { playNativeHaptic } from "@/lib/native-haptics";

type Props = {
  pets: Pet[];
  initialPetId?: number | null;
  initialScope?: CatRoutine["scope"];
  editing?: CatRoutine;
  onCancel: () => void;
  onSaved: (message: string) => void;
  onSavingChange?: (saving: boolean) => void;
};
type RoutineDraft = { scope: CatRoutine["scope"]; petId: number | null; title: string; intervalValue: number; intervalUnit: CatRoutine["intervalUnit"]; recurrenceMode: CatRoutine["recurrenceMode"]; anchorDate: string; firstDueDate: string; nextDueDate: string; configuredReminderTime: string; reminderLeadMinutes: number; repeatWhileOverdue: boolean; notes: string; enabled: boolean };

function localInput(value?: string) {
  const date = value ? new Date(value) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

export function RoutineEditor({ pets, initialPetId, initialScope, editing, onCancel, onSaved, onSavingChange }: Props) {
  const businessFetch=useBusinessRequest(); const previewOnly=useFormPreview();
  const { english } = useLocale();
  const initial = useMemo<RoutineDraft>(() => ({
    scope: editing?.scope ?? initialScope ?? (initialPetId ? "cat" : "household") as CatRoutine["scope"],
    petId: editing?.petId ?? initialPetId ?? pets[0]?.id ?? null,
    title: editing?.title ?? "",
    intervalValue: editing?.intervalValue ?? 30,
    intervalUnit: editing?.intervalUnit ?? "day" as CatRoutine["intervalUnit"],
    recurrenceMode: editing?.recurrenceMode ?? "completion",
    anchorDate: editing?.anchorDate ?? localInput(editing?.firstDueAt),
    firstDueDate: editing?.firstDueDate ?? localInput(editing?.firstDueAt),
    nextDueDate: editing?.nextDueDate ?? localInput(editing?.nextDueAt),
    configuredReminderTime: editing?.configuredReminderTime ?? "20:00",
    reminderLeadMinutes: editing?.reminderLeadMinutes ?? 1440,
    repeatWhileOverdue: editing?.repeatWhileOverdue ?? false,
    notes: editing?.notes ?? "",
    enabled: editing?.enabled ?? true,
  }), [editing, initialPetId, initialScope, pets]);
  const [draft, setDraft] = useState<RoutineDraft>(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => onSavingChange?.(saving), [onSavingChange, saving]);
  const suggestions = draft.scope === "cat" ? ["Deworming", "Nail trim"] : ["Filter change", "Deep clean"];
  async function submit(event: FormEvent) {
    event.preventDefault(); if(previewOnly || saving)return; setSaving(true); setError("");
    const response = await businessFetch(editing ? `/api/cats/routines/${editing.id}` : "/api/cats/routines", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, petId: draft.scope === "cat" ? draft.petId : null, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }) });
    setSaving(false);
    if (!response.ok) { playNativeHaptic("error"); setError((await response.json()).error ?? "Could not save routine"); return; }
    try { await reconcileNativeNotifications(); } catch { /* The browser push path remains active. */ }
    onSaved(editing ? "Routine updated" : "Routine created");
  }
  return <form className="editor-card routine-editor" onSubmit={submit}>{previewOnly&&<FormPreviewNotice/>}
    <div className="editor-title"><div><span className="eyebrow">ROUTINE</span><h2>{editing ? "Edit routine" : "Add routine"}</h2></div><button type="button" className="text-button" onClick={onCancel}>Cancel</button></div>
    <p className="cat-form-help">{english?"Plan recurring care here. To record something already done, use Record care.":"在这里安排周期护理。已经完成的护理，请使用「记录护理」。"}</p>
    <div className="routine-scope" role="group" aria-label="Routine scope"><button type="button" className={draft.scope === "cat" ? "active" : ""} onClick={() => setDraft({ ...draft, scope: "cat", petId: draft.petId ?? pets[0]?.id ?? null })}>This cat</button><button type="button" className={draft.scope === "household" ? "active" : ""} onClick={() => setDraft({ ...draft, scope: "household", petId: null })}>Household</button></div>
    <div className="routine-suggestions">{suggestions.map(value => <button type="button" key={value} onClick={() => setDraft({ ...draft, title: value })}>{value}</button>)}</div>
    <div className="form-grid">
      {draft.scope === "cat" && <label className="field"><span>Cat</span><ChoiceSelect required value={draft.petId ?? ""} onChange={e => setDraft({ ...draft, petId: Number(e.target.value) })}>{pets.map(pet => <option value={pet.id} key={pet.id}>{pet.name}</option>)}</ChoiceSelect></label>}
      <label className="field"><span>{english?"What needs doing?":"要做什么护理"}</span><input required maxLength={200} placeholder={english?"e.g. Nail trim, filter change":"例如：剪指甲、更换滤芯"} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })}/></label>
      <label className="field"><span>Repeat every</span><div className="field-inline"><input type="number" min="1" max="999" required value={draft.intervalValue} onChange={e => setDraft({ ...draft, intervalValue: Number(e.target.value) })}/><ChoiceSelect value={draft.intervalUnit} onChange={e => setDraft({ ...draft, intervalUnit: e.target.value as CatRoutine["intervalUnit"] })}><option value="day">days</option><option value="week">weeks</option><option value="month">months</option></ChoiceSelect></div></label>
      <label className="field"><span>{editing ? "Next reminder date" : "First reminder date"}</span><input type="date" required value={editing ? draft.nextDueDate : draft.firstDueDate} onInput={e => setDraft(editing ? { ...draft, nextDueDate: e.currentTarget.value, anchorDate: e.currentTarget.value } : { ...draft, firstDueDate: e.currentTarget.value, nextDueDate: e.currentTarget.value, anchorDate: e.currentTarget.value })}/></label>
      <label className="field"><span>Reminder time</span><input type="time" required value={draft.configuredReminderTime} onChange={e=>setDraft({...draft,configuredReminderTime:e.target.value})}/></label>
      <details className="cat-form-disclosure wide"><summary>{english?"Recurrence and notification settings":"周期与通知设置"}</summary><div className="form-grid">
      <label className="field"><span>{english?"Calculate the next date from":"下次日期如何计算"}</span><ChoiceSelect value={draft.recurrenceMode} onChange={e=>setDraft({...draft,recurrenceMode:e.target.value as CatRoutine["recurrenceMode"]})}><option value="completion">{english?"When care is completed":"从实际完成日期起算"}</option><option value="fixed">{english?"Scheduled date; restart if overdue":"按计划日期；逾期后重新起算"}</option></ChoiceSelect></label>
      <label className="field"><span>Remind</span><ChoiceSelect value={draft.reminderLeadMinutes} onChange={e => setDraft({ ...draft, reminderLeadMinutes: Number(e.target.value) })}><option value={0}>At due time</option><option value={60}>1 hour before</option><option value={1440}>1 day before</option><option value={4320}>3 days before</option><option value={10080}>1 week before</option></ChoiceSelect></label>
      <label className="check-row wide"><input role="switch" className="toggle-switch" type="checkbox" checked={draft.repeatWhileOverdue} onChange={e=>setDraft({...draft,repeatWhileOverdue:e.target.checked})}/><span>Remind me daily while overdue</span></label>
      </div></details>
      <label className="field wide"><span>Notes <small>Optional</small></span><textarea rows={3} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })}/></label>
      {editing && <label className="check-row wide"><input role="switch" className="toggle-switch" type="checkbox" checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })}/><span>Routine enabled</span></label>}
    </div>
    {error && <ErrorNotice>{error}</ErrorNotice>}<button className="button primary" disabled={previewOnly || saving}>{saving ? "Saving…" : "Save routine"}</button>
  </form>;
}
