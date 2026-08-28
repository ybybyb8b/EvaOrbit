"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import type { CatRoutine, CatTimelineEntry, Pet, Reminder } from "@/lib/types";
import { CatRecordEditor } from "./cat-record-editor";
import { ReminderEditor } from "./reminder-editor";
import { RoutineEditor } from "./routine-editor";

type Card = { pet: Pet; latest: CatTimelineEntry | null; nextRoutine: CatRoutine | null };
type Dashboard = { pets: Card[]; household: Array<{ routine: CatRoutine; latest: CatTimelineEntry | null }>; oneTimeTasks: Reminder[]; timeline: CatTimelineEntry[] };

function relative(value: string) { const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000); if (days <= 0) return "Today"; if (days === 1) return "Yesterday"; return `${days} days ago`; }
export type RoutineDueState = "overdue" | "today" | "tomorrow" | "upcoming";

function localDayNumber(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
}

export function routineDueState(value: string): RoutineDueState {
  const dueDay = localDayNumber(value);
  const today = localDayNumber(new Date().toISOString());
  if (dueDay === null || today === null) return "upcoming";
  const difference = dueDay - today;
  if (difference < 0) return "overdue";
  if (difference === 0) return "today";
  if (difference === 1) return "tomorrow";
  return "upcoming";
}

function routineDate(value: string) { return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
export function routineDueLabel(value: string) { const state = routineDueState(value); return state === "overdue" ? `Overdue · ${routineDate(value)}` : state === "today" ? "Due today" : state === "tomorrow" ? "Due tomorrow" : `Due ${routineDate(value)}`; }
export function routineCadence(routine: CatRoutine) { return `Every ${routine.intervalValue} ${routine.intervalUnit}${routine.intervalValue === 1 ? "" : "s"}`; }
export function routineLastDoneLabel(value: string | null | undefined) { return value ? `Last done ${routineDate(value)}` : "Not completed yet"; }

export function CatsView({ initialDashboard }: { initialDashboard: Dashboard }) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [panel, setPanel] = useState<"record" | "pet" | "care" | "reminder" | "routine" | null>(null);
  const [editingRecord, setEditingRecord] = useState<{ kind: CatTimelineEntry["kind"]; id: number; record: Record<string, unknown> }>();
  const [editingRoutine, setEditingRoutine] = useState<CatRoutine>();
  const [editingReminder, setEditingReminder] = useState<Reminder>();
  const [routineScope, setRoutineScope] = useState<CatRoutine["scope"]>("household");
  const [message, setMessage] = useState("");
  const pets = dashboard.pets.map(item => item.pet);
  const householdHistory = dashboard.timeline.filter(item => item.petId === null);
  async function load() { const response = await fetch("/api/cats"); if (response.ok) setDashboard(await response.json()); }
  function addRoutine(scope: CatRoutine["scope"]) { setEditingRoutine(undefined); setRoutineScope(scope); setPanel("routine"); }
  async function completeRoutine(id: number) { const response = await fetch(`/api/cats/routines/${id}/complete`, { method: "POST" }); if (response.ok) { setMessage("Routine completed"); await load(); } }
  async function reminderAction(id:number,action:"complete"|"cancel"){if(action==="cancel"&&!confirm("Cancel this one-time task?"))return;const response=await fetch(`/api/reminders/${id}${action==="complete"?"/complete":""}`,{method:action==="complete"?"POST":"DELETE"});if(response.ok){setMessage(action==="complete"?"One-time task completed":"One-time task cancelled");await load();}}
  async function editRecord(item: CatTimelineEntry) { const response = await fetch(`/api/cats/records/${item.kind}/${item.id}`); if (!response.ok) return; setEditingRecord({ kind: item.kind, id: item.id, record: await response.json() }); setPanel("record"); }
  async function removeRecord(item: CatTimelineEntry) { if (!confirm(`Delete “${item.title}”?`)) return; const response = await fetch(`/api/cats/records/${item.kind}/${item.id}`, { method: "DELETE" }); if (response.ok) void load(); }
  return <div className="page cats-page">
    <PageHeader eyebrow="LIFE" title="Cats" action={<div className="page-actions"><button className="button secondary" onClick={() => setPanel("care")}><Icon name="plus"/>Add care</button><button className="button primary" onClick={() => { setEditingRecord(undefined); setPanel("record"); }}><Icon name="plus"/>New record</button></div>}/>
    {message && <p className="success-banner" role="status">{message}</p>}
    {panel === "record" && (
      <CatRecordEditor pets={pets} editing={editingRecord} initialPetId={editingRecord ? null : undefined} onCancel={() => { setPanel(null); setEditingRecord(undefined); }} onSaved={() => { setPanel(null); setEditingRecord(undefined); setMessage("Record saved"); void load(); }}/>
    )}
    {panel === "routine" && (
      <RoutineEditor pets={pets} initialScope={routineScope} editing={editingRoutine} onCancel={() => { setPanel(null); setEditingRoutine(undefined); }} onSaved={value => { setPanel(null); setEditingRoutine(undefined); setMessage(value); void load(); }}/>
    )}
    {panel === "care" && <section className="editor-card care-choice"><div className="editor-title"><div><span className="eyebrow">ADD CARE</span><h2>What kind of care?</h2></div><button type="button" className="text-button" onClick={() => setPanel(null)}>Cancel</button></div><div className="care-choice-grid"><button type="button" onClick={() => { setEditingReminder(undefined); setPanel("reminder"); }}><strong>One-time</strong><span>Do once on a specific date</span></button><button type="button" onClick={() => addRoutine("household")}><strong>Routine</strong><span>Repeat on a schedule</span></button></div></section>}
    {panel === "reminder" && <ReminderEditor pets={pets} editing={editingReminder} onCancel={() => { setPanel(null); setEditingReminder(undefined); }} onSaved={() => { setPanel(null); setEditingReminder(undefined); setMessage(editingReminder ? "One-time task updated" : "One-time task created"); void load(); }}/>}
    {panel === "pet" && (
      <PetEditor onCancel={() => setPanel(null)} onSaved={() => { setPanel(null); setMessage("Cat added"); void load(); }}/>
    )}
    {dashboard.oneTimeTasks.length > 0 && <section className="cats-upcoming-section"><div className="section-heading"><div><span className="eyebrow">UPCOMING</span><p>One-time care you only need to do once.</p></div><button className="text-button" onClick={() => { setEditingReminder(undefined); setPanel("reminder"); }}><Icon name="plus"/>Add one-time</button></div><div className="cats-one-time-list">{dashboard.oneTimeTasks.map(item=><article key={item.id}><div><strong>{item.title}</strong><small>{item.targetType==="cat"?(pets.find(p=>p.id===item.targetId)?.name??"Cat"):"Household"} · {new Date(item.nextDueAt!).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}{item.dueHasExplicitTime?` · ${new Date(item.nextDueAt!).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"})}`:" · Date only"}</small></div><div className="routine-card-actions"><button className="text-button" onClick={()=>{setEditingReminder(item);setPanel("reminder");}}>Edit</button><button className="text-button danger" onClick={()=>void reminderAction(item.id,"cancel")}>Cancel</button><button className="button primary compact" onClick={()=>void reminderAction(item.id,"complete")}>Done</button></div></article>)}</div></section>}
    <section className="cats-pets-section"><div className="section-heading"><div><span className="eyebrow">MY CATS</span><p>Care, health, and the small things worth remembering.</p></div><button className="text-button" onClick={() => setPanel("pet")}><Icon name="plus"/>Add cat</button></div>{dashboard.pets.length ? <div className="cat-card-grid">{dashboard.pets.map(({ pet, latest, nextRoutine }) => <Link href={`/cats/${pet.id}`} className="cat-card" key={pet.id}><CatAvatar pet={pet}/><div><h2>{pet.name}</h2><p>{latest ? <>Latest: {latest.title} · {relative(latest.occurredAt)}</> : "No records yet"}</p><small>{nextRoutine ? <>Next due: {nextRoutine.title} · {new Date(nextRoutine.nextDueAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</> : "No routine yet"}</small></div></Link>)}</div> : <button className="cats-inline-empty" onClick={() => setPanel("pet")}><Icon name="plus"/>Add cat</button>}</section>
    <section className="cats-household-section"><div className="section-heading"><div><span className="eyebrow">HOUSEHOLD CARE</span><p>Shared routines for your home</p></div><button className="text-button" onClick={() => addRoutine("household")}><Icon name="plus"/>Add routine</button></div>{dashboard.household.length ? <><div className="household-care-list">{dashboard.household.map(({ routine, latest }) => { const state = routineDueState(routine.nextDueAt); const lastDone = latest?.occurredAt ?? routine.lastCompletedAt; return <article key={routine.id} className={`routine-status-card ${state}`}><div className="routine-card-copy"><div className="routine-card-heading"><strong>{routine.title}</strong><span className={`routine-due ${state}`}>{routineDueLabel(routine.nextDueAt)}</span></div><small className="routine-meta">{routineCadence(routine)} · {routineLastDoneLabel(lastDone)}</small></div><div className="routine-card-actions"><button className="text-button" onClick={() => { setEditingRoutine(routine); setRoutineScope(routine.scope); setPanel("routine"); }}>Edit</button><button className="button primary compact" onClick={() => void completeRoutine(routine.id)}>Done</button></div></article>; })}</div>{householdHistory.length > 0 && <details className="household-history"><summary>Recent records</summary>{householdHistory.slice(0, 12).map(item => <article key={`${item.kind}-${item.id}`}><div><strong>{item.title}</strong><small>{item.occurredHasExplicitTime?new Date(item.occurredAt).toLocaleString():new Date(item.occurredAt).toLocaleDateString()}</small></div><div className="cat-record-actions"><button onClick={() => void editRecord(item)}><Icon name="edit"/>Edit</button><button className="danger" onClick={() => void removeRecord(item)}><Icon name="trash"/>Delete</button></div></article>)}</details>}</> : <button className="cats-inline-empty" onClick={() => addRoutine("household")}><Icon name="plus"/>Add the first household routine</button>}</section>
  </div>;
}

export function CatAvatar({ pet, size = 54 }: { pet: Pet; size?: number }) { return <span className="cat-avatar" style={{ width: size, height: size, ...(pet.avatarUrl ? { backgroundImage: `url(${JSON.stringify(pet.avatarUrl)})`, backgroundSize: "cover", backgroundPosition: "center" } : {}) }}>{!pet.avatarUrl && <Icon name="cats"/>}</span>; }

function PetEditor({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const [draft, setDraft] = useState({ name: "", sex: "", birthday: "", adoptionDate: "", notes: "" }); const [error, setError] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); const response = await fetch("/api/cats/pets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, avatarUrl: "", sex: draft.sex || null, isActive: true }) }); if (!response.ok) { setError((await response.json()).error); return; } onSaved(); }
  return <form className="editor-card pet-editor" onSubmit={submit}><div className="editor-title"><div><span className="eyebrow">PROFILE</span><h2>Add cat</h2></div><button type="button" className="text-button" onClick={onCancel}>Cancel</button></div><div className="form-grid"><label className="field"><span>Name</span><input required value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}/></label><label className="field"><span>Sex</span><select value={draft.sex} onChange={e => setDraft({ ...draft, sex: e.target.value })}><option value="">Not set</option><option value="female">Female</option><option value="male">Male</option><option value="unknown">Unknown</option></select></label><label className="field"><span>Birthday</span><input type="date" value={draft.birthday} onChange={e => setDraft({ ...draft, birthday: e.target.value })}/></label><label className="field"><span>Adoption date</span><input type="date" value={draft.adoptionDate} onChange={e => setDraft({ ...draft, adoptionDate: e.target.value })}/></label><label className="field wide"><span>Notes</span><textarea rows={3} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })}/></label></div>{error && <p className="form-error">{error}</p>}<button className="button primary">Add cat</button></form>;
}
