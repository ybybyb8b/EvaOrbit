"use client";

import { useState, type FormEvent } from "react";
import { ErrorNotice } from "@/components/error-notice";
import { ChoiceSelect } from "@/components/choice-select";
import { SearchableSelect } from "@/components/searchable-select";
import { SuggestedInput } from "@/components/suggested-input";
import { FormPreviewNotice, useFormPreview } from "@/components/form-preview";
import { useHealthData } from "@/components/health-data-context";
import { useLocale } from "@/components/locale-controller";
import { compactDateTimePayload, compactDateTimeValue, currentLocalDate, DateTimeField } from "@/components/date-time-field";
import { useFormHistory, historyValues } from "@/components/use-form-history";
import { apiErrorMessage } from "@/lib/response-error";
import type { HealthRecord, HealthRecordDetails, HealthRecordStatus, HealthRecordType } from "@/lib/types";
import {
  detailFields, healthRecordStatusLabels, healthRecordStatusLabelsZh, healthRecordTypeLabels,
  healthRecordTypeLabelsZh, healthRecordTypes, healthRecordUsesStatus,
} from "./health-record-utils";
import styles from "./health-records.module.css";

type Draft = {
  type: HealthRecordType;
  title: string;
  summary: string;
  occurredAt: string;
  status: HealthRecordStatus;
  startedAt: string;
  endedAt: string;
  details: HealthRecordDetails;
};

const labels = {
  symptom: { en: ["Onset date", "Symptom name"], zh: ["出现日期", "症状名称"] },
  medication: { en: ["Medication start date", "Medication name"], zh: ["用药开始日期", "药物名称"] },
  visit: { en: ["Visit date", "Visit title"], zh: ["就诊日期", "就诊标题"] },
  test: { en: ["Test date", "Test name"], zh: ["检查日期", "检查项目"] },
  condition: { en: ["Date first noticed", "Condition name"], zh: ["发现日期", "状况名称"] },
  treatment: { en: ["Treatment date", "Treatment name"], zh: ["治疗日期", "治疗名称"] },
  measurement: { en: ["Measurement date", "Measurement name"], zh: ["测量日期", "测量项目"] },
  note: { en: ["Date", "Title"], zh: ["日期", "标题"] },
};

const suggestedKeys = new Set(["severity", "provider", "frequency", "unit", "source"]);

function emptyDraft(initialDate?: string): Draft {
  return { type: "note", title: "", summary: "", occurredAt: initialDate ?? currentLocalDate(), status: "resolved", startedAt: "", endedAt: "", details: {} };
}

function draftFromRecord(record: HealthRecord): Draft {
  return {
    type: record.type, title: record.title, summary: record.summary, status: record.status, details: record.details,
    occurredAt: compactDateTimeValue(record.occurredAt, record.occurredHasExplicitTime),
    startedAt: compactDateTimeValue(record.startedAt, record.startedHasExplicitTime),
    endedAt: compactDateTimeValue(record.endedAt, record.endedHasExplicitTime),
  };
}

export function HealthRecordEditor({ editing, initialDate, onCancel, onSaved, formId, onSavingChange }: { editing?: HealthRecord; initialDate?: string; onCancel: () => void; onSaved: (record: HealthRecord) => void | Promise<void>; formId?: string; onSavingChange?: (saving: boolean) => void }) {
  const preview = useFormPreview();
  const { read } = useHealthData();
  const { english } = useLocale();
  const [draft, setDraft] = useState<Draft>(() => editing ? draftFromRecord(editing) : emptyDraft(initialDate));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const history = useFormHistory(`/api/health/records?type=${draft.type}&limit=100`, undefined, read);

  const usesStatus = healthRecordUsesStatus(draft.type);
  const showStart = draft.type === "condition" || Boolean(editing?.startedAt);
  const showEnd = Boolean(editing?.endedAt) || (usesStatus && draft.type !== "condition" && draft.status === "resolved");
  const [dateLabel, titleLabel] = labels[draft.type][english ? "en" : "zh"];
  const typeLabel = english ? "Record type" : "记录类型";
  const typeLabels = english ? healthRecordTypeLabels : healthRecordTypeLabelsZh;
  const statusLabels = english ? healthRecordStatusLabels : healthRecordStatusLabelsZh;
  const optional = english ? "(optional)" : "（可选）";
  const heading = editing ? (english ? "Edit health record" : "编辑健康记录") : (english ? "Add health record" : "新增健康记录");
  const failed = english ? "Could not save this record" : "无法保存这条记录";

  function setField<Key extends keyof Draft>(key: Key, value: Draft[Key]) {
    setDraft(current => ({ ...current, [key]: value }));
  }

  function selectType(type: HealthRecordType) {
    setDraft(current => current.type === type ? current : {
      ...current, type, status: healthRecordUsesStatus(type) ? "active" : "resolved",
      details: editing?.type === type ? editing.details : {},
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (preview) return;
    setError("");
    setSaving(true);
    onSavingChange?.(true);
    try {
      const occurred = compactDateTimePayload(draft.occurredAt);
      const started = draft.startedAt ? compactDateTimePayload(draft.startedAt) : null;
      const endValue = showEnd ? draft.endedAt : "";
      const ended = endValue ? compactDateTimePayload(endValue) : null;
      if (!editing && endValue && endValue < draft.occurredAt.slice(0, endValue.length)) {
        setError(english ? "The end cannot be before the start." : "结束日期或时间不能早于开始。");
        return;
      }
      const details = Object.fromEntries(Object.entries(draft.details).filter(([, value]) => value !== "" && value !== undefined));
      const body = {
        type: draft.type, title: draft.title, summary: draft.summary, status: draft.status,
        occurredAt: occurred.value, occurredHasExplicitTime: occurred.hasExplicitTime,
        startedAt: started?.value ?? null, startedHasExplicitTime: started?.hasExplicitTime ?? false,
        endedAt: ended?.value ?? null, endedHasExplicitTime: ended?.hasExplicitTime ?? false,
        details,
      };
      const response = await read(editing ? `/api/health/records/${editing.id}` : "/api/health/records", {
        method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result) {
        setError(apiErrorMessage(result, failed));
        return;
      }
      await onSaved(result as HealthRecord);
    } catch {
      setError(failed);
    } finally {
      setSaving(false);
      onSavingChange?.(false);
    }
  }

  return <form id={formId} className={`editor-card field-focus-surface ${styles.editor}`} onSubmit={submit}>
    {preview && <FormPreviewNotice />}
    <div className="editor-title">
      <h2>{heading}</h2>
      <button type="button" className="text-button" onClick={onCancel}>{english ? "Cancel" : "取消"}</button>
    </div>
    <HealthDateTime label={editing ? (english ? "Record date" : "记录日期") : dateLabel}
      timeLabel={english ? "Time" : "时间"} value={draft.occurredAt} onChange={value => setField("occurredAt", value)} />
    <div className={`field ${styles.editorType}`}>
      <span>{typeLabel}</span>
      <SearchableSelect label={typeLabel} value={draft.type} onValueChange={value => selectType(value as HealthRecordType)}
        options={healthRecordTypes.map(item => ({ value: item.value, label: typeLabels[item.value] }))} searchable={false} presentation="capsules" />
    </div>
    <div className="field">
      <span>{titleLabel}</span>
      <SuggestedInput suggestionLabel={titleLabel} suggestions={["symptom", "condition", "medication"].includes(draft.type) ? historyValues(history, "title") : []}
        required maxLength={200} value={draft.title} onValueChange={value => setField("title", value)} />
    </div>
    <div className={styles.editorDetails} data-count={detailFields[draft.type].length}>
      {detailFields[draft.type].map(field => {
        const label = english ? field.label : field.zh;
        return <div className="field" key={field.key}>
          <span>{label} <small>{optional}</small></span>
          <SuggestedInput suggestionLabel={label} suggestions={suggestedKeys.has(field.key)
            ? [...historyValues(history, `details.${field.key}`), ...(field.key === "severity" ? (english ? ["Mild", "Moderate", "Severe"] : ["轻度", "中度", "重度"]) : [])] : []}
            value={String(draft.details[field.key] ?? "")} placeholder={field.placeholder}
            onValueChange={value => setDraft(current => ({ ...current, details: { ...current.details, [field.key]: value } }))} />
        </div>;
      })}
    </div>
    {usesStatus && <label className="field">
      <span>{english ? "Status" : "状态"}</span>
      <ChoiceSelect value={draft.status} onChange={event => setField("status", event.target.value as HealthRecordStatus)}>
        {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </ChoiceSelect>
    </label>}
    {showStart && <HealthDateTime label={english ? "Start date" : "开始日期"} timeLabel={english ? "Start time" : "开始时间"}
      value={draft.startedAt} onChange={value => setField("startedAt", value)} optionalDate />}
    {showEnd && <HealthDateTime label={english ? "End date" : "结束日期"} timeLabel={english ? "End time" : "结束时间"}
      value={draft.endedAt} onChange={value => setField("endedAt", value)} optionalDate />}
    <label className="field">
      <span>{draft.type === "note" ? (english ? "Note" : "正文") : (english ? "Summary" : "摘要")} <small>{optional}</small></span>
      <textarea rows={3} maxLength={5000} value={draft.summary} onChange={event => setField("summary", event.target.value)} />
    </label>
    {error && <ErrorNotice>{error}</ErrorNotice>}
    <div className="health-editor-actions">
      <button type="button" className="button secondary" onClick={onCancel}>{english ? "Cancel" : "取消"}</button>
      <button className="button primary" disabled={saving || preview}>{saving ? (english ? "Saving…" : "保存中…") : (english ? "Save" : "保存")}</button>
    </div>
  </form>;
}

function HealthDateTime({ label, timeLabel, value, onChange, optionalDate = false }: {
  label: string; timeLabel: string; value: string; onChange: (value: string) => void; optionalDate?: boolean;
}) {
  const date = value.slice(0, 10);
  const time = value.slice(11, 16);
  return <DateTimeField label={label} timeLabel={timeLabel} optionalDate={optionalDate} value={{ date, time }}
    onChange={next => onChange(next.time ? `${next.date}T${next.time}` : next.date)} />;
}
