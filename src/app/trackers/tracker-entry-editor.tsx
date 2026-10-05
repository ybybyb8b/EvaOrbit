"use client";
import { SearchableMultiSelect } from "@/components/searchable-multi-select";
import { SearchableSelect } from "@/components/searchable-select";
import { normalizeTrackerTimeRange, trackerDurationMinutes } from "@/lib/tracker-time-range";

import { type FormEvent, useState } from "react";
import { FormSheet } from "@/components/form-sheet";
import { useLocale } from "@/components/locale-controller";
import { reconcileNativeNotifications } from "@/lib/native-bridge";
import { playNativeHaptic } from "@/lib/native-haptics";
import { translateUiCopy } from "@/lib/ui-copy";
import type { ApiError, TrackerField } from "@/lib/types";

function localDateTime(initialDate?: string) { const date = new Date(); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return `${initialDate ?? date.toISOString().slice(0, 10)}T${date.toISOString().slice(11, 16)}`; }

export function TrackerEntryEditor({ trackerId, fields, initialDate, onClose, onSaved }: { trackerId: number; fields: TrackerField[]; initialDate?: string; onClose: () => void; onSaved: () => Promise<void> | void }) {
  const { english } = useLocale();
  const [occurredAt, setOccurredAt] = useState(() => localDateTime(initialDate));
  const [note, setNote] = useState("");
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const activeFields = fields.filter((field) => !field.archivedAt);
  async function submit(event: FormEvent) { event.preventDefault(); if (working) return; setWorking(true); setError(""); try { const response = await fetch(`/api/trackers/${trackerId}/entries`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ occurredAt: new Date(occurredAt).toISOString(), values, note }) }); if (!response.ok) { setError(((await response.json()) as ApiError).error); return; } try { await reconcileNativeNotifications(); } catch { /* Web Push remains the fallback. */ } playNativeHaptic("light"); await onSaved(); onClose(); } finally { setWorking(false); } }
  function setFieldValue(field: TrackerField, value: unknown) { setValues((current) => ({ ...current, [field.key]: value })); }
  return <FormSheet title={english?"Add details":"添加详情"} onClose={onClose} formId="tracker-entry-form" submitLabel={english?"Save record":"保存记录"} busy={working}><form id="tracker-entry-form" className="editor-card tracker-entry-form" onSubmit={submit}>
    <label className="field"><span>{english?"When":"时间"}</span><input required type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} /></label>
    {activeFields.length > 0 && <div className="tracker-values-grid">{activeFields.map((field) => <TrackerFieldInput field={field} value={values[field.key]} onChange={(value) => setFieldValue(field, value)} key={field.id} />)}</div>}
    <label className="field"><span>{english?"Note":"备注"}</span><textarea rows={3} maxLength={5000} value={note} onChange={(event) => setNote(event.target.value)} placeholder={english?"Optional":"选填"} /></label>
    {error && <p className="form-error">{error}</p>}
  </form></FormSheet>;
}

export function TrackerFieldInput({ field, value, onChange }: { field: TrackerField; value: unknown; onChange: (value: unknown) => void }) {
  const { english, language } = useLocale();
  const copy = (text: string) => translateUiCopy(text, language);
  const fieldName = copy(field.name);
  if (field.type === "time_range") return <TrackerTimeRangeInput field={field} value={value} onChange={onChange} />;
  if (field.type === "boolean") return <label className="tracker-check field-check"><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} /><span className="user-content">{fieldName}</span></label>;
  if (field.type === "single_select" && field.options.length <= 10) return <label className="field"><span className="user-content">{fieldName}</span><select required={field.required} value={typeof value === "string" ? value : ""} onChange={event=>onChange(event.target.value)}><option value="">{english?"Not selected":"未选择"}</option>{field.options.map(option=><option className="user-content" key={option} value={option}>{copy(option)}</option>)}</select></label>;
  if (field.type === "single_select") return <div className="field"><span className="user-content">{fieldName}</span><SearchableSelect required={field.required} label={fieldName} value={typeof value === "string" ? value : ""} options={[{value:"",label:english?"Not selected":"未选择"},...field.options.map(option=>({value:option,label:copy(option)}))]} onValueChange={onChange} /></div>;
  if (field.type === "multi_select") return <fieldset className="tracker-multi-field"><legend className="user-content">{fieldName}</legend><SearchableMultiSelect label={fieldName} required={field.required} options={field.options.map(option=>({value:option,label:copy(option)}))} value={Array.isArray(value)?value as string[]:[]} onValueChange={onChange}/></fieldset>;
  if (field.type === "rating") return <label className="field"><span className="user-content">{fieldName}</span><select required={field.required} value={typeof value === "number" ? value : ""} onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}><option value="">{english?"Not rated":"未评分"}</option>{[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{"★".repeat(score)}</option>)}</select></label>;
  return <label className="field"><span className="user-content">{fieldName}{field.unit && ` (${field.unit})`}</span><input required={field.required} type={field.type === "number" ? "number" : "text"} step={field.type === "number" ? 10 ** -field.precision : undefined} value={typeof value === "string" || typeof value === "number" ? String(value) : ""} onChange={(event) => onChange(field.type === "number" ? (event.target.value ? Number(event.target.value) : null) : event.target.value)} /></label>;
}

function TrackerTimeRangeInput({ field, value, onChange }: { field: TrackerField; value: unknown; onChange: (value: unknown) => void }) {
  const { english } = useLocale();
  const range = value && typeof value === "object" ? value as Record<string, unknown> : {};
  function localValue(value: unknown) {
    if (typeof value !== "string" || !value) return "";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  }
  function change(key: "startAt" | "endAt", next: string) {
    const nextRange = { ...range, [key]: next ? new Date(next).toISOString() : "" };
    if (!nextRange.startAt && !nextRange.endAt) { onChange(null); return; }
    try { onChange(normalizeTrackerTimeRange(nextRange)); } catch { onChange({ startAt: nextRange.startAt ?? "", endAt: nextRange.endAt ?? "" }); }
  }
  const duration = trackerDurationMinutes(value);
  const invalidOrder = Boolean(range.startAt && range.endAt && duration === null);
  return <fieldset className="tracker-time-range"><legend className="user-content">{field.name}</legend><div className="form-grid">
    <label className="field"><span>{english ? "Start" : "开始时间"}</span><input type="datetime-local" step="60" required={field.required || Boolean(range.endAt)} value={localValue(range.startAt)} onChange={event => change("startAt", event.target.value)} /></label>
    <label className="field"><span>{english ? "End" : "结束时间"}</span><input type="datetime-local" step="60" required={field.required || Boolean(range.startAt)} value={localValue(range.endAt)} ref={element => { element?.setCustomValidity(invalidOrder ? (english ? "End must be later than start" : "结束时间必须晚于开始时间") : ""); }} onChange={event => change("endAt", event.target.value)} /></label>
  </div><output>{invalidOrder ? (english ? "End must be later than start" : "结束时间必须晚于开始时间") : duration === null ? (english ? "Enter both times to calculate duration" : "填写起止时间后自动计算时长") : `${english ? "Duration" : "时长"} · ${Number(duration.toFixed(2))} ${english ? "min" : "分钟"}`}</output></fieldset>;
}
