import type { ReactNode } from "react";
import styles from "./journal-reading.module.css";

type DatedEntry = { id: number; date: string };

export function JournalArchive<T extends DatedEntry>({ entries, english, renderEntry, className = "", busy }: {
  entries: T[];
  english: boolean;
  renderEntry: (entry: T) => ReactNode;
  className?: string;
  busy?: boolean;
}) {
  const months = new Map<string, Map<string, T[]>>();
  for (const entry of [...entries].sort((a, b) => b.date.localeCompare(a.date))) {
    const month = entry.date.slice(0, 7);
    let days = months.get(month);
    if (!days) {
      days = new Map();
      months.set(month, days);
    }
    const day = days.get(entry.date);
    if (day) day.push(entry);
    else days.set(entry.date, [entry]);
  }

  const locale = english ? "en-US" : "zh-CN";
  const monthLabel = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" });
  const dateLabel = new Intl.DateTimeFormat(locale, { dateStyle: "full" });
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" });
  return <div className={`${styles.archive} ${className}`} aria-busy={busy}>
    {[...months].map(([month, days]) => <section key={month} className={styles.month}>
      <h2>{monthLabel.format(new Date(`${month}-01T12:00:00`))}</h2>
      <ul className={styles.days} role="list">
        {[...days].map(([date, items]) => {
          const day = new Date(`${date}T12:00:00`);
          return <li key={date} className={styles.day}>
            <time className={styles.date} dateTime={date}>
              <span className="sr-only">{dateLabel.format(day)}</span>
              <strong aria-hidden="true">{day.getDate()}</strong>
              <small aria-hidden="true">{weekday.format(day)}</small>
            </time>
            <ul className={styles.entries} role="list">
              {items.map(entry => <li key={entry.id}>{renderEntry(entry)}</li>)}
            </ul>
          </li>;
        })}
      </ul>
    </section>)}
  </div>;
}
