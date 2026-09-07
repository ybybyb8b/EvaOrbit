"use client";

import { useState } from "react";
import { FormSheet } from "@/components/form-sheet";
import { Icon } from "@/components/icons";
import { useLocale } from "@/components/locale-controller";
import { compactDateTimePayload, compactDateTimeValue, currentLocalDate, DateTimeField } from "@/components/date-time-field";
import { TRAINING_BODY_PARTS, type TrainingBodyPart, type TrainingInputSuggestions, type TrainingLog, type TrainingType } from "@/lib/types";
import { dateInEvaOrbit } from "@/lib/time";

const trainingTypeLabels: Record<TrainingType, { zh: string; en: string }> = {
  cardio: { zh: "有氧", en: "Cardio" },
  strength: { zh: "无氧", en: "Strength" },
  mixed: { zh: "混合", en: "Mixed" },
};
const trainingBodyPartLabels: Record<TrainingBodyPart, { zh: string; en: string }> = {
  "胸": { zh: "胸", en: "Chest" },
  "背": { zh: "背", en: "Back" },
  "腿": { zh: "腿", en: "Legs" },
  "肩": { zh: "肩", en: "Shoulders" },
  "手臂": { zh: "手臂", en: "Arms" },
  "核心": { zh: "核心", en: "Core" },
  "全身": { zh: "全身", en: "Full body" },
  "其他": { zh: "其他", en: "Other" },
};
type Draft = { occurredAt: string; trainingType: TrainingType; bodyParts: TrainingBodyPart[]; teacher: string; course: string; durationMinutes: string; notes: string };

function emptyDraft(): Draft { return { occurredAt: currentLocalDate(), trainingType: "mixed", bodyParts: [], teacher: "", course: "", durationMinutes: "", notes: "" }; }
function draftFromLog(log: TrainingLog): Draft { return { occurredAt: compactDateTimeValue(log.occurredAt, log.occurredHasExplicitTime), trainingType: log.trainingType, bodyParts: log.bodyParts, teacher: log.teacher, course: log.course, durationMinutes: log.durationMinutes === null ? "" : String(log.durationMinutes), notes: log.notes }; }
function getError(result: unknown, fallback: string) { return result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : fallback; }
function trainingMeta(log: TrainingLog, english: boolean) { return [log.occurredHasExplicitTime ? compactDateTimeValue(log.occurredAt, true).slice(11) : english ? "Date only" : "日期记录", log.course, log.teacher, log.durationMinutes ? english ? `${log.durationMinutes} min` : `${log.durationMinutes} 分钟` : ""].filter(Boolean).join(" · "); }

export function TrainingSection({ initial, initialRecent, initialSuggestions, initialFocused, today }: { initial: TrainingLog[]; initialRecent: TrainingLog[]; initialSuggestions: TrainingInputSuggestions; initialFocused?: TrainingLog; today: string }) {
  const { english } = useLocale();
  const [logs, setLogs] = useState(initial);
  const [recent, setRecent] = useState(initialRecent);
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [editing, setEditing] = useState<TrainingLog | undefined>(initialFocused);
  const [draft, setDraft] = useState<Draft>(() => initialFocused ? draftFromLog(initialFocused) : emptyDraft());
  const [open, setOpen] = useState(Boolean(initialFocused));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pastLogs = recent.filter((log) => dateInEvaOrbit(new Date(log.occurredAt)) !== today).slice(0, 6);
  const typeLabel = (type: TrainingType) => trainingTypeLabels[type][english ? "en" : "zh"];
  const bodyPartLabel = (part: TrainingBodyPart) => trainingBodyPartLabels[part][english ? "en" : "zh"];

  function openCreate() { setEditing(undefined); setDraft(emptyDraft()); setError(""); setOpen(true); }
  function openEdit(log: TrainingLog) { setEditing(log); setDraft(draftFromLog(log)); setError(""); setOpen(true); }
  function close() {
    setOpen(false); setEditing(undefined); setError("");
    const url = new URL(window.location.href);
    if (url.searchParams.has("training")) {
      url.searchParams.delete("training");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }
  function toggleBodyPart(bodyPart: TrainingBodyPart) { setDraft((current) => ({ ...current, bodyParts: current.bodyParts.includes(bodyPart) ? current.bodyParts.filter((item) => item !== bodyPart) : [...current.bodyParts, bodyPart] })); }

  async function reload() {
    const [logsResponse, recentResponse, suggestionsResponse] = await Promise.all([fetch(`/api/health/training?date=${encodeURIComponent(today)}`), fetch("/api/health/training"), fetch("/api/health/training/suggestions")]);
    if (logsResponse.ok) setLogs(await logsResponse.json());
    if (recentResponse.ok) setRecent((await recentResponse.json() as TrainingLog[]).slice(0, 10));
    if (suggestionsResponse.ok) setSuggestions(await suggestionsResponse.json());
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (!draft.bodyParts.length) { setError(english ? "Choose at least one training area" : "请至少选择一个训练部位"); return; }
    const occurred = compactDateTimePayload(draft.occurredAt);
    setSaving(true);
    try {
      const response = await fetch(editing ? `/api/health/training/${editing.id}` : "/api/health/training", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ occurredAt: occurred.value, occurredHasExplicitTime: occurred.hasExplicitTime, trainingType: draft.trainingType, bodyParts: draft.bodyParts, teacher: draft.teacher, course: draft.course, durationMinutes: draft.durationMinutes ? Number(draft.durationMinutes) : null, notes: draft.notes }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) { setError(getError(result, "Could not save training")); return; }
      close(); await reload();
    } catch { setError("Could not save training"); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!editing || !confirm("Delete this training log?")) return;
    setSaving(true); setError("");
    try { const response = await fetch(`/api/health/training/${editing.id}`, { method: "DELETE" }); if (!response.ok) { setError("Could not delete training"); return; } close(); await reload(); }
    catch { setError("Could not delete training"); }
    finally { setSaving(false); }
  }

  return <section className="health-section training-section">
    {open && <FormSheet title={editing ? english ? "Edit training" : "编辑训练" : english ? "Log training" : "记录训练"} onClose={close} formId="training-log-form" submitLabel={editing ? english ? "Save changes" : "保存修改" : english ? "Log training" : "记录训练"} busy={saving}>
      <form id="training-log-form" className="training-form" onSubmit={(event) => void submit(event)}>
        <DateTimeField label={english ? "Date" : "日期"} value={{ date: draft.occurredAt.slice(0, 10), time: draft.occurredAt.length > 10 ? draft.occurredAt.slice(11, 16) : "" }} onChange={(value) => setDraft({ ...draft, occurredAt: value.date + (value.time ? `T${value.time}` : "") })} />
        <label className="field"><span>{english ? "Training type" : "训练类型"}</span><select value={draft.trainingType} onChange={(event) => setDraft({ ...draft, trainingType: event.target.value as TrainingType })}>{Object.keys(trainingTypeLabels).map((value) => <option value={value} key={value}>{typeLabel(value as TrainingType)}</option>)}</select></label>
        <fieldset className="training-body-field"><legend>{english ? "Training areas" : "训练部位"}</legend><div className="training-body-parts">{TRAINING_BODY_PARTS.map((bodyPart) => <button type="button" key={bodyPart} className={draft.bodyParts.includes(bodyPart) ? "active" : ""} aria-pressed={draft.bodyParts.includes(bodyPart)} onClick={() => toggleBodyPart(bodyPart)}>{bodyPartLabel(bodyPart)}</button>)}</div></fieldset>
        <div className="form-grid training-form-grid">
          <label className="field"><span>{english ? "Teacher" : "老师"} <small>{english ? "Optional" : "可选"}</small></span><input list="training-teacher-history" maxLength={120} value={draft.teacher} onChange={(event) => setDraft({ ...draft, teacher: event.target.value })} /></label>
          <label className="field"><span>{english ? "Course" : "课程"} <small>{english ? "Optional" : "可选"}</small></span><input list="training-course-history" maxLength={160} value={draft.course} onChange={(event) => setDraft({ ...draft, course: event.target.value })} /></label>
          <label className="field"><span>{english ? "Duration (min)" : "时长（分钟）"} <small>{english ? "Optional" : "可选"}</small></span><input type="number" min="1" max="1440" step="1" value={draft.durationMinutes} onChange={(event) => setDraft({ ...draft, durationMinutes: event.target.value })} /></label>
          <label className="field wide"><span>{english ? "Notes" : "备注"} <small>{english ? "Optional" : "可选"}</small></span><textarea rows={3} maxLength={5000} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
        </div>
        <datalist id="training-teacher-history">{suggestions.teachers.map((value) => <option value={value} key={value} />)}</datalist>
        <datalist id="training-course-history">{suggestions.courses.map((value) => <option value={value} key={value} />)}</datalist>
        {error && <p className="form-error">{error}</p>}
        {editing && <button className="danger-text training-delete" type="button" onClick={() => void remove()}>{english ? "Delete training log" : "删除训练记录"}</button>}
      </form>
    </FormSheet>}
    <div className="section-heading"><div><span className="eyebrow">TRAINING</span><h2>{english ? "Today" : "今天"}</h2></div><div className="training-heading-actions"><button className="text-button training-add" onClick={openCreate}><Icon name="plus" />{english ? "Log training" : "记录训练"}</button></div></div>
    {logs.length ? <div className="training-log-list">{logs.map((log) => <article className="training-log-row" key={log.id}><button className="training-log-main" onClick={() => openEdit(log)}><span><strong>{typeLabel(log.trainingType)}</strong><small>{log.bodyParts.map(bodyPartLabel).join(" · ")}</small></span><span className="training-log-meta">{trainingMeta(log, english)}</span></button><button className="icon-button subtle" aria-label={`${english ? "Edit" : "编辑"} ${typeLabel(log.trainingType)}`} onClick={() => openEdit(log)}><Icon name="edit" /></button></article>)}</div> : <p className="health-inline-empty">{english ? "No training logged today." : "今日还没有训练记录。"}</p>}
    <div className="training-recent-heading"><span>{english ? "RECENT" : "最近"}</span><strong>{english ? "Training history" : "训练记录"}</strong></div>
    {pastLogs.length ? <div className="training-log-list training-recent-list">{pastLogs.map((log) => <article className="training-log-row" key={log.id}><button className="training-log-main" onClick={() => openEdit(log)}><span><strong>{typeLabel(log.trainingType)}</strong><small>{new Intl.DateTimeFormat(english ? "en" : "zh-CN", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${dateInEvaOrbit(new Date(log.occurredAt))}T12:00:00Z`))} · {log.bodyParts.map(bodyPartLabel).join(" · ")}</small></span><span className="training-log-meta">{trainingMeta(log, english)}</span></button><button className="icon-button subtle" aria-label={`${english ? "Edit" : "编辑"} ${typeLabel(log.trainingType)}`} onClick={() => openEdit(log)}><Icon name="edit" /></button></article>)}</div> : <p className="health-inline-empty">{english ? "No earlier training yet." : "还没有更早的训练记录。"}</p>}
  </section>;
}
