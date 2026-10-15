"use client";
import { PageLogAction } from "@/components/bottom-log";
import { ToastNotice } from "@/components/action-toast";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { FormSheet } from "@/components/form-sheet";
import { useLocale } from "@/components/locale-controller";
import { PageHeader } from "@/components/page-header";
import type { DailyNutritionSummary, HealthRecord, MedicationDoseEvent, MedicationPreset, MenstrualFlowRecord, MenstrualPeriod, ScheduledNotification, TrainingInputSuggestions, TrainingLog, TrainingPlan, WeightRecord, WeightSettings } from "@/lib/types";
import { DailyEnergyCard } from "./daily-energy-card";
import { HealthRecordEditor } from "./health-record-editor";
import { HealthRecordList } from "./health-record-card";
import { TrainingSection } from "./training-section";
import { WeightSection } from "./weight-section";
import { PeriodMedicationSection } from "./period-medication-section";
import { SleepSection } from "./sleep-section";
import type { DailySleepSummary } from "@/lib/sleep";
import { subscribeDataChanged } from "@/lib/data-changed";
import { EVAORBIT_TIME_ZONE } from "@/lib/time";
import { HealthOverview } from "./health-overview";
import { HEALTH_QUICK_LOGS, getHealthQuickLog, type HealthQuickLogKind } from "./health-quick-log";
import { healthRecordTypeLabels } from "./health-record-utils";
import { translateUiCopy } from "@/lib/ui-copy";
import styles from "./health-detail.module.css";

type Dashboard = { current: HealthRecord[]; recent: HealthRecord[] };
export type HealthViewName = "overview" | "sleep" | "weight" | "training" | "energy" | "cycle" | "records";

export function HealthView({ view = "overview", initialSleep, initial, initialEnergy, initialEnergyHistory, initialTraining, initialRecentTraining, initialTrainingSuggestions, initialFocusedTraining, initialTrainingPlan, initialWeights, initialWeightSettings, initialFocusedWeight, initialPeriods, initialMenstrualFlows, initialMedicationPresets, initialMedicationDoses, initialMedicationReminders, today }: { view?: HealthViewName; initialSleep: DailySleepSummary; initial: Dashboard; initialEnergy: DailyNutritionSummary; initialEnergyHistory: DailyNutritionSummary[]; initialTraining: TrainingLog[]; initialRecentTraining: TrainingLog[]; initialTrainingSuggestions: TrainingInputSuggestions; initialFocusedTraining?: TrainingLog; initialTrainingPlan: TrainingPlan | null; initialWeights: WeightRecord[]; initialWeightSettings: WeightSettings; initialFocusedWeight?: WeightRecord; initialPeriods:MenstrualPeriod[]; initialMenstrualFlows:MenstrualFlowRecord[]; initialMedicationPresets:MedicationPreset[]; initialMedicationDoses:MedicationDoseEvent[]; initialMedicationReminders:ScheduledNotification[]; today: string }) {
  const { english } = useLocale();
  const router = useRouter();
  const [quickPicker, setQuickPicker] = useState(false);
  const [quickKind, setQuickKind] = useState<HealthQuickLogKind | null>(null);
  const QuickEditor = getHealthQuickLog(quickKind)?.Editor;
  const dashboard = initial;
  const [editing, setEditing] = useState<HealthRecord | undefined>();
  const [editorOpen, setEditorOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => subscribeDataChanged(["health", "calendar"], () => router.refresh()), [router]);

  function closeEditor() { setEditorOpen(false); setEditing(undefined); }
  function openCreate() { setError(""); setMessage(""); setEditing(undefined); setEditorOpen(true); }
  function openEdit(record: HealthRecord) { setError(""); setMessage(""); setEditing(record); setEditorOpen(true); }

  const attention = dashboard.current.length > 0 ? <section className="health-section health-current-section"><div className="section-heading"><div><h2>{english ? "In view now" : "当前关注"}</h2></div><span>{dashboard.current.length}</span></div><div className="health-record-list">{dashboard.current.map((record) => <HealthRecordPreview key={record.id} record={record} onEdit={() => openEdit(record)} />)}</div></section> : null;
  const titles = { overview: "Health", sleep: english ? "Sleep" : "睡眠", weight: english ? "Weight" : "体重", training: english ? "Training" : "训练", energy: english ? "Energy" : "能量", cycle: english ? "Period & medication" : "经期与用药", records: english ? "Health records" : "健康记录" };
  return <div className={`page health-page health-refined${view !== "overview" ? ` ${styles.detail}` : ""}`} data-view={view} data-has-current={dashboard.current.length > 0}>
    <PageHeader eyebrow="" title={titles[view]} action={(view === "overview" || view === "records") ? <PageLogAction label={view === "overview" ? "记录健康" : "新增健康记录"} className="button primary" onClick={view === "overview" ? () => setQuickPicker(true) : openCreate}><Icon name="plus" />{english ? "Log" : "记录"}</PageLogAction> : undefined} />
    {quickPicker && <FormSheet title={english ? "Log health" : "记录健康"} onClose={() => setQuickPicker(false)}><div className="health-log-choices">{HEALTH_QUICK_LOGS.map(item => <button type="button" key={item.kind} onClick={() => { setQuickPicker(false); setQuickKind(item.kind); }}><item.icon /><span>{english ? item.en : item.zh}</span><Icon name="arrow" /></button>)}</div></FormSheet>}
    {QuickEditor && <QuickEditor initialDate={today} onClose={() => setQuickKind(null)} onSaved={async () => { router.refresh(); }} />}
    {message && <ToastNotice message={message} onShown={() => setMessage("")} />}
    {error && <p className="form-error">{error}</p>}
    {editorOpen && <FormSheet title={editing ? (english ? "Edit health record" : "编辑健康记录") : (english ? "Add health record" : "新增健康记录")} onClose={closeEditor} formId="health-record-form" submitLabel={english ? "Save" : "保存"} busy={saving}><HealthRecordEditor key={editing ? `edit-${editing.id}` : "new"} formId="health-record-form" editing={editing} onSavingChange={setSaving} onCancel={closeEditor} onSaved={() => { closeEditor(); setMessage(english ? "Health record saved" : "健康记录已保存"); router.refresh(); }} /></FormSheet>}
    {view === "overview" && <HealthOverview initialSleep={initialSleep} initialEnergy={initialEnergy} initialTraining={initialTraining} initialWeights={initialWeights} initialPeriods={initialPeriods} initialMedicationReminders={initialMedicationReminders} today={today}>{attention}</HealthOverview>}
    {view === "records" && attention}
    {view === "cycle" && <PeriodMedicationSection initialPeriods={initialPeriods} initialFlows={initialMenstrualFlows} initialPresets={initialMedicationPresets} initialDoses={initialMedicationDoses} initialReminders={initialMedicationReminders}/>}
    {view === "weight" && <WeightSection initialRecords={initialWeights} initialSettings={initialWeightSettings} initialFocused={initialFocusedWeight} />}
    {view === "sleep" && <SleepSection initial={initialSleep} />}
    {view === "training" && <TrainingSection initialPlan={initialTrainingPlan} initial={initialTraining} initialRecent={initialRecentTraining} initialSuggestions={initialTrainingSuggestions} initialFocused={initialFocusedTraining} today={today} />}
    {view === "energy" && <DailyEnergyCard initial={initialEnergy} initialHistory={initialEnergyHistory} />}
    {view === "records" && <section className="health-section health-records-section"><div className="section-heading"><div><h2>{english ? "Recent records" : "近期记录"}</h2></div><Link href="/health/records">{english ? "View all" : "查看全部"} <Icon name="arrow" /></Link></div><HealthRecordList records={dashboard.recent} /></section>}
  </div>;
}

function HealthRecordPreview({ record, onEdit }: { record: HealthRecord; onEdit: () => void }) {
  const { english, language } = useLocale();
  return <article className="health-current-card"><Link href={`/health/records/${record.id}`} className="health-current-main"><span><strong>{record.title}</strong><small>{translateUiCopy(healthRecordTypeLabels[record.type], language)} · {new Date(record.occurredAt).toLocaleDateString(english ? "en-US" : "zh-CN", { month: "short", day: "numeric", timeZone: EVAORBIT_TIME_ZONE })}</small></span></Link><button className="text-button" onClick={onEdit}>{english ? "Edit" : "编辑"}</button></article>;
}
