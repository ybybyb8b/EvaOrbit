"use client";

import { useState } from "react";
import Link from "next/link";
import { FormSheet } from "@/components/form-sheet";
import { Icon } from "@/components/icons";
import { compactDateTimePayload, compactDateTimeValue, currentLocalDate, DateTimeField } from "@/components/date-time-field";
import { TRAINING_BODY_PARTS, type TrainingBodyPart, type TrainingInputSuggestions, type TrainingLog, type TrainingType } from "@/lib/types";

const trainingTypeLabels: Record<TrainingType, string> = { cardio: "有氧", strength: "无氧", mixed: "混合" };
type Draft = { occurredAt: string; trainingType: TrainingType; bodyParts: TrainingBodyPart[]; teacher: string; course: string; durationMinutes: string; notes: string };

function emptyDraft(): Draft { return { occurredAt: currentLocalDate(), trainingType: "mixed", bodyParts: [], teacher: "", course: "", durationMinutes: "", notes: "" }; }
function draftFromLog(log: TrainingLog): Draft { return { occurredAt: compactDateTimeValue(log.occurredAt, log.occurredHasExplicitTime), trainingType: log.trainingType, bodyParts: log.bodyParts, teacher: log.teacher, course: log.course, durationMinutes: log.durationMinutes === null ? "" : String(log.durationMinutes), notes: log.notes }; }
function getError(result: unknown, fallback: string) { return result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : fallback; }
function trainingMeta(log: TrainingLog) { return [log.occurredHasExplicitTime ? compactDateTimeValue(log.occurredAt, true).slice(11) : "Date only", log.course, log.teacher, log.durationMinutes ? `${log.durationMinutes} min` : ""].filter(Boolean).join(" · "); }

export function TrainingSection({ initial, initialSuggestions, today }: { initial: TrainingLog[]; initialSuggestions: TrainingInputSuggestions; today: string }) {
  const [logs, setLogs] = useState(initial);
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [editing, setEditing] = useState<TrainingLog>();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function openCreate() { setEditing(undefined); setDraft(emptyDraft()); setError(""); setOpen(true); }
  function openEdit(log: TrainingLog) { setEditing(log); setDraft(draftFromLog(log)); setError(""); setOpen(true); }
  function close() { setOpen(false); setEditing(undefined); setError(""); }
  function toggleBodyPart(bodyPart: TrainingBodyPart) { setDraft((current) => ({ ...current, bodyParts: current.bodyParts.includes(bodyPart) ? current.bodyParts.filter((item) => item !== bodyPart) : [...current.bodyParts, bodyPart] })); }

  async function reload() {
    const [logsResponse, suggestionsResponse] = await Promise.all([fetch(`/api/health/training?date=${encodeURIComponent(today)}`), fetch("/api/health/training/suggestions")]);
    if (logsResponse.ok) setLogs(await logsResponse.json());
    if (suggestionsResponse.ok) setSuggestions(await suggestionsResponse.json());
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (!draft.bodyParts.length) { setError("请至少选择一个训练部位"); return; }
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
    {open && <FormSheet title={editing ? "Edit training" : "Log training"} onClose={close} formId="training-log-form" submitLabel={editing ? "Save changes" : "Log training"} busy={saving}>
      <form id="training-log-form" className="training-form" onSubmit={(event) => void submit(event)}>
        <DateTimeField label="Date" value={{ date: draft.occurredAt.slice(0, 10), time: draft.occurredAt.length > 10 ? draft.occurredAt.slice(11, 16) : "" }} onChange={(value) => setDraft({ ...draft, occurredAt: value.date + (value.time ? `T${value.time}` : "") })} />
        <label className="field"><span>训练类型</span><select value={draft.trainingType} onChange={(event) => setDraft({ ...draft, trainingType: event.target.value as TrainingType })}>{Object.entries(trainingTypeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <fieldset className="training-body-field"><legend>训练部位</legend><div className="training-body-parts">{TRAINING_BODY_PARTS.map((bodyPart) => <button type="button" key={bodyPart} className={draft.bodyParts.includes(bodyPart) ? "active" : ""} aria-pressed={draft.bodyParts.includes(bodyPart)} onClick={() => toggleBodyPart(bodyPart)}>{bodyPart}</button>)}</div></fieldset>
        <div className="form-grid training-form-grid">
          <label className="field"><span>老师 <small>(optional)</small></span><input list="training-teacher-history" maxLength={120} value={draft.teacher} onChange={(event) => setDraft({ ...draft, teacher: event.target.value })} /></label>
          <label className="field"><span>课程 <small>(optional)</small></span><input list="training-course-history" maxLength={160} value={draft.course} onChange={(event) => setDraft({ ...draft, course: event.target.value })} /></label>
          <label className="field"><span>时长（分钟） <small>(optional)</small></span><input type="number" min="1" max="1440" step="1" value={draft.durationMinutes} onChange={(event) => setDraft({ ...draft, durationMinutes: event.target.value })} /></label>
          <label className="field wide"><span>Notes <small>(optional)</small></span><textarea rows={3} maxLength={5000} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
        </div>
        <datalist id="training-teacher-history">{suggestions.teachers.map((value) => <option value={value} key={value} />)}</datalist>
        <datalist id="training-course-history">{suggestions.courses.map((value) => <option value={value} key={value} />)}</datalist>
        {error && <p className="form-error">{error}</p>}
        {editing && <button className="danger-text training-delete" type="button" onClick={() => void remove()}>Delete training log</button>}
      </form>
    </FormSheet>}
    <div className="section-heading"><div><span className="eyebrow">TRAINING</span><h2>Today</h2></div><div className="training-heading-actions"><Link className="text-button" href="/health/training">History</Link><button className="text-button training-add" onClick={openCreate}><Icon name="plus" />Log training</button></div></div>
    {logs.length ? <div className="training-log-list">{logs.map((log) => <article className="training-log-row" key={log.id}><button className="training-log-main" onClick={() => openEdit(log)}><span><strong>{trainingTypeLabels[log.trainingType]}</strong><small>{log.bodyParts.join(" · ")}</small></span><span className="training-log-meta">{trainingMeta(log)}</span></button><button className="icon-button subtle" aria-label={`Edit ${trainingTypeLabels[log.trainingType]} training`} onClick={() => openEdit(log)}><Icon name="edit" /></button></article>)}</div> : <p className="health-inline-empty">No training logged today.</p>}
  </section>;
}
