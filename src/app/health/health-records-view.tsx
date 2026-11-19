"use client";
import { useFormPreview } from "@/components/form-preview";
import { useHealthData } from "@/components/health-data-context";
import { ErrorNotice } from "@/components/error-notice";
import { useLocale } from "@/components/locale-controller";
import { useRememberedState } from "@/components/use-remembered-state";
import { useServerDataState, useDataRefresh } from "@/components/use-data-refresh";
import { PageLogAction } from "@/components/bottom-log-core";
import { ToastNotice } from "@/components/action-toast";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { FormSheet } from "@/components/form-sheet";
import { PageHeading as PageHeader } from "@/components/page-heading";
import type { HealthRecord, HealthRecordStatus } from "@/lib/types";
import { HealthRecordEditor } from "./health-record-editor";
import { HealthRecordList, recordStatusLabels } from "./health-record-card";
import styles from "./health-records.module.css";

type Filter = "" | HealthRecordStatus;
const filters = ["", "active", "resolved"] as const;

export function HealthRecordsView({ initial }: { initial: HealthRecord[] }) {
  const preview = useFormPreview();
  const { read } = useHealthData();
  const { english } = useLocale();
  const [filter, setFilter] = useRememberedState<Filter>("HealthRecordsView:filter", "");
  const [allRecords, setAllRecords] = useServerDataState(initial);
  const [filtered, setFiltered] = useState<{ filter: HealthRecordStatus; records: HealthRecord[] }>();
  const [failedFilter, setFailedFilter] = useState<Filter | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const requestId = useRef(0);
  const records = !filter ? allRecords : filtered?.filter === filter ? filtered.records : undefined;
  const closeEditor = () => setEditorOpen(false);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const response = await read(`/api/health/records?limit=100${filter ? `&status=${filter}` : ""}`);
      if (!response.ok) throw new Error();
      const next: HealthRecord[] = await response.json();
      if (id !== requestId.current) return;
      if (filter) setFiltered({ filter, records: next });
      else setAllRecords(next);
      setFailedFilter(null);
    } catch {
      if (id === requestId.current) setFailedFilter(filter);
    }
  }, [filter, read, setAllRecords]);

  useDataRefresh("/health", load);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void load(); });
    return () => {
      active = false;
      requestId.current += 1;
    };
  }, [load]);

  function onSaved(record: HealthRecord) {
    function withRecord(current: HealthRecord[]) {
      return [record, ...current.filter(item => item.id !== record.id)]
        .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || b.id - a.id)
        .slice(0, 100);
    }
    closeEditor();
    setMessage(english ? "Health record saved" : "健康记录已保存");
    setAllRecords(withRecord);
    setFiltered(current => current?.filter === record.status
      ? { ...current, records: withRecord(current.records) }
      : current);
    void load();
  }

  const addLabel = english ? "Add record" : "新增记录";
  return <div className={`page health-page health-records-page ${styles.page}`}>
    <PageHeader eyebrow="" title={english ? "Health records" : "健康记录"} action={
      <PageLogAction label={english ? "Add health record" : "新增健康记录"} onClick={() => setEditorOpen(true)}>
        <Icon name="plus" />{addLabel}
      </PageLogAction>
    } />
    {message && <ToastNotice message={message} onShown={() => setMessage("")} />}
    {editorOpen && <FormSheet title={english ? "Add health record" : "新增健康记录"} onClose={closeEditor} formId="health-records-form" submitLabel={addLabel} busy={saving} submitDisabled={preview}>
      <HealthRecordEditor formId="health-records-form" onSavingChange={setSaving} onCancel={closeEditor} onSaved={onSaved} />
    </FormSheet>}
    <div className={`health-record-filters ${styles.filters}`} role="group" aria-label={english ? "Filter by status" : "按状态筛选"}>
      {filters.map(value => <button key={value} type="button" className={filter === value ? "active" : ""} aria-pressed={filter === value} onClick={() => setFilter(value)}>
        {value ? recordStatusLabels[value][english ? "en" : "zh"] : english ? "All" : "全部"}
      </button>)}
    </div>
    {failedFilter === filter && <div className={styles.state}>
      <ErrorNotice>{english ? "Could not refresh health records." : "健康记录刷新失败。"}</ErrorNotice>
      <button className="text-button" type="button" onClick={() => void load()}>{english ? "Try again" : "重试"}</button>
    </div>}
    {records?.length ? <HealthRecordList records={records} /> : failedFilter !== filter && <div className={styles.state} role="status">
      <p>{!records ? (english ? "Loading records…" : "正在加载记录…")
        : filter ? (english ? "No records match this status." : "暂无此状态的记录。")
          : (english ? "No health records yet." : "暂无健康记录。")}</p>
      {records && filter && <button className="text-button" type="button" onClick={() => setFilter("")}>{english ? "Show all records" : "查看全部记录"}</button>}
    </div>}
  </div>;
}
