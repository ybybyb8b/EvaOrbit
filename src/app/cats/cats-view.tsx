"use client";
import {useFormPreview,FormPreviewNotice} from "@/components/form-preview";
import { ErrorNotice } from "@/components/error-notice";
import { useServerDataState, useDataRefresh } from "@/components/use-data-refresh";
import { ChoiceSelect } from "@/components/choice-select";
import { ToastNotice, showActionToast } from "@/components/action-toast";

import {CatsLink as Link, useCatsData} from "@/components/cats-data-context";
import { ArrowDown5 } from "reicon-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { FormSheet } from "@/components/form-sheet";
import { PageHeading as PageHeader } from "@/components/page-heading";
import { PageLogAction } from "@/components/bottom-log-core";
import { invalidateCachedJson } from "@/lib/client-json-cache";
import type { CatRoutine, CatTimelineEntry, Pet, Reminder } from "@/lib/types";
import type {CatsDashboard as Dashboard} from "@/lib/cats-readonly";
import { reconcileNativeNotifications } from "@/lib/native-bridge";
import { playNativeHaptic } from "@/lib/native-haptics";
import { useLocale } from "@/components/locale-controller";
import { catAgeLabel, latestCatRecords } from "@/lib/cat-presentation";
import { CatLogPicker, catRecordTitles } from "./cat-log-picker";
import { CatRecordEditor } from "./cat-record-editor";
import { ReminderEditor } from "./reminder-editor";
import { RoutineEditor } from "./routine-editor";


function relative(value: string) { const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000); if (days <= 0) return "today"; if (days === 1) return "1d ago"; return `${days}d ago`; }
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

export function CatsView({ initialDashboard, foodSummary }: { initialDashboard: Dashboard; foodSummary: { items: number; packages: number; lowStock: number } }) { const previewOnly=useFormPreview(); const {read}=useCatsData();
  useDataRefresh("/cats", () => load());
  const { english } = useLocale();
  const [dashboard, setDashboard] = useServerDataState(initialDashboard);
  const [panel, setPanel] = useState<"log" | "record" | "pet" | "care" | "reminder" | "routine" | null>(null);
  const [editingRecord, setEditingRecord] = useState<{ kind: CatTimelineEntry["kind"]; id: number; record: Record<string, unknown> }>();
  const [recordKind, setRecordKind] = useState<CatTimelineEntry["kind"]>("event");
  const [careExpanded, setCareExpanded] = useState(false);
  const [careBusy, setCareBusy] = useState(false);
  const [careError, setCareError] = useState("");
  const [editingRoutine, setEditingRoutine] = useState<CatRoutine>();
  const [editingReminder, setEditingReminder] = useState<Reminder>();
  const [routineScope, setRoutineScope] = useState<CatRoutine["scope"]>("household");
  const [message, setMessage] = useState("");
  const [sheetBusy, setSheetBusy] = useState(false);
  const pets = dashboard.pets.map(item => item.pet);
  const records = latestCatRecords(dashboard.timeline);
  function newRecord(kind: CatTimelineEntry["kind"]) { setEditingRecord(undefined); setRecordKind(kind); setPanel("record"); }
  const careItems = [
    ...dashboard.oneTimeTasks.map(reminder => ({ key: `reminder-${reminder.id}`, due: reminder.nextDueAt!, petId: reminder.targetType === "cat" ? reminder.targetId : null, title: reminder.title, reminder, routine: null })),
    ...(dashboard.routines ?? dashboard.household.map(item => item.routine)).filter(item => item.enabled).map(routine => ({ key: `routine-${routine.id}`, due: routine.nextDueAt, petId: routine.petId, title: routine.title, reminder: null, routine })),
  ].sort((a,b) => a.due.localeCompare(b.due));
  function careCard(item: (typeof careItems)[number], top = false) {
    const content = <><div className="cat-care-copy"><strong>{pets.find(pet => pet.id === item.petId)?.name ?? "Household"} · {item.title}</strong><small>{routineDueLabel(item.due)}</small><small>{item.routine ? `${routineCadence(item.routine)} · ${routineLastDoneLabel(item.routine.lastCompletedAt)}` : "One-time"}</small></div><div className="cat-care-actions"><button disabled={careBusy} onClick={() => { if(item.routine){setEditingRoutine(item.routine);setRoutineScope(item.routine.scope);setPanel("routine");}else if(item.reminder){setEditingReminder(item.reminder);setPanel("reminder");} }}>Edit</button><button className="cat-care-done" disabled={careBusy || previewOnly} onClick={() => void careAction(() => item.routine ? completeRoutine(item.routine.id) : reminderAction(item.reminder!.id,"complete"))}>Done</button>{item.reminder && <button disabled={careBusy || previewOnly} onClick={() => void careAction(() => reminderAction(item.reminder!.id,"cancel"))}>Cancel</button>}</div></>;
    return <article key={item.key} className={`cat-care-card ${top ? "cat-care-top" : ""}`}>{top ? <><div className="cat-care-head"><button className="cat-care-toggle" type="button" aria-expanded={careExpanded} aria-controls="cats-care-more" onClick={() => setCareExpanded(value => !value)}><strong>Care to do</strong><span className="cat-care-count">{careItems.length}</span><ArrowDown5 className="cat-care-toggle-icon" size={13} weight="Outline" aria-hidden="true"/></button></div><div className="cat-care-card-body">{content}</div></> : <div className="cat-care-card-body">{content}</div>}</article>;
  }
  async function careAction(action: () => Promise<void>) { if(previewOnly)return; if (careBusy) return; setCareBusy(true); setCareError(""); try { await action(); } catch { setCareError("Could not update care. Please retry."); } finally { setCareBusy(false); } }
  async function load() { const response = await read("/api/cats"); if (response.ok) setDashboard(await response.json()); }
  function addRoutine(scope: CatRoutine["scope"]) { setEditingRoutine(undefined); setRoutineScope(scope); setPanel("routine"); }
  async function completeRoutine(id: number) { if(previewOnly)return; const response = await fetch(`/api/cats/routines/${id}/complete`, { method: "POST" }); if (response.ok) { playNativeHaptic("success"); setMessage("Routine completed"); await load(); try { await reconcileNativeNotifications(); } catch { /* Web fallback remains active. */ } } else { playNativeHaptic("error"); throw new Error("Could not update care"); } }
  async function reminderAction(id:number,action:"complete"|"cancel"){ if(previewOnly)return;if(action==="cancel"&&!confirm("Cancel this one-time task?"))return;const response=await fetch(`/api/reminders/${id}${action==="complete"?"/complete":""}`,{method:action==="complete"?"POST":"DELETE"});if(response.ok){playNativeHaptic(action==="complete"?"success":"medium");setMessage(action==="complete"?"One-time task completed":"One-time task cancelled");await load();try{await reconcileNativeNotifications();}catch{/* Web fallback remains active. */}}else { playNativeHaptic("error"); throw new Error("Could not update care"); }}
  async function editRecord(item: CatTimelineEntry) { const response = await read(`/api/cats/records/${item.kind}/${item.id}`); if (!response.ok) return; setEditingRecord({ kind: item.kind, id: item.id, record: await response.json() }); setPanel("record"); }
  async function removeRecord(item: CatTimelineEntry) { if(previewOnly)return; if (!confirm(`Delete “${item.title}”?`)) return; const response = await fetch(`/api/cats/records/${item.kind}/${item.id}`, { method: "DELETE" }); if (response.ok) { await load(); showActionToast("Record deleted", "deleted"); } else playNativeHaptic("error"); }
  return <div className="page cats-page">
    <PageHeader eyebrow="" title="Cats"/>
    <div className="cats-overview">
      <section className="cats-pets-section cats-pets-primary">{dashboard.pets.length ? <><div className="cat-card-grid">{dashboard.pets.map(({ pet, latest }) => { const ageLabel = catAgeLabel(pet.birthday, english); return <Link href={`/cats/${pet.id}`} className="cat-card" key={pet.id}><CatAvatar pet={pet}/><div><h2>{pet.name}</h2>{ageLabel && <span className="cat-card-age">{ageLabel}</span>}<p>{latest ? <>Latest · {latest.title} · {relative(latest.occurredAt)}</> : "No recent records"}</p></div></Link>; })}</div></> : <button className="cats-inline-empty" onClick={() => setPanel("pet")}><Icon name="plus"/>Add cat</button>}</section>
      <div className="cats-quick-actions" aria-label="Quick actions"><PageLogAction label="Log cat care" onClick={() => setPanel("log")}><Icon name="plus"/>Log</PageLogAction></div>
    </div>

    {message && <ToastNotice message={message} onShown={() => setMessage("")} />}
    {panel === "log" && <FormSheet title="Log cat care" onClose={() => setPanel(null)}><CatLogPicker canHealth={pets.length>0} onRecord={newRecord} onPlan={() => setPanel("care")}/></FormSheet>}
    {panel === "record" && <FormSheet title={editingRecord ? "Edit record" : catRecordTitles[recordKind]} onClose={() => { setPanel(null); setEditingRecord(undefined); }} submitLabel={editingRecord ? "Save changes" : "Save record"} busy={sheetBusy} submitDisabled={previewOnly}><CatRecordEditor key={editingRecord ? `${editingRecord.kind}-${editingRecord.id}` : recordKind} initialKind={recordKind} pets={pets} editing={editingRecord} initialPetId={editingRecord ? null : undefined} onSavingChange={setSheetBusy} onCancel={() => { setPanel(null); setEditingRecord(undefined); }} onSaved={async () => { await load(); setPanel(null); setEditingRecord(undefined); setMessage(editingRecord ? "Record updated" : "Record saved"); }}/></FormSheet>}
    {panel === "routine" && <FormSheet title={editingRoutine ? "Edit routine" : "Add routine"} onClose={() => { setPanel(null); setEditingRoutine(undefined); }} submitLabel="Save routine" busy={sheetBusy} submitDisabled={previewOnly}><RoutineEditor pets={pets} initialScope={routineScope} editing={editingRoutine} onSavingChange={setSheetBusy} onCancel={() => { setPanel(null); setEditingRoutine(undefined); }} onSaved={value => { setPanel(null); setEditingRoutine(undefined); setMessage(value); void load(); }}/></FormSheet>}
    {panel === "care" && <FormSheet title="Plan care" onClose={() => setPanel(null)}><section className="editor-card care-choice"><div className="editor-title"><div><h2>Plan care</h2></div><button type="button" className="text-button" onClick={() => setPanel(null)}>Cancel</button></div><div className="care-choice-grid"><button type="button" onClick={() => { setEditingReminder(undefined); setPanel("reminder"); }}><strong>One-time</strong><span>Do once on a specific date</span></button><button type="button" onClick={() => addRoutine("household")}><strong>Routine</strong><span>Repeat on a schedule</span></button></div></section></FormSheet>}
    {panel === "reminder" && <FormSheet title={editingReminder ? "Edit one-time task" : "Do once"} onClose={() => { setPanel(null); setEditingReminder(undefined); }} submitLabel={editingReminder ? "Save changes" : "Save one-time task"} busy={sheetBusy} submitDisabled={previewOnly}><ReminderEditor pets={pets} editing={editingReminder} onSavingChange={setSheetBusy} onCancel={() => { setPanel(null); setEditingReminder(undefined); }} onSaved={() => { setPanel(null); setEditingReminder(undefined); setMessage(editingReminder ? "One-time task updated" : "One-time task created"); void load(); }}/></FormSheet>}
    {panel === "pet" && (
      <PetEditor onCancel={() => setPanel(null)} onSaved={() => { setPanel(null); setMessage("Cat added"); void load(); }}/>
    )}
    <section className={`cats-care-section cat-care-disclosure due-stack ${careExpanded ? "expanded" : ""}`}>
      {careError && <ErrorNotice role="alert">{careError}</ErrorNotice>}
      {careItems.length ? <div className={`cat-care-list ${careItems.length > 1 ? "due-stack-shell" : ""}`}>{careCard(careItems[0],true)}<div id="cats-care-more" className="cat-care-more" hidden={!careExpanded}>{careItems.slice(1).map(item => careCard(item))}</div></div> : <><div className="section-heading"><h2>Care to do</h2></div><p className="cat-section-copy">No care scheduled. Plan a one-time task or a repeating routine.</p></>}
    </section>
    <Link href="/cats/food" className="cats-food-library-entry"><span className="cats-food-library-copy"><small>CAT FOOD</small><strong>猫咪食品库</strong><p>{foodSummary.items ? `${foodSummary.items} 款猫咪食品，家里还有 ${foodSummary.packages} 包` : "从第一款买过的猫粮开始记录"}</p>{foodSummary.lowStock > 0 && <em>{foodSummary.lowStock} 款需要留意</em>}</span><span className="cats-food-library-visual"><span className="cats-food-library-icon"><Icon name="catFood"/></span><span className="cats-food-library-arrow"><Icon name="arrow" variant="stroke"/></span></span></Link>
    {records.length > 0 && <details className="cats-history-disclosure"><summary><span>Recent history</span><span className="cats-history-count">{records.length}</span><ArrowDown5 size={15} weight="Outline" aria-hidden="true"/></summary><div className="cat-history-list">{records.slice(0,12).map(item => <article key={`${item.kind}-${item.id}`}><button className="cat-history-row" aria-label={`Edit ${item.title}`} onClick={() => void editRecord(item)}><span><strong>{item.title}</strong><small>{pets.find(pet => pet.id === item.petId)?.name ?? "Household"}</small></span><time>{new Date(item.occurredAt).toLocaleDateString()}</time><Icon name="edit"/></button><button disabled={previewOnly} className="cat-history-delete" aria-label={`Delete ${item.title}`} onClick={() => void removeRecord(item)}><Icon name="trash"/></button></article>)}</div></details>}


  </div>;
}

export function CatAvatar({ pet, size = 54 }: { pet: Pet; size?: number }) { return <span className="cat-avatar" style={{ width: size, height: size, ...(pet.avatarUrl ? { backgroundImage: `url(${JSON.stringify(pet.avatarUrl)})`, backgroundSize: "cover", backgroundPosition: "center" } : {}) }}>{!pet.avatarUrl && <Icon name="cats"/>}</span>; }

function PetEditor({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) { const previewOnly=useFormPreview();
  const [draft, setDraft] = useState({ name: "", sex: "", birthday: "", adoptionDate: "", notes: "" }); const [error, setError] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); if(previewOnly)return; const response = await fetch("/api/cats/pets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, avatarUrl: "", sex: draft.sex || null, isActive: true }) }); if (!response.ok) { playNativeHaptic("error"); setError((await response.json()).error); return; } invalidateCachedJson("/api/cats/pets"); onSaved(); }
  return <form className="editor-card pet-editor" onSubmit={submit}>{previewOnly&&<FormPreviewNotice/>}<div className="editor-title"><div><span className="eyebrow">PROFILE</span><h2>Add cat</h2></div><button type="button" className="text-button" onClick={onCancel}>Cancel</button></div><div className="form-grid"><label className="field"><span>Name</span><input required value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}/></label><label className="field"><span>Sex</span><ChoiceSelect value={draft.sex} onChange={e => setDraft({ ...draft, sex: e.target.value })}><option value="">Not set</option><option value="female">Female</option><option value="male">Male</option><option value="unknown">Unknown</option></ChoiceSelect></label><label className="field"><span>Birthday</span><input type="date" value={draft.birthday} onChange={e => setDraft({ ...draft, birthday: e.target.value })}/></label><label className="field"><span>Adoption date</span><input type="date" value={draft.adoptionDate} onChange={e => setDraft({ ...draft, adoptionDate: e.target.value })}/></label><label className="field wide"><span>Notes</span><textarea rows={3} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })}/></label></div>{error && <ErrorNotice>{error}</ErrorNotice>}<button disabled={previewOnly} className="button primary">Add cat</button></form>;
}
