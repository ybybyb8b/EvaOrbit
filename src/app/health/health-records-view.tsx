"use client";
import { useRememberedState } from "@/components/use-remembered-state";
import { useServerDataState, useDataRefresh } from "@/components/use-data-refresh";
import { PageLogAction } from "@/components/bottom-log";
import { ToastNotice } from "@/components/action-toast";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { FormSheet } from "@/components/form-sheet";
import { PageHeader } from "@/components/page-header";
import type { HealthRecord, HealthRecordStatus } from "@/lib/types";
import { HealthRecordEditor } from "./health-record-editor";
import { HealthRecordList } from "./health-record-card";

export function HealthRecordsView({ initial }: { initial: HealthRecord[] }) {
  const [filter, setFilter] = useRememberedState<"" | HealthRecordStatus>("HealthRecordsView:filter", "");
  const [records, setRecords] = useServerDataState(initial, !filter);
  const [editing, setEditing] = useState<HealthRecord | undefined>();
  const [editorOpen, setEditorOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (requestedFilter: "" | HealthRecordStatus = filter) => {
    const response = await fetch(`/api/health/records?limit=100${requestedFilter ? `&status=${requestedFilter}` : ""}`);
    if (response.ok) setRecords(await response.json());
  }, [filter, setRecords]);
  useDataRefresh("/health", () => load());
  useEffect(() => { void load(); }, [load]);


  function selectFilter(nextFilter: "" | HealthRecordStatus) {
    setFilter(nextFilter);
  }

  function openCreate() { setEditing(undefined); setEditorOpen(true); setError(""); setMessage(""); }
  function closeEditor() { setEditorOpen(false); setEditing(undefined); }

  return <div className="page health-page health-records-page">
    <PageHeader eyebrow="健康" title="Records" action={<PageLogAction label="新增健康记录" className="button primary" onClick={openCreate}><Icon name="plus" />新增记录</PageLogAction>} />
    {message && <ToastNotice message={message} onShown={() => setMessage("")} />}
    {error && <p className="form-error">{error}</p>}
    {editorOpen && <FormSheet title={editing ? "Edit health record" : "Add health record"} onClose={closeEditor} formId="health-records-form" submitLabel={editing ? "Save changes" : "Add record"} busy={saving}><HealthRecordEditor formId="health-records-form" editing={editing} onSavingChange={setSaving} onCancel={closeEditor} onSaved={(record) => { closeEditor(); setMessage("Health record saved"); setRecords((current) => [record, ...current.filter((item) => item.id !== record.id)]); void load(); }} /></FormSheet>}
    <div className="health-record-filters" aria-label="Filter health records"><button className={!filter ? "active" : ""} onClick={() => selectFilter("")}>All</button><button className={filter === "active" ? "active" : ""} onClick={() => selectFilter("active")}>Active</button><button className={filter === "resolved" ? "active" : ""} onClick={() => selectFilter("resolved")}>Resolved</button></div>
    <section className="health-history-section"><HealthRecordList records={records} /></section>
  </div>;
}
