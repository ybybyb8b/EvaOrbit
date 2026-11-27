"use client";
import {NoteTextarea} from "@/components/note-textarea";
import { Disclosure } from "@/components/disclosure";
import {useBusinessRequest} from "@/components/business-request-context";
import {useFormPreview,FormPreviewNotice} from "@/components/form-preview";
import { ErrorNotice } from "@/components/error-notice";
import { useServerDataState, useDataRefresh } from "@/components/use-data-refresh";
import { ChoiceSelect } from "@/components/choice-select";
import { ToastNotice, showActionToast } from "@/components/action-toast";

import {CatsLink as Link, useCatsData} from "@/components/cats-data-context";
import type { FormEvent } from "react";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { FormSheet } from "@/components/form-sheet";
import { PageHeading as PageHeader } from "@/components/page-heading";
import { BottomLogScope } from "@/components/bottom-log-core";
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

function routineDate(value: string, english = true) {
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return date.toLocaleDateString(english ? "en-US" : "zh-CN", { month: "short", day: "numeric" });
}
export function routineDueLabel(value: string, english = true) {
  const state = routineDueState(value);
  if (state === "today") return english ? "Due today" : "今天到期";
  if (state === "tomorrow") return english ? "Due tomorrow" : "明天到期";
  const date = routineDate(value, english);
  if (state === "overdue") return english ? `Overdue · ${date}` : `已逾期 · ${date}`;
  return english ? `Due ${date}` : `${date}到期`;
}
const routineUnits = { day: "天", week: "周", month: "个月" };
export function routineCadence({ intervalValue, intervalUnit }: CatRoutine, english = true) {
  return english ? `Every ${intervalValue} ${intervalUnit}${intervalValue === 1 ? "" : "s"}` : `每 ${intervalValue} ${routineUnits[intervalUnit]}`;
}
export function routineLastDoneLabel(value: string | null | undefined, english = true) {
  if (!value) return english ? "Not completed yet" : "尚未完成过";
  const date = routineDate(value, english);
  return english ? `Last done ${date}` : `上次完成于${date}`;
}

export function CatsView({ initialDashboard, foodSummary }: { initialDashboard: Dashboard; foodSummary: { items: number; packages: number; lowStock: number } }) {
  const businessFetch=useBusinessRequest(); const previewOnly=useFormPreview(); const {read}=useCatsData();
  useDataRefresh("/cats", () => load());
  const { english } = useLocale();
  const [dashboard, setDashboard] = useServerDataState(initialDashboard);
  const [panel, setPanel] = useState<"log" | "record" | "pet" | "care" | "reminder" | "routine" | null>(null);
  const [editingRecord, setEditingRecord] = useState<{ kind: CatTimelineEntry["kind"]; id: number; record: Record<string, unknown> }>();
  const [recordKind, setRecordKind] = useState<CatTimelineEntry["kind"]>("event");
  const [careExpanded, setCareExpanded] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
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
  const careTitle = english ? "Care to do" : "护理待办";
  const expandLabel = english ? "Expand" : "展开";
  const collapseLabel = english ? "Collapse" : "收起";
  function careCard(item: (typeof careItems)[number]) {
    const subject = pets.find(pet => pet.id === item.petId)?.name ?? (english ? "Household" : "全家共用");
    return <article key={item.key} className="cat-care-card">
      <div className="cat-care-card-body">
        <div className="cat-care-copy">
          <strong>{item.title}</strong>
          <small>{subject} · {routineDueLabel(item.due, english)}</small>
          <small>{item.routine
            ? `${routineCadence(item.routine, english)} · ${routineLastDoneLabel(item.routine.lastCompletedOn ?? item.routine.lastCompletedAt, english)}`
            : english ? "One-time" : "单次待办"}</small>
        </div>
        <div className="cat-care-actions">
          <button type="button" disabled={careBusy} onClick={() => {
            if (item.routine) {
              setEditingRoutine(item.routine);
              setRoutineScope(item.routine.scope);
              setPanel("routine");
            } else if (item.reminder) {
              setEditingReminder(item.reminder);
              setPanel("reminder");
            }
          }}>Edit</button>
          {item.routine?.undoableEventId && <button type="button" disabled={careBusy || previewOnly}
            onClick={() => void careAction(() => completeRoutine(item.routine!, true))}>Undo completion</button>}
          {item.reminder && <button type="button" disabled={careBusy || previewOnly}
            onClick={() => void careAction(() => reminderAction(item.reminder!.id, "cancel"))}>Cancel</button>}
          <button type="button" className="cat-care-done" disabled={careBusy || previewOnly}
            onClick={() => void careAction(() => item.routine ? completeRoutine(item.routine) : reminderAction(item.reminder!.id, "complete"))}>Done</button>
        </div>
      </div>
    </article>;
  }
  async function careAction(action: () => Promise<void>) { if(previewOnly)return; if (careBusy) return; setCareBusy(true); setCareError(""); try { await action(); } catch { setCareError("Could not update care. Please retry."); } finally { setCareBusy(false); } }
  async function load() { const response = await read("/api/cats"); if (response.ok) setDashboard(await response.json()); }
  function addRoutine(scope: CatRoutine["scope"]) { setEditingRoutine(undefined); setRoutineScope(scope); setPanel("routine"); }
  async function completeRoutine(routine: CatRoutine,undo=false) { if(previewOnly)return; const response = await businessFetch(`/api/cats/routines/${routine.id}${undo?"":"/complete"}`, { method: undo?"PATCH":"POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(undo?{undoEventId:routine.undoableEventId}:{expectedNextDueAt:routine.nextDueAt,expectedLastCompletedAt:routine.lastCompletedAt}) }); if (response.ok) { playNativeHaptic("success"); setMessage(undo?"Completion undone":"Routine completed"); await load(); try { await reconcileNativeNotifications(); } catch { /* Web fallback remains active. */ } } else { playNativeHaptic("error"); throw new Error("Could not update care"); } }
  async function reminderAction(id:number,action:"complete"|"cancel"){ if(previewOnly)return;if(action==="cancel"&&!confirm("Cancel this one-time task?"))return;const response=await businessFetch(`/api/reminders/${id}${action==="complete"?"/complete":""}`,{method:action==="complete"?"POST":"DELETE"});if(response.ok){playNativeHaptic(action==="complete"?"success":"medium");setMessage(action==="complete"?"One-time task completed":"One-time task cancelled");await load();try{await reconcileNativeNotifications();}catch{/* Web fallback remains active. */}}else { playNativeHaptic("error"); throw new Error("Could not update care"); }}
  async function editRecord(item: CatTimelineEntry) { const response = await read(`/api/cats/records/${item.kind}/${item.id}`); if (!response.ok) return; setEditingRecord({ kind: item.kind, id: item.id, record: await response.json() }); setPanel("record"); }
  async function removeRecord(item: CatTimelineEntry) { if(previewOnly)return; if (!confirm(`Delete “${item.title}”?`)) return; const response = await businessFetch(`/api/cats/records/${item.kind}/${item.id}`, { method: "DELETE" }); if (response.ok) { await load(); showActionToast("Record deleted", "deleted"); } else playNativeHaptic("error"); }
  return <div className="page cats-page">
    <PageHeader eyebrow="" title="Cats"/>
    <BottomLogScope label={english ? "Log cat care" : "记录猫咪护理"} onClick={() => setPanel("log")}/>
    <div className="cats-overview">
      <section className="cats-pets-section cats-pets-primary">
        {dashboard.pets.length ? <div className="cat-card-grid">{dashboard.pets.map(({ pet, nextRoutine }) => {
          const ageLabel = catAgeLabel(pet.birthday, english);
          return <Link href={`/cats/${pet.id}`} className="cat-card" key={pet.id}>
            <CatAvatar pet={pet} size={68}/>
            <div className="cat-card-identity">
              <h2>{pet.name}</h2>
              {ageLabel && <span className="cat-card-age">{ageLabel}</span>}
            </div>
            <div className="cat-card-routine">
              {nextRoutine ? <>
                <strong>{nextRoutine.title}</strong>
                <small>{routineDueLabel(nextRoutine.nextDueAt, english)}</small>
              </> : <small>{english ? "No routine scheduled" : "暂无例行待办"}</small>}
            </div>
          </Link>;
        })}</div> : <button className="cats-inline-empty" onClick={() => setPanel("pet")}><Icon name="plus"/>Add cat</button>}
      </section>
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
      {careItems.length ? <div className={careItems.length > 1 ? "due-stack-shell" : undefined}
        data-layers={careItems.length === 2 ? 1 : undefined}>
        <div className="cat-care-list">
          <div className="cat-care-head">
            {careItems.length > 1 ? <button className="cat-care-toggle" type="button" aria-expanded={careExpanded}
              aria-controls="cats-care-more" onClick={() => setCareExpanded(value => !value)}>
              <strong>{careTitle}</strong>
              <span className="cats-disclosure-meta">
                <span>{careItems.length}</span>
                <span className="cats-disclosure-action">{careExpanded ? collapseLabel : expandLabel}</span>
              </span>
            </button> : <h2>{careTitle}</h2>}
          </div>
          {careCard(careItems[0])}
          {careItems.length > 1 && <div id="cats-care-more" className="cat-care-more" hidden={!careExpanded}>
            {careItems.slice(1).map(careCard)}
          </div>}
        </div>
      </div> : <>
        <div className="section-heading"><h2>{careTitle}</h2></div>
        <p className="cat-section-copy">No care scheduled. Plan a one-time task or a repeating routine.</p>
      </>}
    </section>
    <Link href="/cats/food" className="cats-food-library-entry"><span className="cats-food-library-copy"><small>CAT FOOD</small><strong>猫咪食品库</strong><p>{foodSummary.items ? `${foodSummary.items} 款猫咪食品，家里还有 ${foodSummary.packages} 包` : "从第一款买过的猫粮开始记录"}</p>{foodSummary.lowStock > 0 && <em>{foodSummary.lowStock} 款需要留意</em>}</span><span className="cats-food-library-visual"><span className="cats-food-library-icon"><Icon name="catFood"/></span></span></Link>
    {records.length > 0 && <Disclosure className="cats-history-disclosure"
        title={english ? "Recent history" : "近期记录"} open={historyExpanded} onOpenChange={setHistoryExpanded}
        trailing={<span className="cats-disclosure-meta">
          <span>{records.length}</span>
          <span className="cats-disclosure-action">{historyExpanded ? collapseLabel : expandLabel}</span>
        </span>}>
        <div className="cat-history-list">{records.slice(0, 12).map(item => <article key={`${item.kind}-${item.id}`}>
          <button className="cat-history-row" aria-label={`Edit ${item.title}`} onClick={() => void editRecord(item)}>
            <span><strong>{item.title}</strong><small>{pets.find(pet => pet.id === item.petId)?.name ?? "Household"}</small></span>
            <time>{new Date(item.occurredAt).toLocaleDateString()}</time><Icon name="edit"/>
          </button>
          <button disabled={previewOnly} className="cat-history-delete" aria-label={`Delete ${item.title}`}
            onClick={() => void removeRecord(item)}><Icon name="trash"/></button>
        </article>)}</div>
    </Disclosure>}
  </div>;
}

export function CatAvatar({ pet, size = 54 }: { pet: Pet; size?: number }) { return <span className="cat-avatar" style={{ width: size, height: size, ...(pet.avatarUrl ? { backgroundImage: `url(${JSON.stringify(pet.avatarUrl)})`, backgroundSize: "cover", backgroundPosition: "center" } : {}) }}>{!pet.avatarUrl && <Icon name="cats"/>}</span>; }

function PetEditor({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const businessFetch=useBusinessRequest(); const previewOnly=useFormPreview();
  const [draft, setDraft] = useState({ name: "", sex: "", birthday: "", adoptionDate: "", notes: "" }); const [error, setError] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); if(previewOnly)return; const response = await businessFetch("/api/cats/pets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, avatarUrl: "", sex: draft.sex || null, isActive: true }) }); if (!response.ok) { playNativeHaptic("error"); setError((await response.json()).error); return; } invalidateCachedJson("/api/cats/pets"); onSaved(); }
  return <form className="editor-card pet-editor" onSubmit={submit}>{previewOnly&&<FormPreviewNotice/>}<div className="editor-title"><div><span className="eyebrow">PROFILE</span><h2>Add cat</h2></div><button type="button" className="text-button" onClick={onCancel}>Cancel</button></div><div className="form-grid"><label className="field"><span>Name</span><input required value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}/></label><label className="field"><span>Sex</span><ChoiceSelect value={draft.sex} onChange={e => setDraft({ ...draft, sex: e.target.value })}><option value="">Not set</option><option value="female">Female</option><option value="male">Male</option><option value="unknown">Unknown</option></ChoiceSelect></label><label className="field"><span>Birthday</span><input type="date" value={draft.birthday} onChange={e => setDraft({ ...draft, birthday: e.target.value })}/></label><label className="field"><span>Adoption date</span><input type="date" value={draft.adoptionDate} onChange={e => setDraft({ ...draft, adoptionDate: e.target.value })}/></label><label className="field wide"><span>Notes</span><NoteTextarea value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })}/></label></div>{error && <ErrorNotice>{error}</ErrorNotice>}<button disabled={previewOnly} className="button primary">Add cat</button></form>;
}
