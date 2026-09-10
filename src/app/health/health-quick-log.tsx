"use client";

import { useEffect, useState, type ComponentType } from "react";
import { Dumbbell, Health, Weight, type IconComponent } from "reicon-react";
import { FormSheet } from "@/components/form-sheet";
import { useLocale } from "@/components/locale-controller";
import type { TrainingInputSuggestions, WeightRecord } from "@/lib/types";
import { HealthRecordEditor } from "./health-record-editor";
import { TrainingLogEditor } from "./training-log-editor";
import { WeightEditor } from "./weight-section";

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
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ data: T | null; error: string }>({ data: null, error: "" });
  useEffect(() => {
    const controller = new AbortController();
    void fetch(url, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        setState({ data: await response.json() as T, error: "" });
      })
      .catch((reason: unknown) => {
        if (reason instanceof Error && reason.name === "AbortError") return;
        setState({ data: null, error: "Could not open this form" });
      });
    return () => controller.abort();
  }, [attempt, url]);
  return { ...state, retry: () => { setState({ data: null, error: "" }); setAttempt((value) => value + 1); } };
}

function LoadSheet({ title, error, onClose, onRetry }: { title: string; error: string; onClose: () => void; onRetry: () => void }) {
  const { english } = useLocale();
  return <FormSheet title={title} onClose={onClose}>
    {error ? <><p className="form-error" role="alert">{english ? error : "暂时无法打开此表单"}</p><button type="button" className="button secondary" onClick={onRetry}>{english ? "Try again" : "重试"}</button></> : <p className="home-today-empty">{english ? "Loading…" : "正在读取…"}</p>}
  </FormSheet>;
}

function TrainingQuickLog({ initialDate, onClose, onSaved }: HealthQuickLogEditorProps) {
  const { english } = useLocale();
  const request = useRemoteJson<TrainingInputSuggestions>("/api/health/training/suggestions");
  if (!request.data) return <LoadSheet title={english ? "Log training" : "记录训练"} error={request.error} onClose={onClose} onRetry={request.retry} />;
  return <TrainingLogEditor initialDate={initialDate} suggestions={request.data} onClose={onClose} onSaved={onSaved} />;
}

function WeightQuickLog({ initialDate, onClose, onSaved }: HealthQuickLogEditorProps) {
  const { english } = useLocale();
  const request = useRemoteJson<WeightRecord[]>("/api/health/weight?limit=1");
  if (!request.data) return <LoadSheet title={english ? "Log weight" : "记录体重"} error={request.error} onClose={onClose} onRetry={request.retry} />;
  return <WeightEditor initialDate={initialDate} initialWeight={request.data[0]?.weightKg ?? 65} onClose={onClose} onSaved={async () => { await onSaved(); onClose(); }} />;
}

function HealthRecordQuickLog({ initialDate, onClose, onSaved }: HealthQuickLogEditorProps) {
  const { english } = useLocale();
  const [saving, setSaving] = useState(false);
  return <FormSheet title={english ? "Add health record" : "新增健康记录"} onClose={onClose} formId="home-health-record-form" submitLabel={english ? "Add record" : "新增记录"} busy={saving}>
    <HealthRecordEditor initialDate={initialDate} formId="home-health-record-form" onSavingChange={setSaving} onCancel={onClose} onSaved={async () => { await onSaved(); onClose(); }} />
  </FormSheet>;
}

export const HEALTH_QUICK_LOGS = [
  { kind: "training", icon: Dumbbell, en: "Training", zh: "训练", Editor: TrainingQuickLog },
  { kind: "weight", icon: Weight, en: "Weight", zh: "体重", Editor: WeightQuickLog },
  { kind: "health-record", icon: Health, en: "Health record", zh: "健康记录", Editor: HealthRecordQuickLog },
] as const satisfies readonly HealthQuickLogDefinition[];

export type HealthQuickLogKind = typeof HEALTH_QUICK_LOGS[number]["kind"];

export function getHealthQuickLog(kind: unknown) {
  return HEALTH_QUICK_LOGS.find((item) => item.kind === kind);
}
