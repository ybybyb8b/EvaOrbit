"use client";
import {useFormPreview,FormPreviewNotice} from "@/components/form-preview";
import {useHealthData} from "@/components/health-data-context";
import { ErrorNotice } from "@/components/error-notice";
import { ChoiceSelect } from "@/components/choice-select";
import { SuggestedInput } from "@/components/suggested-input";
import { showActionToast } from "@/components/action-toast";

import { useRef, useState } from "react";
import { FormSheet } from "@/components/form-sheet";
import { useLocale } from "@/components/locale-controller";
import { compactDateTimePayload, compactDateTimeValue, currentLocalDate, DateTimeField } from "@/components/date-time-field";
import { invalidateCachedJson } from "@/lib/client-json-cache";
import { TRAINING_BODY_PARTS, type TrainingBodyPart, type TrainingInputSuggestions, type TrainingLog, type TrainingType } from "@/lib/types";
import type { TrainingPlan, TrainingSessionDetails } from "@/lib/types";
import { TrainingWorkoutSummary } from "./training-workout-summary";
import { TrainingExercises } from "./training-exercises";
import { trainingDayDraft } from "@/lib/training-plan";

export const trainingTypeLabels: Record<TrainingType, { zh: string; en: string }> = { cardio: { zh: "有氧", en: "Cardio" }, strength: { zh: "无氧", en: "Strength" }, mixed: { zh: "混合", en: "Mixed" } };
export const trainingBodyPartLabels: Record<TrainingBodyPart, { zh: string; en: string }> = { "胸": { zh: "胸", en: "Chest" }, "背": { zh: "背", en: "Back" }, "腿": { zh: "腿", en: "Legs" }, "肩": { zh: "肩", en: "Shoulders" }, "手臂": { zh: "手臂", en: "Arms" }, "核心": { zh: "核心", en: "Core" }, "全身": { zh: "全身", en: "Full body" }, "其他": { zh: "其他", en: "Other" } };
type Draft = { occurredAt: string; trainingType: TrainingType; bodyParts: TrainingBodyPart[]; teacher: string; course: string; durationMinutes: string; notes: string; trainingContent: string; sessionDetails: TrainingSessionDetails };
function emptyDraft(initialDate?: string): Draft { return { occurredAt: initialDate ?? currentLocalDate(), trainingType: "mixed", bodyParts: [], teacher: "", course: "", durationMinutes: "", notes: "", trainingContent: "", sessionDetails: { plan: null, exercises: [], videos: [] } }; }
function draftFromLog(log: TrainingLog): Draft { return { occurredAt: compactDateTimeValue(log.occurredAt, log.occurredHasExplicitTime), trainingType: log.trainingType, bodyParts: log.bodyParts, teacher: log.teacher, course: log.course, durationMinutes: log.durationMinutes === null ? "" : String(log.durationMinutes), notes: log.notes, trainingContent: log.trainingContent ?? "", sessionDetails: structuredClone(log.sessionDetails ?? { plan: null, exercises: [], videos: [] }) }; }
function getError(result: unknown, fallback: string) { return result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : fallback; }

export function TrainingLogEditor({ record, initialDate, suggestions, planCompletion, onClose, onSaved, onDeleted }: { record?: TrainingLog; initialDate?: string; suggestions: TrainingInputSuggestions; planCompletion?: { plan: TrainingPlan; requestKey: string }; onClose: () => void; onSaved: (plan?: TrainingPlan) => Promise<void> | void; onDeleted?: () => Promise<void> | void }) {
  const preview=useFormPreview();

  const {read}=useHealthData();

  const { english } = useLocale();
  const [draft, setDraft] = useState<Draft>(() => {
    if (record) {
      const saved = draftFromLog(record);
      if (!planCompletion) return saved;
      const planned = trainingDayDraft(planCompletion.plan);
      return { ...saved, bodyParts: saved.bodyParts.length ? saved.bodyParts : planned.bodyParts, sessionDetails: {
        plan: planned.sessionDetails.plan,
        exercises: saved.sessionDetails.exercises.length ? saved.sessionDetails.exercises : planned.sessionDetails.exercises,
        videos: saved.sessionDetails.videos.length ? saved.sessionDetails.videos : planned.sessionDetails.videos,
      } };
    }
    const empty = emptyDraft(initialDate);
    if (!planCompletion) return empty;
    const fields = trainingDayDraft(planCompletion.plan);
    return { ...empty, ...fields, durationMinutes: fields.durationMinutes === null ? "" : String(fields.durationMinutes) };
  });
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const typeLabel = (type: TrainingType) => trainingTypeLabels[type][english ? "en" : "zh"];
  const bodyPartLabel = (part: TrainingBodyPart) => trainingBodyPartLabels[part][english ? "en" : "zh"];
  function toggleBodyPart(bodyPart: TrainingBodyPart) { setDraft((current) => ({ ...current, bodyParts: current.bodyParts.includes(bodyPart) ? current.bodyParts.filter((item) => item !== bodyPart) : [...current.bodyParts, bodyPart] })); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if(preview || record?.workoutDeleted)return; if (savingRef.current) return; setError("");
    if (!draft.bodyParts.length) { setError(english ? "Choose at least one training area" : "请至少选择一个训练部位"); return; }
    const occurred = compactDateTimePayload(draft.occurredAt); savingRef.current = true; setSaving(true);
    try {
      const log = { occurredAt: occurred.value, occurredHasExplicitTime: occurred.hasExplicitTime, trainingType: draft.trainingType, bodyParts: draft.bodyParts, teacher: draft.teacher, course: draft.course, durationMinutes: draft.durationMinutes ? Number(draft.durationMinutes) : null, notes: draft.notes, trainingContent: draft.trainingContent, sessionDetails: draft.sessionDetails.plan || draft.sessionDetails.exercises.length || draft.sessionDetails.videos.length ? draft.sessionDetails : null };
      if (record?.workout) {
        for (const key of ["occurredAt", "occurredHasExplicitTime", "trainingType", "durationMinutes"] as const) Reflect.deleteProperty(log, key);
      }
      const payload = planCompletion ? { expectedVersion: planCompletion.plan.version, dayId: planCompletion.plan.currentDayId, requestKey: planCompletion.requestKey, ...(record?.workout ? { workoutLogId: record.id } : {}), log } : log;
      const response = await read(planCompletion ? "/api/health/training/plan/complete" : record ? `/api/health/training/${record.id}` : "/api/health/training", { method: planCompletion || !record ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => null); if (!response.ok) { setError(getError(result, "Could not save training")); return; }
      invalidateCachedJson("/api/health/training/suggestions"); await onSaved(planCompletion ? result.plan : undefined); onClose();
    } catch { setError("Could not save training"); } finally { savingRef.current = false; setSaving(false); }
  }
  async function remove() { if(preview)return; if (!record || !onDeleted || !confirm("Delete this training log?")) return; setSaving(true); setError(""); try { const response = await read(`/api/health/training/${record.id}`, { method: "DELETE" }); if (!response.ok) { setError("Could not delete training"); return; } invalidateCachedJson("/api/health/training/suggestions"); await onDeleted(); showActionToast(english ? "Training log deleted" : "训练记录已删除", "deleted"); onClose(); } catch { setError("Could not delete training"); } finally { setSaving(false); } }
  return <FormSheet title={planCompletion ? english ? "Training session" : "本次训练" : record ? english ? "Edit training" : "编辑训练" : english ? "Log training" : "记录训练"} onClose={onClose} formId="training-log-form" submitLabel={planCompletion ? english ? "Complete & log" : "完成并记录" : record ? english ? "Save changes" : "保存修改" : english ? "Log training" : "记录训练"} busy={saving} submitDisabled={preview || record?.workoutDeleted}>
    <form id="training-log-form" className="training-form" onSubmit={(event) => void submit(event)}>{preview&&<FormPreviewNotice/>}
      {planCompletion && <p className="training-plan-hint">{english ? "Your plan advances only after this record is saved. Cancel to keep your place." : "保存这条记录后才进入下一个训练日；取消不会改变进度。"}</p>}
      {draft.sessionDetails.plan && <details className="training-session-reference"><summary>{english ? "Plan reference" : "计划参考"} · {draft.sessionDetails.plan.name} · Day {draft.sessionDetails.plan.dayNumber}｜{draft.sessionDetails.plan.dayName}</summary>{draft.sessionDetails.plan.content && <p>{draft.sessionDetails.plan.content}</p>}</details>}
      {record?.workout && <TrainingWorkoutSummary record={record} />}
      {!record?.workout && <><DateTimeField label={english ? "Date" : "日期"} value={{ date: draft.occurredAt.slice(0, 10), time: draft.occurredAt.length > 10 ? draft.occurredAt.slice(11, 16) : "" }} onChange={(value) => setDraft({ ...draft, occurredAt: value.date + (value.time ? `T${value.time}` : "") })} />
      <label className="field"><span>{english ? "Training type" : "训练类型"}</span><ChoiceSelect value={draft.trainingType} onChange={(event) => setDraft({ ...draft, trainingType: event.target.value as TrainingType })}>{Object.keys(trainingTypeLabels).map((value) => <option value={value} key={value}>{typeLabel(value as TrainingType)}</option>)}</ChoiceSelect></label></>}
      <fieldset className="training-body-field"><legend>{english ? "Training areas" : "训练部位"}</legend><div className="training-body-parts">{TRAINING_BODY_PARTS.map((bodyPart) => <button type="button" key={bodyPart} className={draft.bodyParts.includes(bodyPart) ? "active" : ""} aria-pressed={draft.bodyParts.includes(bodyPart)} data-form-change onClick={() => toggleBodyPart(bodyPart)}>{bodyPartLabel(bodyPart)}</button>)}</div></fieldset>
      <div className="form-grid training-form-grid"><div className="field"><span>{english ? "Teacher" : "老师"} <small>{english ? "Optional" : "可选"}</small></span><SuggestedInput suggestionLabel={english ? "Teacher" : "老师"} suggestions={suggestions.teachers} maxLength={120} value={draft.teacher} onValueChange={nextValue => setDraft({ ...draft, teacher: nextValue })} /></div><div className="field"><span>{english ? "Course" : "课程"} <small>{english ? "Optional" : "可选"}</small></span><SuggestedInput suggestionLabel={english ? "Course" : "课程"} suggestions={suggestions.courses} maxLength={160} value={draft.course} onValueChange={nextValue => setDraft({ ...draft, course: nextValue })} /></div>{!record?.workout && <label className="field"><span>{english ? "Duration (min)" : "时长（分钟）"} <small>{english ? "Optional" : "可选"}</small></span><input type="number" min="1" max="1440" step="1" value={draft.durationMinutes} onChange={(event) => setDraft({ ...draft, durationMinutes: event.target.value })} /></label>}</div>
      <TrainingExercises title={english ? "Training content" : "训练内容"} items={draft.sessionDetails.exercises} recording suggestions={suggestions.exercises ?? []} presets={suggestions.exercisePresets ?? []} previous={suggestions.previousExercises ?? []} onChange={exercises => setDraft(current => ({ ...current, sessionDetails: { ...current.sessionDetails, exercises } }))} />
      <details className="training-content-description" open={record?.trainingContent ? true : undefined}><summary>{english ? "Written description (optional)" : "文字补充（可选）"}</summary><label className="field wide"><span>{english ? "Training description" : "训练内容补充"}</span><textarea rows={2} maxLength={5000} placeholder={english ? "Only add anything the exercises above do not cover" : "上面的动作未涵盖的内容，再补充在这里"} value={draft.trainingContent} onChange={event => setDraft({ ...draft, trainingContent: event.target.value })} /></label></details>
      {draft.sessionDetails.videos.length > 0 && <section className="training-session-videos"><div className="training-plan-links-heading"><span>{english ? "Video practice" : "视频跟练"}</span></div>{draft.sessionDetails.videos.map((video, index) => <div className="training-session-video" key={index}><label className="training-exercise-check"><input type="checkbox" checked={video.completed} onChange={event => setDraft(current => ({ ...current, sessionDetails: { ...current.sessionDetails, videos: current.sessionDetails.videos.map((item, i) => i === index ? { ...item, completed: event.target.checked } : item) } }))} />{english ? 'Video ' : '视频 '}{index + 1} · {english ? 'Completed' : '已完成'}</label><a href={video.url} target="_blank" rel="noopener noreferrer">{english ? 'Open video' : '打开视频'}</a></div>)}</section>}
      <label className="field wide"><span>{english ? "Notes" : "备注"} <small>{english ? "Optional" : "可选"}</small></span><textarea rows={3} maxLength={5000} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>



      {error && <ErrorNotice>{error}</ErrorNotice>}{record && !record.workout && onDeleted && <button className="danger-text training-delete" type="button" disabled={preview} onClick={() => void remove()}>{english ? "Delete training log" : "删除训练记录"}</button>}
    </form>
  </FormSheet>;
}
