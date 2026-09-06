"use client";

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
type RoutineDraft = { scope: CatRoutine["scope"]; petId: number | null; title: string; intervalValue: number; intervalUnit: CatRoutine["intervalUnit"]; recurrenceMode: CatRoutine["recurrenceMode"]; anchorDate: string; firstDueDate: string; nextDueDate: string; configuredReminderTime: string; reminderLeadMinutes: number; notes: string; enabled: boolean };

function localInput(value?: string) {
  const date = value ? new Date(value) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

export function RoutineEditor({ pets, initialPetId, initialScope, editing, onCancel, onSaved, onSavingChange }: Props) {
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
    notes: editing?.notes ?? "",
    enabled: editing?.enabled ?? true,
  }), [editing, initialPetId, initialScope, pets]);
  const [draft, setDraft] = useState<RoutineDraft>(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => onSavingChange?.(saving), [onSavingChange, saving]);
  const suggestions = ["Deworming", "Filter change", "Deep clean", "Nail trim"];
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    const response = await fetch(editing ? `/api/cats/routines/${editing.id}` : "/api/cats/routines", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, petId: draft.scope === "cat" ? draft.petId : null, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }) });
    setSaving(false);
    if (!response.ok) { playNativeHaptic("error"); setError((await response.json()).error ?? "Could not save routine"); return; }
    try { await reconcileNativeNotifications(); } catch { /* The browser push path remains active. */ }
    onSaved(editing ? "Routine updated" : "Routine created");
  }
  return <form className="editor-card routine-editor" onSubmit={submit}>
    <div className="editor-title"><div><span className="eyebrow">ROUTINE</span><h2>{editing ? "Edit routine" : "Add routine"}</h2></div><button type="button" className="text-button" onClick={onCancel}>Cancel</button></div>
    <div className="routine-scope" role="group" aria-label="Routine scope"><button type="button" className={draft.scope === "cat" ? "active" : ""} onClick={() => setDraft({ ...draft, scope: "cat", petId: draft.petId ?? pets[0]?.id ?? null })}>This cat</button><button type="button" className={draft.scope === "household" ? "active" : ""} onClick={() => setDraft({ ...draft, scope: "household", petId: null })}>Household</button></div>
    <div className="routine-suggestions">{suggestions.map(value => <button type="button" key={value} onClick={() => setDraft({ ...draft, title: value })}>{value}</button>)}</div>
    <div className="form-grid">
      {draft.scope === "cat" && <label className="field"><span>Cat</span><select required value={draft.petId ?? ""} onChange={e => setDraft({ ...draft, petId: Number(e.target.value) })}>{pets.map(pet => <option value={pet.id} key={pet.id}>{pet.name}</option>)}</select></label>}
      <label className="field"><span>Routine name</span><input required maxLength={200} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })}/></label>
      <label className="field"><span>Repeat every</span><div className="field-inline"><input type="number" min="1" max="999" required value={draft.intervalValue} onChange={e => setDraft({ ...draft, intervalValue: Number(e.target.value) })}/><select value={draft.intervalUnit} onChange={e => setDraft({ ...draft, intervalUnit: e.target.value as CatRoutine["intervalUnit"] })}><option value="day">days</option><option value="week">weeks</option><option value="month">months</option></select></div></label>
      <label className="field"><span>Repeat from</span><select value={draft.recurrenceMode} onChange={e=>setDraft({...draft,recurrenceMode:e.target.value as CatRoutine["recurrenceMode"]})}><option value="completion">Completion date</option><option value="fixed">Fixed cycle, re-anchor when overdue</option></select></label>
      <label className="field"><span>{editing ? "Next reminder date" : "First reminder date"}</span><input type="date" required value={editing ? draft.nextDueDate : draft.firstDueDate} onInput={e => setDraft(editing ? { ...draft, nextDueDate: e.currentTarget.value, anchorDate: e.currentTarget.value } : { ...draft, firstDueDate: e.currentTarget.value, nextDueDate: e.currentTarget.value, anchorDate: e.currentTarget.value })}/></label>
      <label className="field"><span>Reminder time</span><input type="time" required value={draft.configuredReminderTime} onChange={e=>setDraft({...draft,configuredReminderTime:e.target.value})}/></label>
      <label className="field"><span>Remind</span><select value={draft.reminderLeadMinutes} onChange={e => setDraft({ ...draft, reminderLeadMinutes: Number(e.target.value) })}><option value={0}>At due time</option><option value={60}>1 hour before</option><option value={1440}>1 day before</option><option value={4320}>3 days before</option><option value={10080}>1 week before</option></select></label>
      <label className="field wide"><span>Notes <small>Optional</small></span><textarea rows={3} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })}/></label>
      {editing && <label className="check-row wide"><input type="checkbox" checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })}/><span>Routine enabled</span></label>}
    </div>
    {error && <p className="form-error">{error}</p>}<button className="button primary" disabled={saving}>{saving ? "Saving…" : "Save routine"}</button>
  </form>;
}
