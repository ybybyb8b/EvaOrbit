"use client";

import { Icon } from "@/components/icons";
import { useLocale } from "@/components/locale-controller";
import { MemoLink } from "@/components/memo-data-context";
import { echoTimestamp, type EchoEntry } from "./echo-records";
import styles from "./echo.module.css";

export function GraphIcon() {
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="m10.5 7.5-5 8m8-8 5 8M8 18h8" /><circle cx="12" cy="5" r="2.7" /><circle cx="5" cy="18" r="2.7" /><circle cx="19" cy="18" r="2.7" />
  </svg>;
}

export function EchoEntries({ entries }: { entries: EchoEntry[] }) {
  const { english } = useLocale();
  return <div className={styles.list}>{entries.map(entry => {
    const type = entry.kind === "memo" ? english ? "Memo" : "碎片" : "Fact";
    const updated = echoTimestamp(entry.updatedAt);
    return <MemoLink className={`${styles.row} ${styles.memoryRow}`} href={entry.href} key={entry.href}>
      <span className={styles.memoryIcon} aria-hidden="true">{entry.kind === "memo" ? <Icon name="memory" variant="stroke" /> : <GraphIcon />}</span>
      <span className={styles.memoryCopy}>
        <span className={styles.rowTop}><strong>{entry.title}</strong><small className={styles.badge}>{type}</small></span>
        {entry.excerpt && <span className={styles.excerpt}>{entry.excerpt}</span>}
        <span className={styles.rowBottom}><time dateTime={updated.toISOString()}>{updated.toLocaleDateString(english ? "en-GB" : "zh-CN", { timeZone: "Asia/Shanghai" })}</time></span>
      </span>
    </MemoLink>;
  })}</div>;
}
