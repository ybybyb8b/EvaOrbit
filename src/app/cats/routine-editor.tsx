"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import type { CatRoutine, Pet } from "@/lib/types";

type Props = {
  pets: Pet[];
  initialPetId?: number | null;
  initialScope?: CatRoutine["scope"];
  editing?: CatRoutine;
  onCancel: () => void;
  onSaved: (message: string) => void;
};
type RoutineDraft = { scope: CatRoutine["scope"]; petId: number | null; title: string; intervalValue: number; intervalUnit: CatRoutine["intervalUnit"]; firstDueAt: string; nextDueAt: string; reminderLeadMinutes: number; notes: string; enabled: boolean };

function localInput(value?: string) {
  const date = value ? new Date(value) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export function RoutineEditor({ pets, initialPetId, initialScope, editing, onCancel, onSaved }: Props) {
  const initial = useMemo<RoutineDraft>(() => ({
    scope: editing?.scope ?? initialScope ?? (initialPetId ? "cat" : "household") as CatRoutine["scope"],
    petId: editing?.petId ?? initialPetId ?? pets[0]?.id ?? null,
    title: editing?.title ?? "",
    intervalValue: editing?.intervalValue ?? 30,
    intervalUnit: editing?.intervalUnit ?? "day" as CatRoutine["intervalUnit"],
    firstDueAt: localInput(editing?.firstDueAt),
    nextDueAt: localInput(editing?.nextDueAt),
    reminderLeadMinutes: editing?.reminderLeadMinutes ?? 1440,
    notes: editing?.notes ?? "",
    enabled: editing?.enabled ?? true,
  }), [editing, initialPetId, initialScope, pets]);
  const [draft, setDraft] = useState<RoutineDraft>(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const suggestions = ["Deworming", "Filter change", "Deep clean", "Nail trim"];
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    const response = await fetch(editing ? `/api/cats/routines/${editing.id}` : "/api/cats/routines", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, petId: draft.scope === "cat" ? draft.petId : null, firstDueAt: new Date(draft.firstDueAt).toISOString(), nextDueAt: new Date(draft.nextDueAt).toISOString() }) });
    setSaving(false);
    if (!response.ok) { setError((await response.json()).error ?? "Could not save routine"); return; }
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
      <label className="field"><span>{editing ? "Next due" : "First due"}</span><input type="datetime-local" required value={editing ? draft.nextDueAt : draft.firstDueAt} onInput={e => setDraft(editing ? { ...draft, nextDueAt: e.currentTarget.value } : { ...draft, firstDueAt: e.currentTarget.value, nextDueAt: e.currentTarget.value })}/></label>
      <label className="field"><span>Remind</span><select value={draft.reminderLeadMinutes} onChange={e => setDraft({ ...draft, reminderLeadMinutes: Number(e.target.value) })}><option value={0}>At due time</option><option value={60}>1 hour before</option><option value={1440}>1 day before</option><option value={4320}>3 days before</option><option value={10080}>1 week before</option></select></label>
      <label className="field wide"><span>Notes <small>Optional</small></span><textarea rows={3} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })}/></label>
      {editing && <label className="check-row wide"><input type="checkbox" checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })}/><span>Routine enabled</span></label>}
    </div>
    {error && <p className="form-error">{error}</p>}<button className="button primary" disabled={saving}>{saving ? "Saving…" : "Save routine"}</button>
  </form>;
}
