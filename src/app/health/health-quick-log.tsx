"use client";
import {useFormPreview} from "@/components/form-preview";
import { ErrorNotice } from "@/components/error-notice";
import { PageLoading } from "@/components/page-loading";

import { useEffect, useState, type ComponentType } from "react";
import { Droplet, Dumbbell, Health, Pill, Weight, type IconComponent } from "reicon-react";
import { FormSheet } from "@/components/form-sheet";
import { useLocale } from "@/components/locale-controller";
import { loadCachedJson } from "@/lib/client-json-cache";
import {useHealthData} from "@/components/health-data-context";
import type { MedicationPreset, MenstrualPeriod, TrainingInputSuggestions, TrainingLog, WeightRecord } from "@/lib/types";
import {periodDayForDate} from "@/lib/timeline";
import {currentLocalDate} from "@/components/date-time-field";
import { HealthRecordEditor } from "./health-record-editor";
import { workoutActivityLabel } from "@/lib/training-workout";
import { compactDateTimeValue } from "@/components/date-time-field";
import { TrainingLogEditor } from "./training-log-editor";
import { WeightEditor } from "./weight-section";
import { MedicationDoseEditor, PeriodFlowEditor, StartPeriodEditor } from "./period-medication-section";

type HealthQuickLogEditorProps = {
  initialDate: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

type HealthQuickLogDefinition = {
  kind: string;
  icon: IconComponent;
  en: string;
  zh: string;
  Editor: ComponentType<HealthQuickLogEditorProps>;
};

function useRemoteJson<T>(url: string) {
  const {read,local}=useHealthData();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ data: T | null; error: string }>({ data: null, error: "" });
  useEffect(() => {
    let mounted = true;
    void (local?read(url).then(async response=>{if(!response.ok)throw new Error("Not downloaded");return await response.json() as T;}):loadCachedJson<T>(url))
      .then((data) => { if (mounted) setState({ data, error: "" }); })
      .catch(() => {
        if (mounted) setState({ data: null, error: "Could not open this form" });
      });
    return () => { mounted = false; };
  }, [attempt, url,local,read]);
  return { ...state, retry: () => { setState({ data: null, error: "" }); setAttempt((value) => value + 1); } };
}

function LoadSheet({ title, error, onClose, onRetry }: { title: string; error: string; onClose: () => void; onRetry: () => void }) {
  const { english } = useLocale();
  return <FormSheet title={title} onClose={onClose}>
    {error ? <><ErrorNotice role="alert">{english ? error : "暂时无法打开此表单"}</ErrorNotice><button type="button" className="button secondary" onClick={onRetry}>{english ? "Try again" : "重试"}</button></> : <PageLoading title={title} englishTitle={title} inline />}
  </FormSheet>;
}

function TrainingQuickLog({ initialDate, onClose, onSaved }: HealthQuickLogEditorProps) {
  const request = useRemoteJson<TrainingInputSuggestions>("/api/health/training/suggestions");
  const { english } = useLocale();
  const pending = useRemoteJson<TrainingLog[]>("/api/health/training?pendingDetails=true");
  const [selection, setSelection] = useState<TrainingLog | "new" | null>(null);
  if (selection) return <TrainingLogEditor record={selection === "new" ? undefined : selection} initialDate={initialDate} suggestions={request.data ?? { teachers: [], courses: [], presets: [] }} onClose={onClose} onSaved={onSaved} />;
  return <FormSheet title={english ? "Training" : "训练"} onClose={onClose}>
    <div className="training-workout-picker">
      <button type="button" className="button primary" onClick={() => setSelection("new")}>{english ? "Log new training" : "记录新训练"}</button>
      <h3>{english ? "Add details to a workout" : "补充已有训练"}</h3>
      <p>{english ? "Apple Health workouts waiting for your training details." : "选择已同步的 Apple Health 训练，补充具体内容。"}</p>
      {pending.error ? <><ErrorNotice>{english ? "Could not load workouts. Try again." : "未能加载训练，请重试。"}</ErrorNotice><button className="button secondary" onClick={pending.retry}>{english ? "Try again" : "重试"}</button></> : !pending.data ? <PageLoading title="正在加载训练" englishTitle="Loading workouts" inline /> : pending.data.length ? <div className="training-log-list">{pending.data.map(log => <button className="training-log-main" key={log.id} onClick={() => setSelection(log)}><span><strong>{workoutActivityLabel(log, english)}</strong><small>{compactDateTimeValue(log.occurredAt, true).replace("T", " · ")} · Apple Health</small></span><span>{new Intl.NumberFormat(english ? "en" : "zh-CN", { maximumFractionDigits: 1 }).format((log.workout?.workout?.durationSeconds ?? 0) / 60)} {english ? "min" : "分钟"}</span></button>)}</div> : <p>{english ? "No downloaded workouts need details. Sync Apple Health or log new training." : "已下载的训练暂无待补充项。可同步 Apple Health，或记录新训练。"}</p>}
    </div>
  </FormSheet>;
}

function WeightQuickLog({ initialDate, onClose, onSaved }: HealthQuickLogEditorProps) {
  const { english } = useLocale();
  const request = useRemoteJson<WeightRecord[]>("/api/health/weight?limit=1");
  if (!request.data) return <LoadSheet title={english ? "Log weight" : "记录体重"} error={request.error} onClose={onClose} onRetry={request.retry} />;
  return <WeightEditor initialDate={initialDate} initialWeight={request.data[0]?.weightKg ?? 65} onClose={onClose} onSaved={async () => { await onSaved(); onClose(); }} />;
}

function HealthRecordQuickLog({ initialDate, onClose, onSaved }: HealthQuickLogEditorProps) {
  const preview=useFormPreview();

  const { english } = useLocale();
  const [saving, setSaving] = useState(false);
  return <FormSheet title={english ? "Add health record" : "新增健康记录"} onClose={onClose} formId="home-health-record-form" submitLabel={english ? "Add record" : "新增记录"} busy={saving} submitDisabled={preview}>
    <HealthRecordEditor initialDate={initialDate} formId="home-health-record-form" onSavingChange={setSaving} onCancel={onClose} onSaved={async () => { await onSaved(); onClose(); }} />
  </FormSheet>;
}

function PeriodQuickLog({initialDate,onClose,onSaved}:HealthQuickLogEditorProps){const request=useRemoteJson<MenstrualPeriod[]>("/api/health/periods?limit=30");if(!request.data)return <LoadSheet title="记录经期 / 经量" error={request.error} onClose={onClose} onRetry={request.retry}/>;const saved=async()=>{await onSaved();onClose();};return periodDayForDate(request.data,initialDate,currentLocalDate())?<PeriodFlowEditor initialDate={initialDate} periods={request.data} onClose={onClose} onSaved={saved}/>:<StartPeriodEditor initialDate={initialDate} onClose={onClose} onSaved={saved}/>;}
function MedicationDoseQuickLog({initialDate,onClose,onSaved}:HealthQuickLogEditorProps){const periods=useRemoteJson<MenstrualPeriod[]>("/api/health/periods?limit=30"),presets=useRemoteJson<MedicationPreset[]>("/api/health/medications?limit=100");if(!periods.data||!presets.data)return <LoadSheet title="记录服药" error={periods.error||presets.error} onClose={onClose} onRetry={()=>{periods.retry();presets.retry();}}/>;return <MedicationDoseEditor initialDate={initialDate} periods={periods.data} presets={presets.data} onClose={onClose} onSaved={async()=>{await onSaved();onClose();}}/>;}

export const HEALTH_QUICK_LOGS = [
  { kind: "training", icon: Dumbbell, en: "Training", zh: "训练", Editor: TrainingQuickLog },
  { kind: "weight", icon: Weight, en: "Weight", zh: "体重", Editor: WeightQuickLog },
  { kind: "period", icon: Droplet, en: "Period / Flow", zh: "经期 / 经量", Editor: PeriodQuickLog },
  { kind: "medication-dose", icon: Pill, en: "Medication dose", zh: "服药", Editor: MedicationDoseQuickLog },
  { kind: "health-record", icon: Health, en: "Health record", zh: "健康记录", Editor: HealthRecordQuickLog },
] as const satisfies readonly HealthQuickLogDefinition[];

export type HealthQuickLogKind = typeof HEALTH_QUICK_LOGS[number]["kind"];

export function getHealthQuickLog(kind: unknown) {
  return HEALTH_QUICK_LOGS.find((item) => item.kind === kind);
}
