"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Icon } from "@/components/icons";
import { FormSheet } from "@/components/form-sheet";
import { PageHeader } from "@/components/page-header";
import { buildHealthDashboard } from "@/lib/health-dashboard";
import type { DailyNutritionSummary, HealthRecord, TrainingInputSuggestions, TrainingLog } from "@/lib/types";
import { DailyEnergyCard } from "./daily-energy-card";
import { HealthRecordEditor } from "./health-record-editor";
import { HealthRecordList } from "./health-record-card";
import { TrainingSection } from "./training-section";

type Dashboard = { current: HealthRecord[]; recent: HealthRecord[] };

export function HealthView({ initial, initialEnergy, initialEnergyHistory, initialTraining, initialTrainingSuggestions, today }: { initial: Dashboard; initialEnergy: DailyNutritionSummary; initialEnergyHistory: DailyNutritionSummary[]; initialTraining: TrainingLog[]; initialTrainingSuggestions: TrainingInputSuggestions; today: string }) {
  const [dashboard, setDashboard] = useState(initial);
  const [editing, setEditing] = useState<HealthRecord | undefined>();
  const [editorOpen, setEditorOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/health/records?limit=100");
    if (response.ok) setDashboard(buildHealthDashboard(await response.json()));
  }, []);

  function closeEditor() { setEditorOpen(false); setEditing(undefined); }
  function openCreate() { setError(""); setMessage(""); setEditing(undefined); setEditorOpen(true); }
  function openEdit(record: HealthRecord) { setError(""); setMessage(""); setEditing(record); setEditorOpen(true); }

  return <div className="page health-page">
    <PageHeader eyebrow="生活" title="Health" action={<button className="button primary" onClick={openCreate}><Icon name="plus" />新增记录</button>} />
    {message && <p className="success-banner" role="status">{message}</p>}
    {error && <p className="form-error">{error}</p>}
    {editorOpen && <FormSheet title={editing ? "Edit health record" : "Add health record"} onClose={closeEditor} formId="health-record-form" submitLabel={editing ? "Save changes" : "Add record"} busy={saving}><HealthRecordEditor key={editing ? `edit-${editing.id}` : "new"} formId="health-record-form" editing={editing} onSavingChange={setSaving} onCancel={closeEditor} onSaved={() => { closeEditor(); setMessage("Health record saved"); void load(); }} /></FormSheet>}
    <section className="health-section health-current-section"><div className="section-heading"><div><span className="eyebrow">CURRENT</span><h2>Worth keeping in view</h2></div><span>Active</span></div>{dashboard.current.length ? <div className="health-record-list">{dashboard.current.map((record) => <HealthRecordPreview key={record.id} record={record} onEdit={() => openEdit(record)} />)}</div> : <p className="health-inline-empty">Nothing active right now.</p>}</section>
    <TrainingSection initial={initialTraining} initialSuggestions={initialTrainingSuggestions} today={today} />
    <DailyEnergyCard initial={initialEnergy} initialHistory={initialEnergyHistory} />
    <section className="health-section"><div className="section-heading"><div><span className="eyebrow">RECENT</span><h2>Health records</h2></div><Link href="/health/records">View all <Icon name="arrow" /></Link></div><HealthRecordList records={dashboard.recent} /></section>
  </div>;
}

function HealthRecordPreview({ record, onEdit }: { record: HealthRecord; onEdit: () => void }) {
  return <article className="health-current-card"><Link href={`/health/records/${record.id}`} className="health-current-main"><span><strong>{record.title}</strong><small>{record.type.replaceAll("_", " ")} · {new Date(record.occurredAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</small></span></Link><button className="text-button" onClick={onEdit}>Edit</button></article>;
}
