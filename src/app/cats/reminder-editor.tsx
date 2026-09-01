"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { currentLocalDate, dateTimeDraft, dateTimePayload, DateTimeField, type DateTimeDraft } from "@/components/date-time-field";
import type { Pet, Reminder } from "@/lib/types";
import { reconcileNativeNotifications } from "@/lib/native-bridge";

function tomorrow(): DateTimeDraft {
  const date = new Date(`${currentLocalDate()}T12:00:00`);
  date.setDate(date.getDate() + 1);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  return { date: local, time: "" };
}

export function ReminderEditor({ pets, initialPetId, editing, onSaved, onCancel, onSavingChange }: { pets: Pet[]; initialPetId?: number | null; editing?: Reminder; onSaved: () => void; onCancel: () => void; onSavingChange?: (saving: boolean) => void }) {
  const [draft, setDraft] = useState(() => ({ target: editing ? editing.targetType === "cat" ? String(editing.targetId) : "household" : initialPetId === null ? "household" : initialPetId ? String(initialPetId) : pets[0] ? String(pets[0].id) : "household", title: editing?.title ?? "", due: editing?.nextDueAt ? dateTimeDraft(editing.nextDueAt, editing.dueHasExplicitTime) : tomorrow(), leadTimeMinutes: editing?.leadTimeMinutes ?? 0, note: editing?.note ?? "" }));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => onSavingChange?.(saving), [onSavingChange, saving]);

  async function submit(event: FormEvent) {
    event.preventDefault(); if (saving) return; setError(""); setSaving(true);
    const household = draft.target === "household";
    const due = dateTimePayload(draft.due);
    const response = await fetch(editing ? `/api/reminders/${editing.id}` : "/api/reminders", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      title: draft.title, targetType: household ? "cat_household" : "cat", targetId: household ? null : Number(draft.target), sourceType: null, sourceId: null,
      scheduleType: "one_time", startsAt: due.value, nextDueAt: due.value, dueHasExplicitTime: due.hasExplicitTime,
      intervalValue: null, intervalUnit: null, timesOfDay: [], endsAt: null, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      note: draft.note, leadTimeMinutes: due.hasExplicitTime ? draft.leadTimeMinutes : 0, status: "scheduled", isActive: true, cancelledAt: null, lastNotifiedAt: null, sentAt: null,
    }) });
    setSaving(false);
    if (!response.ok) { setError((await response.json()).error ?? "Could not save one-time task."); return; }
    try { await reconcileNativeNotifications(); } catch { /* The browser push path remains active. */ }
    onSaved();
  }

  return <form className="editor-card reminder-editor" onSubmit={submit}>
    <div className="editor-title"><div><span className="eyebrow">ONE-TIME</span><h2>{editing ? "Edit one-time task" : "Do once"}</h2></div><button type="button" className="text-button" onClick={onCancel}>Cancel</button></div>
    <div className="form-grid">
      <label className="field"><span>Subject</span><select value={draft.target} onChange={(event) => setDraft({ ...draft, target: event.target.value })}>{pets.map((pet) => <option value={pet.id} key={pet.id}>{pet.name}</option>)}<option value="household">Household</option></select></label>
      <label className="field"><span>Title</span><input required maxLength={200} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })}/></label>
      <DateTimeField label="Due date" value={draft.due} onChange={(due) => setDraft({ ...draft, due })}/>
      {draft.due.time ? <label className="field"><span>Remind</span><select value={draft.leadTimeMinutes} onChange={(event) => setDraft({ ...draft, leadTimeMinutes: Number(event.target.value) })}><option value={0}>At due time</option><option value={60}>1 hour before</option><option value={1440}>1 day before</option><option value={4320}>3 days before</option><option value={10080}>1 week before</option></select></label> : <p className="date-only-note">Date-only tasks stay in Upcoming but do not send a push notification until a time is added.</p>}
      <label className="field wide"><span>Note <small>Optional</small></span><textarea rows={3} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })}/></label>
    </div>
    {error && <p className="form-error">{error}</p>}<button className="button primary" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Save one-time task"}</button>
  </form>;
}
