import Link from "next/link";
import { Icon } from "@/components/icons";
import type { HealthRecord } from "@/lib/types";
import { formatRecordDate, formatRecordDateTime, healthRecordStatusLabels, healthRecordTypeLabels, recordSummary } from "./health-record-utils";

export function HealthRecordCard({ record }: { record: HealthRecord }) {
  const summary = recordSummary(record);
  return <Link className="health-record-card" href={`/health/records/${record.id}`}>
    <div className="health-record-date"><strong>{formatRecordDate(record.occurredAt)}</strong><small>{record.occurredHasExplicitTime?formatRecordDateTime(record.occurredAt).split(", ").at(-1):"Date only"}</small></div>
    <div className="health-record-card-copy">
      <div className="health-record-card-meta"><span className="health-type-label">{healthRecordTypeLabels[record.type]}</span><span className={`health-status-pill ${record.status}`}>{healthRecordStatusLabels[record.status]}</span></div>
      <h3>{record.title}</h3>
      {summary && <p>{summary}</p>}
    </div>
    <Icon name="arrow" />
  </Link>;
}

export function HealthRecordList({ records }: { records: HealthRecord[] }) {
  return records.length ? <div className="health-record-list">{records.map((record) => <HealthRecordCard key={record.id} record={record} />)}</div> : <div className="health-empty"><span className="health-empty-icon"><Icon name="health" /></span><h2>No health records yet</h2><p>Keep the notes that will be useful to your future self.</p></div>;
}
