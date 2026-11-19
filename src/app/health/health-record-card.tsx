"use client";
import {HealthLink as Link} from "@/components/health-data-context";
import { ChevronRight } from "reicon-react";
import { useLocale } from "@/components/locale-controller";
import { dateInEvaOrbit, EVAORBIT_TIME_ZONE } from "@/lib/time";
import type { HealthRecord } from "@/lib/types";
import { healthRecordTypeLabels, healthRecordUsesStatus, recordSummary } from "./health-record-utils";
import styles from "./health-records.module.css";

const chineseTypes = { symptom: "症状", medication: "用药", visit: "就诊", test: "检查", condition: "健康状况", treatment: "治疗", measurement: "测量", note: "笔记" };
export const recordStatusLabels = {
  active: { en: "Active", zh: "进行中" },
  resolved: { en: "Resolved", zh: "已结束" },
};

export function HealthRecordList({ records }: { records: HealthRecord[] }) {
  const { english } = useLocale();
  const locale = english ? "en-US" : "zh-CN";
  const month = new Intl.DateTimeFormat(locale, { timeZone: EVAORBIT_TIME_ZONE, year: "numeric", month: "long" });
  const day = new Intl.DateTimeFormat(locale, { timeZone: EVAORBIT_TIME_ZONE, month: "short", day: "numeric" });
  const clock = new Intl.DateTimeFormat(locale, { timeZone: EVAORBIT_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const groups = new Map<string, HealthRecord[]>();
  for (const record of records) {
    const key = dateInEvaOrbit(new Date(record.occurredAt)).slice(0, 7);
    const group = groups.get(key);
    if (group) group.push(record);
    else groups.set(key, [record]);
  }

  return <div className={styles.timeline}>
    {[...groups].map(([key, group]) => <section key={key} aria-labelledby={`health-records-${key}`}>
      <h2 id={`health-records-${key}`} className={styles.month}>{month.format(new Date(group[0].occurredAt))}</h2>
      <ul className={styles.rows}>
        {group.map(record => {
          const date = new Date(record.occurredAt);
          const summary = recordSummary(record);
          return <li key={record.id}>
            <Link className={styles.record} href={`/health/records/${record.id}`}>
              <div className={styles.date}>
                <span>{day.format(date)}</span>
                {record.occurredHasExplicitTime && <time dateTime={record.occurredAt}>{clock.format(date)}</time>}
              </div>
              <div className={styles.copy}>
                <h3 className="user-content">{record.title}</h3>
                <div className={styles.meta}>
                  <span>{english ? healthRecordTypeLabels[record.type] : chineseTypes[record.type]}</span>
                  {healthRecordUsesStatus(record.type) && <span className={styles.status} data-status={record.status}>{recordStatusLabels[record.status][english ? "en" : "zh"]}</span>}
                </div>
                {summary && <p className="user-content">{summary}</p>}
              </div>
              <ChevronRight className="icon" aria-hidden="true" />
            </Link>
          </li>;
        })}
      </ul>
    </section>)}
  </div>;
}
