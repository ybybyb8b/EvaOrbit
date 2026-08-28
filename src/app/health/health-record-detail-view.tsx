"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import type { HealthRecord } from "@/lib/types";
import { HealthRecordEditor } from "./health-record-editor";
import { formatRecordMoment, healthRecordStatusLabels, healthRecordTypeLabels } from "./health-record-utils";

export function HealthRecordDetailView({ initial }: { initial: HealthRecord }) {
  const router = useRouter();
  const [record, setRecord] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function changeStatus() {
    setError(""); setMessage("");
    const next = record.status === "active" ? "resolved" : "active";
    try {
      const response = await fetch(`/api/health/records/${record.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
      const result = await response.json().catch(() => null) as HealthRecord | { error?: string } | null;
      if (!response.ok) { setError(result && "error" in result ? result.error || "Could not update this record" : "Could not update this record"); return; }
      setRecord(result as HealthRecord); setMessage(next === "resolved" ? "Record resolved" : "Record reopened");
    } catch { setError("Could not update this record"); }
  }

  async function remove() {
    if (!confirm(`Delete “${record.title}”? This cannot be undone.`)) return;
    setError("");
    try {
      const response = await fetch(`/api/health/records/${record.id}`, { method: "DELETE" });
      if (response.ok) { router.push("/health/records"); return; }
      const result = await response.json().catch(() => null) as { error?: string } | null;
      setError(result?.error || "Could not delete this record");
    } catch { setError("Could not delete this record"); }
  }

  return <div className="page health-page health-detail-page">
    <Link className="back-link" href="/health/records">← Health records</Link>
    <header className="health-detail-header"><div><span className="eyebrow">{healthRecordTypeLabels[record.type]}</span><h1>{record.title}</h1><div className="health-detail-meta"><span className={`health-status-pill ${record.status}`}>{healthRecordStatusLabels[record.status]}</span><time>{formatRecordMoment(record.occurredAt,record.occurredHasExplicitTime)}</time></div></div><span className="health-detail-header-icon"><Icon name="health" /></span></header>
    {message && <p className="success-banner" role="status">{message}</p>}
    {error && <p className="form-error">{error}</p>}
    {editing && <HealthRecordEditor editing={record} onCancel={() => setEditing(false)} onSaved={(next) => { setRecord(next); setEditing(false); setMessage("Health record saved"); }} />}
    {!editing && <>
      <section className="health-detail-card"><div className="health-detail-summary"><span className="eyebrow">SUMMARY</span><p>{record.summary || "No summary added."}</p></div><dl className="health-detail-dates"><div><dt>Occurred</dt><dd>{formatRecordMoment(record.occurredAt,record.occurredHasExplicitTime)}</dd></div>{record.startedAt && <div><dt>Started</dt><dd>{formatRecordMoment(record.startedAt,record.startedHasExplicitTime)}</dd></div>}{record.endedAt && <div><dt>Ended</dt><dd>{formatRecordMoment(record.endedAt,record.endedHasExplicitTime)}</dd></div>}</dl>{Object.keys(record.details).length > 0 && <div className="health-detail-fields"><span className="eyebrow">DETAILS</span><dl>{Object.entries(record.details).map(([key, value]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{value === null ? "—" : String(value)}</dd></div>)}</dl></div>}</section>
      <div className="health-detail-actions"><button className="button primary" onClick={() => setEditing(true)}><Icon name="edit" />Edit</button><button className="button secondary" onClick={() => void changeStatus()}>{record.status === "active" ? "Resolve" : "Reopen"}</button><button className="text-button danger" onClick={() => void remove()}><Icon name="trash" />Delete</button></div>
    </>}
  </div>;
}
