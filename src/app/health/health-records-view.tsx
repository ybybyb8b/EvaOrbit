"use client";

import { useCallback, useState } from "react";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import type { HealthRecord, HealthRecordStatus } from "@/lib/types";
import { HealthRecordEditor } from "./health-record-editor";
import { HealthRecordList } from "./health-record-card";

export function HealthRecordsView({ initial }: { initial: HealthRecord[] }) {
  const [records, setRecords] = useState(initial);
  const [filter, setFilter] = useState<"" | HealthRecordStatus>("");
  const [editing, setEditing] = useState<HealthRecord | undefined>();
  const [editorOpen, setEditorOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async (requestedFilter: "" | HealthRecordStatus = filter) => {
    const response = await fetch(`/api/health/records?limit=100${requestedFilter ? `&status=${requestedFilter}` : ""}`);
    if (response.ok) setRecords(await response.json());
  }, [filter]);

  function selectFilter(nextFilter: "" | HealthRecordStatus) {
    setFilter(nextFilter);
    void load(nextFilter);
  }

  function openCreate() { setEditing(undefined); setEditorOpen(true); setError(""); setMessage(""); }
  function closeEditor() { setEditorOpen(false); setEditing(undefined); }

  return <div className="page health-page health-records-page">
    <PageHeader eyebrow="HEALTH" title="Records" description="A chronological place for the context worth keeping" action={<button className="button primary" onClick={openCreate}><Icon name="plus" />New record</button>} />
    {message && <p className="success-banner" role="status">{message}</p>}
    {error && <p className="form-error">{error}</p>}
    {editorOpen && <HealthRecordEditor editing={editing} onCancel={closeEditor} onSaved={(record) => { closeEditor(); setMessage("Health record saved"); setRecords((current) => [record, ...current.filter((item) => item.id !== record.id)]); void load(); }} />}
    <div className="health-record-filters" aria-label="Filter health records"><button className={!filter ? "active" : ""} onClick={() => selectFilter("")}>All</button><button className={filter === "active" ? "active" : ""} onClick={() => selectFilter("active")}>Active</button><button className={filter === "resolved" ? "active" : ""} onClick={() => selectFilter("resolved")}>Resolved</button></div>
    <section className="health-history-section"><HealthRecordList records={records} /></section>
  </div>;
}
