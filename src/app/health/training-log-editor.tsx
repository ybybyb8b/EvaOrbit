"use client";

import { useState } from "react";
import { FormSheet } from "@/components/form-sheet";
import { useLocale } from "@/components/locale-controller";
import { compactDateTimePayload, compactDateTimeValue, currentLocalDate, DateTimeField } from "@/components/date-time-field";
import { TRAINING_BODY_PARTS, type TrainingBodyPart, type TrainingInputSuggestions, type TrainingLog, type TrainingType } from "@/lib/types";

export const trainingTypeLabels: Record<TrainingType, { zh: string; en: string }> = { cardio: { zh: "有氧", en: "Cardio" }, strength: { zh: "无氧", en: "Strength" }, mixed: { zh: "混合", en: "Mixed" } };
export const trainingBodyPartLabels: Record<TrainingBodyPart, { zh: string; en: string }> = { "胸": { zh: "胸", en: "Chest" }, "背": { zh: "背", en: "Back" }, "腿": { zh: "腿", en: "Legs" }, "肩": { zh: "肩", en: "Shoulders" }, "手臂": { zh: "手臂", en: "Arms" }, "核心": { zh: "核心", en: "Core" }, "全身": { zh: "全身", en: "Full body" }, "其他": { zh: "其他", en: "Other" } };
type Draft = { occurredAt: string; trainingType: TrainingType; bodyParts: TrainingBodyPart[]; teacher: string; course: string; durationMinutes: string; notes: string };
function emptyDraft(initialDate?: string): Draft { return { occurredAt: initialDate ?? currentLocalDate(), trainingType: "mixed", bodyParts: [], teacher: "", course: "", durationMinutes: "", notes: "" }; }
function draftFromLog(log: TrainingLog): Draft { return { occurredAt: compactDateTimeValue(log.occurredAt, log.occurredHasExplicitTime), trainingType: log.trainingType, bodyParts: log.bodyParts, teacher: log.teacher, course: log.course, durationMinutes: log.durationMinutes === null ? "" : String(log.durationMinutes), notes: log.notes }; }
function getError(result: unknown, fallback: string) { return result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : fallback; }

export function TrainingLogEditor({ record, initialDate, suggestions, onClose, onSaved, onDeleted }: { record?: TrainingLog; initialDate?: string; suggestions: TrainingInputSuggestions; onClose: () => void; onSaved: () => Promise<void> | void; onDeleted?: () => Promise<void> | void }) {
  const { english } = useLocale();
  const [draft, setDraft] = useState<Draft>(() => record ? draftFromLog(record) : emptyDraft(initialDate));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const typeLabel = (type: TrainingType) => trainingTypeLabels[type][english ? "en" : "zh"];
  const bodyPartLabel = (part: TrainingBodyPart) => trainingBodyPartLabels[part][english ? "en" : "zh"];
  function toggleBodyPart(bodyPart: TrainingBodyPart) { setDraft((current) => ({ ...current, bodyParts: current.bodyParts.includes(bodyPart) ? current.bodyParts.filter((item) => item !== bodyPart) : [...current.bodyParts, bodyPart] })); }
  function applyPreset(preset: TrainingInputSuggestions["presets"][number]) { setDraft((current) => ({ ...current, trainingType: preset.trainingType, bodyParts: preset.bodyParts, teacher: preset.teacher, course: preset.course, durationMinutes: preset.durationMinutes === null ? "" : String(preset.durationMinutes) })); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (!draft.bodyParts.length) { setError(english ? "Choose at least one training area" : "请至少选择一个训练部位"); return; }
    const occurred = compactDateTimePayload(draft.occurredAt); setSaving(true);
    try {
      const response = await fetch(record ? `/api/health/training/${record.id}` : "/api/health/training", { method: record ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ occurredAt: occurred.value, occurredHasExplicitTime: occurred.hasExplicitTime, trainingType: draft.trainingType, bodyParts: draft.bodyParts, teacher: draft.teacher, course: draft.course, durationMinutes: draft.durationMinutes ? Number(draft.durationMinutes) : null, notes: draft.notes }) });
      const result = await response.json().catch(() => null); if (!response.ok) { setError(getError(result, "Could not save training")); return; }
      await onSaved(); onClose();
    } catch { setError("Could not save training"); } finally { setSaving(false); }
  }
  async function remove() { if (!record || !onDeleted || !confirm("Delete this training log?")) return; setSaving(true); setError(""); try { const response = await fetch(`/api/health/training/${record.id}`, { method: "DELETE" }); if (!response.ok) { setError("Could not delete training"); return; } await onDeleted(); onClose(); } catch { setError("Could not delete training"); } finally { setSaving(false); } }
  return <FormSheet title={record ? english ? "Edit training" : "编辑训练" : english ? "Log training" : "记录训练"} onClose={onClose} formId="training-log-form" submitLabel={record ? english ? "Save changes" : "保存修改" : english ? "Log training" : "记录训练"} busy={saving}>
    <form id="training-log-form" className="training-form" onSubmit={(event) => void submit(event)}>
      <DateTimeField label={english ? "Date" : "日期"} value={{ date: draft.occurredAt.slice(0, 10), time: draft.occurredAt.length > 10 ? draft.occurredAt.slice(11, 16) : "" }} onChange={(value) => setDraft({ ...draft, occurredAt: value.date + (value.time ? `T${value.time}` : "") })} />
      <label className="field"><span>{english ? "Training type" : "训练类型"}</span><select value={draft.trainingType} onChange={(event) => setDraft({ ...draft, trainingType: event.target.value as TrainingType })}>{Object.keys(trainingTypeLabels).map((value) => <option value={value} key={value}>{typeLabel(value as TrainingType)}</option>)}</select></label>
      <fieldset className="training-body-field"><legend>{english ? "Training areas" : "训练部位"}</legend><div className="training-body-parts">{TRAINING_BODY_PARTS.map((bodyPart) => <button type="button" key={bodyPart} className={draft.bodyParts.includes(bodyPart) ? "active" : ""} aria-pressed={draft.bodyParts.includes(bodyPart)} onClick={() => toggleBodyPart(bodyPart)}>{bodyPartLabel(bodyPart)}</button>)}</div></fieldset>
      <div className="form-grid training-form-grid"><label className="field"><span>{english ? "Teacher" : "老师"} <small>{english ? "Optional" : "可选"}</small></span><input list="training-teacher-history" maxLength={120} value={draft.teacher} onChange={(event) => setDraft({ ...draft, teacher: event.target.value })} /></label><label className="field"><span>{english ? "Course" : "课程"} <small>{english ? "Optional" : "可选"}</small></span><input list="training-course-history" maxLength={160} value={draft.course} onChange={(event) => setDraft({ ...draft, course: event.target.value })} /></label><label className="field"><span>{english ? "Duration (min)" : "时长（分钟）"} <small>{english ? "Optional" : "可选"}</small></span><input type="number" min="1" max="1440" step="1" value={draft.durationMinutes} onChange={(event) => setDraft({ ...draft, durationMinutes: event.target.value })} /></label><label className="field wide"><span>{english ? "Notes" : "备注"} <small>{english ? "Optional" : "可选"}</small></span><textarea rows={3} maxLength={5000} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label></div>
      <datalist id="training-teacher-history">{suggestions.teachers.map((value) => <option value={value} key={value} />)}</datalist><datalist id="training-course-history">{suggestions.courses.map((value) => <option value={value} key={value} />)}</datalist>
      {!record && suggestions.presets.length > 0 && <section className="training-presets"><div><span>{english ? "RECENT & COMMON" : "近期与常用"}</span><small>{english ? "Date and notes stay unchanged" : "日期和当次备注不会被覆盖"}</small></div><div>{suggestions.presets.map((preset) => <button type="button" key={JSON.stringify([preset.teacher,preset.course,preset.trainingType,preset.bodyParts,preset.durationMinutes])} onClick={() => applyPreset(preset)}><strong>{preset.course || typeLabel(preset.trainingType)}</strong><span>{[preset.teacher,preset.bodyParts.map(bodyPartLabel).join(" · "),preset.durationMinutes ? `${preset.durationMinutes} min` : ""].filter(Boolean).join(" · ")}</span><small>{preset.useCount > 1 ? `${preset.useCount}×` : english ? "Recent" : "最近"}</small></button>)}</div></section>}
      {error && <p className="form-error">{error}</p>}{record && onDeleted && <button className="danger-text training-delete" type="button" onClick={() => void remove()}>{english ? "Delete training log" : "删除训练记录"}</button>}
    </form>
  </FormSheet>;
}
