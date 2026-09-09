"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { useLocale } from "@/components/locale-controller";
import { compactDateTimeValue } from "@/components/date-time-field";
import { type TrainingBodyPart, type TrainingInputSuggestions, type TrainingLog, type TrainingType } from "@/lib/types";
import { dateInEvaOrbit, shiftDate } from "@/lib/time";
import { TrainingLogEditor, trainingBodyPartLabels, trainingTypeLabels } from "./training-log-editor";

function trainingMeta(log: TrainingLog, english: boolean) { return [log.occurredHasExplicitTime ? compactDateTimeValue(log.occurredAt, true).slice(11) : english ? "Date only" : "日期记录", log.course, log.teacher, log.durationMinutes ? english ? `${log.durationMinutes} min` : `${log.durationMinutes} 分钟` : ""].filter(Boolean).join(" · "); }

export function TrainingSection({ initial, initialRecent, initialSuggestions, initialFocused, today }: { initial: TrainingLog[]; initialRecent: TrainingLog[]; initialSuggestions: TrainingInputSuggestions; initialFocused?: TrainingLog; today: string }) {
  const { english } = useLocale();
  const [logs, setLogs] = useState(initial);
  const [recent, setRecent] = useState(initialRecent);
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [editing, setEditing] = useState<TrainingLog | undefined>(initialFocused);
  const [open, setOpen] = useState(Boolean(initialFocused));
  const pastLogs = recent.filter((log) => dateInEvaOrbit(new Date(log.occurredAt)) !== today);
  const typeLabel = (type: TrainingType) => trainingTypeLabels[type][english ? "en" : "zh"];
  const bodyPartLabel = (part: TrainingBodyPart) => trainingBodyPartLabels[part][english ? "en" : "zh"];

  function openCreate() { setEditing(undefined); setOpen(true); }
  function openEdit(log: TrainingLog) { setEditing(log); setOpen(true); }
  function close() {
    setOpen(false); setEditing(undefined);
    const url = new URL(window.location.href);
    if (url.searchParams.has("training")) {
      url.searchParams.delete("training");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }

  async function reload() {
    const [logsResponse, recentResponse, suggestionsResponse] = await Promise.all([fetch(`/api/health/training?date=${encodeURIComponent(today)}`), fetch(`/api/health/training?from=${shiftDate(today,-6)}&to=${shiftDate(today,1)}`), fetch("/api/health/training/suggestions")]);
    if (logsResponse.ok) setLogs(await logsResponse.json());
    if (recentResponse.ok) setRecent(await recentResponse.json());
    if (suggestionsResponse.ok) setSuggestions(await suggestionsResponse.json());
  }

  return <section className="health-section training-section">
    {open && <TrainingLogEditor record={editing} suggestions={suggestions} onClose={close} onSaved={reload} onDeleted={reload} />}
    <div className="section-heading"><div><span className="eyebrow">TRAINING</span><h2>{english ? "Today" : "今天"}</h2></div><div className="training-heading-actions"><button className="text-button training-add" onClick={openCreate}><Icon name="plus" />{english ? "Log training" : "记录训练"}</button></div></div>
    {logs.length ? <div className="training-log-list">{logs.map((log) => <article className="training-log-row" key={log.id}><button className="training-log-main" onClick={() => openEdit(log)}><span><strong>{typeLabel(log.trainingType)}</strong><small>{log.bodyParts.map(bodyPartLabel).join(" · ")}</small></span><span className="training-log-meta">{trainingMeta(log, english)}</span></button><button className="icon-button subtle" aria-label={`${english ? "Edit" : "编辑"} ${typeLabel(log.trainingType)}`} onClick={() => openEdit(log)}><Icon name="edit" /></button></article>)}</div> : <p className="health-inline-empty">{english ? "No training logged today." : "今日还没有训练记录。"}</p>}
    <details className="training-history"><summary><span><small>{english ? "LAST 7 DAYS" : "最近 7 天"}</small><strong>{english ? "Training history" : "训练记录"}</strong></span><span>{pastLogs.length}</span></summary>
      {pastLogs.length ? <div className="training-log-list training-recent-list">{pastLogs.map((log) => <article className="training-log-row" key={log.id}><button className="training-log-main" onClick={() => openEdit(log)}><span><strong>{typeLabel(log.trainingType)}</strong><small>{new Intl.DateTimeFormat(english ? "en" : "zh-CN", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${dateInEvaOrbit(new Date(log.occurredAt))}T12:00:00Z`))} · {log.bodyParts.map(bodyPartLabel).join(" · ")}</small></span><span className="training-log-meta">{trainingMeta(log, english)}</span></button><button className="icon-button subtle" aria-label={`${english ? "Edit" : "编辑"} ${typeLabel(log.trainingType)}`} onClick={() => openEdit(log)}><Icon name="edit" /></button></article>)}</div> : <p className="health-inline-empty">{english ? "No earlier training in the last 7 days." : "最近 7 天没有更早的训练记录。"}</p>}
      <p className="training-history-note">{english ? "Earlier training stays available in Home Calendar + Timeline." : "更早训练请通过首页 Calendar + Timeline 查看。"}</p>
    </details>
  </section>;
}
