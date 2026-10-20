"use client";
import {useFormPreview} from "@/components/form-preview";
import {useHealthData} from "@/components/health-data-context";
import { ErrorNotice } from "@/components/error-notice";
import { useRememberedState } from "@/components/use-remembered-state";
import { useServerDataState, useDataRefresh } from "@/components/use-data-refresh";
import { PageLogAction } from "@/components/bottom-log-core";
import { ToastNotice } from "@/components/action-toast";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { FormSheet } from "@/components/form-sheet";
import { PageHeading as PageHeader } from "@/components/page-heading";
import type { HealthRecord, HealthRecordStatus } from "@/lib/types";
import { HealthRecordEditor } from "./health-record-editor";
import { HealthRecordList } from "./health-record-card";

export function HealthRecordsView({ initial }: { initial: HealthRecord[] }) {
  const preview=useFormPreview();

  const {read}=useHealthData();

  const [filter, setFilter] = useRememberedState<"" | HealthRecordStatus>("HealthRecordsView:filter", "");
  const [records, setRecords] = useServerDataState(initial, !filter);
  const [editing, setEditing] = useState<HealthRecord | undefined>();
  const [editorOpen, setEditorOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (requestedFilter: "" | HealthRecordStatus = filter) => {
    const response = await read(`/api/health/records?limit=100${requestedFilter ? `&status=${requestedFilter}` : ""}`);
    if (response.ok) setRecords(await response.json());
  }, [filter, setRecords,read]);
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
    {error && <ErrorNotice>{error}</ErrorNotice>}
    {editorOpen && <FormSheet title={editing ? "Edit health record" : "Add health record"} onClose={closeEditor} formId="health-records-form" submitLabel={editing ? "Save changes" : "Add record"} busy={saving} submitDisabled={preview}><HealthRecordEditor formId="health-records-form" editing={editing} onSavingChange={setSaving} onCancel={closeEditor} onSaved={(record) => { closeEditor(); setMessage("Health record saved"); setRecords((current) => [record, ...current.filter((item) => item.id !== record.id)]); void load(); }} /></FormSheet>}
    <div className="health-record-filters" aria-label="Filter health records"><button className={!filter ? "active" : ""} onClick={() => selectFilter("")}>All</button><button className={filter === "active" ? "active" : ""} onClick={() => selectFilter("active")}>Active</button><button className={filter === "resolved" ? "active" : ""} onClick={() => selectFilter("resolved")}>Resolved</button></div>
    <section className="health-history-section"><HealthRecordList records={records} /></section>
  </div>;
}
