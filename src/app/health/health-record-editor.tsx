"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { compactDateTimePayload, compactDateTimeValue, currentLocalDate, DateTimeField } from "@/components/date-time-field";
import type { HealthRecord, HealthRecordDetails, HealthRecordStatus, HealthRecordType } from "@/lib/types";
import { detailFields, healthRecordStatusLabels, healthRecordTypes, healthRecordUsesStatus } from "./health-record-utils";

type Draft = {
  type: HealthRecordType;
  title: string;
  summary: string;
  occurredAt: string;
  status: HealthRecordStatus;
  startedAt: string;
  endedAt: string;
  details: HealthRecordDetails;
};

function emptyDraft(): Draft {
  return { type: "note", title: "", summary: "", occurredAt: currentLocalDate(), status: defaultStatusForType("note"), startedAt: "", endedAt: "", details: {} };
}

function defaultStatusForType(type: HealthRecordType): HealthRecordStatus {
  return ["symptom", "condition", "medication", "treatment"].includes(type) ? "active" : "resolved";
}

function draftFromRecord(record: HealthRecord): Draft {
  return { type: record.type, title: record.title, summary: record.summary, occurredAt: compactDateTimeValue(record.occurredAt, record.occurredHasExplicitTime), status: record.status, startedAt: compactDateTimeValue(record.startedAt, record.startedHasExplicitTime), endedAt: compactDateTimeValue(record.endedAt, record.endedHasExplicitTime), details: record.details };
}

export function HealthRecordEditor({ editing, onCancel, onSaved, formId, onSavingChange }: { editing?: HealthRecord; onCancel: () => void; onSaved: (record: HealthRecord) => void; formId?: string; onSavingChange?: (saving: boolean) => void }) {
  const [draft, setDraft] = useState<Draft>(() => editing ? draftFromRecord(editing) : emptyDraft());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function setDetail(key: string, value: string, inputType?: "text" | "number") {
    const nextValue = inputType === "number" && value !== "" ? Number(value) : value;
    setDraft((current) => ({ ...current, details: { ...current.details, [key]: Number.isNaN(nextValue) ? "" : nextValue } }));
  }

  function selectType(type: HealthRecordType) {
    setDraft((current) => current.type === type ? current : {
      ...current,
      type,
      status: defaultStatusForType(type),
      details: {},
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setSaving(true); onSavingChange?.(true);
    const details = Object.fromEntries(Object.entries(draft.details).filter(([, value]) => value !== "" && value !== undefined));
    const occurred=compactDateTimePayload(draft.occurredAt);const started=draft.startedAt?compactDateTimePayload(draft.startedAt):null;const ended=draft.endedAt?compactDateTimePayload(draft.endedAt):null;
    const body = {
      type: draft.type, title: draft.title, summary: draft.summary, status: draft.status,
      occurredAt: occurred.value, occurredHasExplicitTime: occurred.hasExplicitTime,
      startedAt: started?.value ?? null, startedHasExplicitTime: started?.hasExplicitTime ?? false,
      endedAt: ended?.value ?? null, endedHasExplicitTime: ended?.hasExplicitTime ?? false,
      details,
    };
    try {
      const response = await fetch(editing ? `/api/health/records/${editing.id}` : "/api/health/records", {
        method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => null) as HealthRecord | { error?: string } | null;
      if (!response.ok) { setError(result && "error" in result ? result.error || "Could not save this record" : "Could not save this record"); return; }
      onSaved(result as HealthRecord);
    } catch { setError("Could not save this record"); }
    finally { setSaving(false); onSavingChange?.(false); }
  }

  const fields = detailFields[draft.type];
  return <form id={formId} className="editor-card health-editor" onSubmit={(event) => void submit(event)}>
    <div className="editor-title"><div><span className="eyebrow">{editing ? "EDIT RECORD" : "NEW RECORD"}</span><h2>{editing ? "Edit health record" : "Add health record"}</h2></div><button type="button" className="text-button" onClick={onCancel}>Cancel</button></div>
    <div className="health-type-picker"><span className="field-caption">Record type</span><div className="health-type-grid">{healthRecordTypes.map((item) => <button type="button" key={item.value} className={draft.type === item.value ? "active" : ""} onClick={() => selectType(item.value)}><span>{item.label}</span></button>)}</div></div>
    <div className="form-grid health-form-grid">
      <label className="field"><span>Title</span><input required maxLength={200} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="What should you remember?" /></label>
      {healthRecordUsesStatus(draft.type) && <label className="field"><span>Status</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as HealthRecordStatus })}>{Object.entries(healthRecordStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>}
      <HealthDateTime label="Occurred" value={draft.occurredAt} onChange={(occurredAt)=>setDraft({...draft,occurredAt})}/>
      <HealthDateTime label="Started" value={draft.startedAt} onChange={(startedAt)=>setDraft({...draft,startedAt})} optional/>
      <HealthDateTime label="Ended" value={draft.endedAt} onChange={(endedAt)=>setDraft({...draft,endedAt})} optional/>
      <label className="field wide"><span>Summary <small>(optional)</small></span><textarea rows={3} maxLength={5000} value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} placeholder="A short note for later…" /></label>
    </div>
    <section className="health-details-editor"><div className="health-editor-section-heading"><div><span className="eyebrow">DETAILS</span><p>Small type-specific context. Keep it lightweight.</p></div></div><div className="form-grid health-form-grid">{fields.map((field) => <label className="field" key={field.key}><span>{field.label} <small>(optional)</small></span><input type={field.inputType ?? "text"} value={draft.details[field.key] === null || draft.details[field.key] === undefined ? "" : String(draft.details[field.key])} onChange={(event) => setDetail(field.key, event.target.value, field.inputType)} placeholder={field.placeholder} /></label>)}</div></section>
    {error && <p className="form-error">{error}</p>}
    <div className="health-editor-actions"><button type="button" className="button secondary" onClick={onCancel}>Cancel</button><button className="button primary" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Add record"}</button></div>
  </form>;
}

function HealthDateTime({label,value,onChange,optional=false}:{label:string;value:string;onChange:(value:string)=>void;optional?:boolean}){const date=value.slice(0,10),time=value.length>10?value.slice(11,16):"";return <DateTimeField label={label} value={{date,time}} optionalDate={optional} onChange={next=>onChange(next.date+(next.time?`T${next.time}`:""))}/>;}
