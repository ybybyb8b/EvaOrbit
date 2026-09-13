"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Icon } from "@/components/icons";
import { FormSheet } from "@/components/form-sheet";
import { useLocale } from "@/components/locale-controller";
import { PageHeader } from "@/components/page-header";
import { buildHealthDashboard } from "@/lib/health-dashboard";
import type { DailyNutritionSummary, HealthRecord, MedicationDoseEvent, MedicationPreset, MenstrualFlowRecord, MenstrualPeriod, ScheduledNotification, TrainingInputSuggestions, TrainingLog, WeightRecord, WeightSettings } from "@/lib/types";
import { DailyEnergyCard } from "./daily-energy-card";
import { HealthRecordEditor } from "./health-record-editor";
import { HealthRecordList } from "./health-record-card";
import { TrainingSection } from "./training-section";
import { WeightSection } from "./weight-section";
import { PeriodMedicationSection } from "./period-medication-section";

type Dashboard = { current: HealthRecord[]; recent: HealthRecord[] };

export function HealthView({ initial, initialEnergy, initialEnergyHistory, initialTraining, initialRecentTraining, initialTrainingSuggestions, initialFocusedTraining, initialWeights, initialWeightSettings, initialFocusedWeight, initialPeriods, initialMenstrualFlows, initialMedicationPresets, initialMedicationDoses, initialMedicationReminders, today }: { initial: Dashboard; initialEnergy: DailyNutritionSummary; initialEnergyHistory: DailyNutritionSummary[]; initialTraining: TrainingLog[]; initialRecentTraining: TrainingLog[]; initialTrainingSuggestions: TrainingInputSuggestions; initialFocusedTraining?: TrainingLog; initialWeights: WeightRecord[]; initialWeightSettings: WeightSettings; initialFocusedWeight?: WeightRecord; initialPeriods:MenstrualPeriod[]; initialMenstrualFlows:MenstrualFlowRecord[]; initialMedicationPresets:MedicationPreset[]; initialMedicationDoses:MedicationDoseEvent[]; initialMedicationReminders:ScheduledNotification[]; today: string }) {
  const { english } = useLocale();
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

  return <div className="page health-page" data-has-current={dashboard.current.length > 0}>
    <PageHeader eyebrow="生活" title="Health" action={<button className="button primary" onClick={openCreate}><Icon name="plus" />新增记录</button>} />
    {message && <p className="success-banner" role="status">{message}</p>}
    {error && <p className="form-error">{error}</p>}
    {editorOpen && <FormSheet title={editing ? "Edit health record" : "Add health record"} onClose={closeEditor} formId="health-record-form" submitLabel={editing ? "Save changes" : "Add record"} busy={saving}><HealthRecordEditor key={editing ? `edit-${editing.id}` : "new"} formId="health-record-form" editing={editing} onSavingChange={setSaving} onCancel={closeEditor} onSaved={() => { closeEditor(); setMessage("Health record saved"); void load(); }} /></FormSheet>}
    {dashboard.current.length > 0 && <section className="health-section health-current-section"><div className="section-heading"><div><span className="eyebrow">CURRENT</span><h2>{english ? "In view now" : "当前关注"}</h2></div><span>{dashboard.current.length}</span></div><div className="health-record-list">{dashboard.current.map((record) => <HealthRecordPreview key={record.id} record={record} onEdit={() => openEdit(record)} />)}</div></section>}
    <PeriodMedicationSection initialPeriods={initialPeriods} initialFlows={initialMenstrualFlows} initialPresets={initialMedicationPresets} initialDoses={initialMedicationDoses} initialReminders={initialMedicationReminders}/>
    <WeightSection initialRecords={initialWeights} initialSettings={initialWeightSettings} initialFocused={initialFocusedWeight} />
    <TrainingSection initial={initialTraining} initialRecent={initialRecentTraining} initialSuggestions={initialTrainingSuggestions} initialFocused={initialFocusedTraining} today={today} />
    <DailyEnergyCard initial={initialEnergy} initialHistory={initialEnergyHistory} />
    <section className="health-section health-records-section"><div className="section-heading"><div><span className="eyebrow">RECORDS</span><h2>{english ? "Health records" : "健康记录"}</h2></div><Link href="/health/records">{english ? "View all" : "查看全部"} <Icon name="arrow" /></Link></div><HealthRecordList records={dashboard.recent} /></section>
  </div>;
}

function HealthRecordPreview({ record, onEdit }: { record: HealthRecord; onEdit: () => void }) {
  return <article className="health-current-card"><Link href={`/health/records/${record.id}`} className="health-current-main"><span><strong>{record.title}</strong><small>{record.type.replaceAll("_", " ")} · {new Date(record.occurredAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</small></span></Link><button className="text-button" onClick={onEdit}>Edit</button></article>;
}
