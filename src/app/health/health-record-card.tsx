"use client";
import Link from "next/link";
import { useLocale } from "@/components/locale-controller";
import { translateUiCopy } from "@/lib/ui-copy";
import { Icon } from "@/components/icons";
import type { HealthRecord } from "@/lib/types";
import { formatRecordDate, formatRecordDateTime, healthRecordStatusLabels, healthRecordTypeLabels, healthRecordUsesStatus, recordSummary } from "./health-record-utils";

export function HealthRecordCard({ record }: { record: HealthRecord }) {
  const { language } = useLocale();
  const summary = recordSummary(record);
  return <Link className="health-record-card" href={`/health/records/${record.id}`}>
    <div className="health-record-date"><strong>{formatRecordDate(record.occurredAt)}</strong>{record.occurredHasExplicitTime && <small>{formatRecordDateTime(record.occurredAt).split(", ").at(-1)}</small>}</div>
    <div className="health-record-card-copy">
      <div className="health-record-card-meta"><span className="health-type-label">{translateUiCopy(healthRecordTypeLabels[record.type], language)}</span>{healthRecordUsesStatus(record.type) && <span className={`health-status-pill ${record.status}`}>{translateUiCopy(healthRecordStatusLabels[record.status], language)}</span>}</div>
      <h3>{record.title}</h3>
      {summary && <p>{summary}</p>}
    </div>
    <Icon name="arrow" />
  </Link>;
}

export function HealthRecordList({ records }: { records: HealthRecord[] }) {
  const { english } = useLocale();
  return records.length ? <div className="health-record-list">{records.map((record) => <HealthRecordCard key={record.id} record={record} />)}</div> : <div className="health-empty"><h2>{english ? "No health records yet" : "暂无健康记录"}</h2><p>{english ? "Use Log to add a health record." : "点击记录，添加一条健康记录。"}</p></div>;
}
