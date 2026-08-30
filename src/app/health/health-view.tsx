"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Icon } from "@/components/icons";
import { FormSheet } from "@/components/form-sheet";
import { PageHeader } from "@/components/page-header";
import type { DailyNutritionSummary, HealthRecord } from "@/lib/types";
import { DailyEnergyCard } from "./daily-energy-card";
import { HealthRecordEditor } from "./health-record-editor";
import { HealthRecordList } from "./health-record-card";

type Dashboard = { current: HealthRecord[]; recent: HealthRecord[] };

export function HealthView({ initial, initialEnergy, initialEnergyHistory }: { initial: Dashboard; initialEnergy: DailyNutritionSummary; initialEnergyHistory: DailyNutritionSummary[] }) {
  const [dashboard, setDashboard] = useState(initial);
  const [editing, setEditing] = useState<HealthRecord | undefined>();
  const [editorOpen, setEditorOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [currentResponse, recentResponse] = await Promise.all([
      fetch("/api/health/records?status=active&limit=6"),
      fetch("/api/health/records?limit=8"),
    ]);
    if (currentResponse.ok && recentResponse.ok) setDashboard({ current: await currentResponse.json(), recent: await recentResponse.json() });
  }, []);

  function closeEditor() { setEditorOpen(false); setEditing(undefined); }
  function openCreate() { setError(""); setMessage(""); setEditing(undefined); setEditorOpen(true); }
  function openEdit(record: HealthRecord) { setError(""); setMessage(""); setEditing(record); setEditorOpen(true); }

  return <div className="page health-page">
    <PageHeader eyebrow="LIFE" title="Health" description="Personal health records" action={<button className="button primary" onClick={openCreate}><Icon name="plus" />New record</button>} />
    {message && <p className="success-banner" role="status">{message}</p>}
    {error && <p className="form-error">{error}</p>}
    {editorOpen && <FormSheet title={editing ? "Edit health record" : "Add health record"} onClose={closeEditor} formId="health-record-form" submitLabel={editing ? "Save changes" : "Add record"} busy={saving}><HealthRecordEditor key={editing ? `edit-${editing.id}` : "new"} formId="health-record-form" editing={editing} onSavingChange={setSaving} onCancel={closeEditor} onSaved={(record) => { closeEditor(); setMessage("Health record saved"); setDashboard((current) => ({ current: record.status === "active" ? [record, ...current.current.filter((item) => item.id !== record.id)].slice(0, 6) : current.current.filter((item) => item.id !== record.id), recent: [record, ...current.recent.filter((item) => item.id !== record.id)].slice(0, 8) })); void load(); }} /></FormSheet>}
    <section className="health-section health-current-section"><div className="section-heading"><div><span className="eyebrow">CURRENT</span><h2>Worth keeping in view</h2></div><span>Active now</span></div>{dashboard.current.length ? <div className="health-record-list">{dashboard.current.slice(0, 6).map((record) => <HealthRecordPreview key={record.id} record={record} onEdit={() => openEdit(record)} />)}</div> : <div className="health-empty compact"><span className="health-empty-icon"><Icon name="health" /></span><h2>Nothing active</h2><p>Resolved records stay in your history.</p></div>}</section>
    <DailyEnergyCard initial={initialEnergy} initialHistory={initialEnergyHistory} />
    <section className="health-section"><div className="section-heading"><div><span className="eyebrow">RECENT</span><h2>Health records</h2></div><Link href="/health/records">View all <Icon name="arrow" /></Link></div><HealthRecordList records={dashboard.recent.slice(0, 6)} /></section>
  </div>;
}

function HealthRecordPreview({ record, onEdit }: { record: HealthRecord; onEdit: () => void }) {
  return <article className="health-current-card"><Link href={`/health/records/${record.id}`} className="health-current-main"><span className="health-current-icon"><Icon name="health" /></span><span><strong>{record.title}</strong><small>{record.type.replaceAll("_", " ")} · {new Date(record.occurredAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</small></span></Link><button className="text-button" onClick={onEdit}>Edit</button></article>;
}
