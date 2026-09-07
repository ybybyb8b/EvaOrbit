"use client";

import { type FormEvent, useState } from "react";
import { FormSheet } from "@/components/form-sheet";
import { reconcileNativeNotifications } from "@/lib/native-bridge";
import { playNativeHaptic } from "@/lib/native-haptics";
import type { ApiError, TrackerField } from "@/lib/types";

function localDateTime(initialDate?: string) { const date = new Date(); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return `${initialDate ?? date.toISOString().slice(0, 10)}T${date.toISOString().slice(11, 16)}`; }

export function TrackerEntryEditor({ trackerId, fields, initialDate, onClose, onSaved }: { trackerId: number; fields: TrackerField[]; initialDate?: string; onClose: () => void; onSaved: () => Promise<void> | void }) {
  const [occurredAt, setOccurredAt] = useState(() => localDateTime(initialDate));
  const [note, setNote] = useState("");
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const activeFields = fields.filter((field) => !field.archivedAt);
  async function submit(event: FormEvent) { event.preventDefault(); if (working) return; setWorking(true); setError(""); try { const response = await fetch(`/api/trackers/${trackerId}/entries`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ occurredAt: new Date(occurredAt).toISOString(), values, note }) }); if (!response.ok) { setError(((await response.json()) as ApiError).error); return; } try { await reconcileNativeNotifications(); } catch { /* Web Push remains the fallback. */ } playNativeHaptic("light"); await onSaved(); onClose(); } finally { setWorking(false); } }
  function setFieldValue(field: TrackerField, value: unknown) { setValues((current) => ({ ...current, [field.key]: value })); }
  return <FormSheet title="Add details" onClose={onClose} formId="tracker-entry-form" submitLabel="Save record" busy={working}><form id="tracker-entry-form" className="editor-card tracker-entry-form" onSubmit={submit}>
    <label className="field"><span>When</span><input required type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} /></label>
    {activeFields.length > 0 && <div className="tracker-values-grid">{activeFields.map((field) => <TrackerFieldInput field={field} value={values[field.key]} onChange={(value) => setFieldValue(field, value)} key={field.id} />)}</div>}
    <label className="field"><span>Note</span><textarea rows={3} maxLength={5000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional" /></label>
    {error && <p className="form-error">{error}</p>}
  </form></FormSheet>;
}

export function TrackerFieldInput({ field, value, onChange }: { field: TrackerField; value: unknown; onChange: (value: unknown) => void }) {
  if (field.type === "boolean") return <label className="tracker-check field-check"><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />{field.name}</label>;
  if (field.type === "single_select") return <label className="field"><span>{field.name}</span><select required={field.required} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)}><option value="">Not selected</option>{field.options.map((option) => <option key={option}>{option}</option>)}</select></label>;
  if (field.type === "multi_select") return <fieldset className="tracker-multi-field"><legend>{field.name}</legend>{field.options.map((option) => <label key={option}><input type="checkbox" checked={Array.isArray(value) && value.includes(option)} onChange={(event) => { const current = Array.isArray(value) ? value as string[] : []; onChange(event.target.checked ? [...current, option] : current.filter((item) => item !== option)); }} />{option}</label>)}</fieldset>;
  if (field.type === "rating") return <label className="field"><span>{field.name}</span><select required={field.required} value={typeof value === "number" ? value : ""} onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}><option value="">Not rated</option>{[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{"★".repeat(score)}</option>)}</select></label>;
  return <label className="field"><span>{field.name}{field.unit && ` (${field.unit})`}</span><input required={field.required} type={field.type === "number" ? "number" : "text"} step={field.type === "number" ? 10 ** -field.precision : undefined} value={typeof value === "string" || typeof value === "number" ? String(value) : ""} onChange={(event) => onChange(field.type === "number" ? (event.target.value ? Number(event.target.value) : null) : event.target.value)} /></label>;
}
