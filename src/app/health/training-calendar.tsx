"use client";

import { useMemo, useState } from "react";
import { useLocale } from "@/components/locale-controller";
import { dateInEvaOrbit } from "@/lib/time";
import type { TrainingLog, TrainingType } from "@/lib/types";

const typeLabels: Record<TrainingType, { zh: string; en: string }> = {
  cardio: { zh: "有氧", en: "Cardio" },
  strength: { zh: "无氧", en: "Strength" },
  mixed: { zh: "混合", en: "Mixed" },
};

function shiftMonth(month: string, offset: number) {
  const [year, value] = month.split("-").map(Number);
  return new Date(Date.UTC(year, value - 1 + offset, 1, 12)).toISOString().slice(0, 7);
}

function dateFor(month: string, day: number) {
  return `${month}-${String(day).padStart(2, "0")}`;
}

function defaultDate(month: string, logs: TrainingLog[]) {
  const today = dateInEvaOrbit();
  if (today.startsWith(month)) return today;
  return logs[0] ? dateInEvaOrbit(new Date(logs[0].occurredAt)) : `${month}-01`;
}

export function TrainingCalendar({ initialMonth, initialLogs }: { initialMonth: string; initialLogs: TrainingLog[] }) {
  const { english } = useLocale();
  const [month, setMonth] = useState(initialMonth);
  const [logs, setLogs] = useState(initialLogs);
  const [selected, setSelected] = useState(() => defaultDate(initialMonth, initialLogs));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const byDate = useMemo(() => {
    const map = new Map<string, TrainingLog[]>();
    for (const log of logs) {
      const date = dateInEvaOrbit(new Date(log.occurredAt));
      map.set(date, [...(map.get(date) ?? []), log]);
    }
    return map;
  }, [logs]);

  const [year, monthNumber] = month.split("-").map(Number);
  const leading = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7;
  const dayCount = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const selectedLogs = byDate.get(selected) ?? [];
  const weekdays = english ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] : ["一", "二", "三", "四", "五", "六", "日"];
  const monthLabel = new Intl.DateTimeFormat(english ? "en" : "zh-CN", { year: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));
  const duration = selectedLogs.reduce((sum, item) => sum + (item.durationMinutes ?? 0), 0);

  async function changeMonth(next: string) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/health/training?month=${next}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const nextLogs = await response.json() as TrainingLog[];
      setMonth(next);
      setLogs(nextLogs);
      setSelected(defaultDate(next, nextLogs));
    } catch {
      setError(english ? "Could not load training history" : "读取训练历史失败");
    } finally {
      setLoading(false);
    }
  }

  return <div className="training-history-inline">
    <section className="training-calendar">
      <header>
        <button type="button" aria-label={english ? "Previous month" : "上个月"} disabled={loading} onClick={() => void changeMonth(shiftMonth(month, -1))}>‹</button>
        <h3>{monthLabel}</h3>
        <button type="button" aria-label={english ? "Next month" : "下个月"} disabled={loading} onClick={() => void changeMonth(shiftMonth(month, 1))}>›</button>
      </header>
      {error && <p className="form-error">{error}</p>}
      <div className="training-calendar-grid">
        {weekdays.map((day) => <span className="training-weekday" key={day}>{day}</span>)}
        {Array.from({ length: leading }, (_, index) => <span className="training-calendar-blank" key={`blank-${index}`} />)}
        {Array.from({ length: dayCount }, (_, index) => {
          const day = index + 1;
          const date = dateFor(month, day);
          const items = byDate.get(date) ?? [];
          const minutes = items.reduce((sum, item) => sum + (item.durationMinutes ?? 0), 0);
          return <button type="button" key={date} data-has-record={items.length > 0} className={selected === date ? "selected" : ""} aria-pressed={selected === date} onClick={() => setSelected(date)}>
            <strong>{day}</strong>
            {items.length > 0 && <small>{items.length}{english ? "×" : "次"}{minutes > 0 ? ` · ${minutes}m` : ""}</small>}
          </button>;
        })}
      </div>
    </section>
    <section className="training-day-history">
      <header>
        <div><span>{new Intl.DateTimeFormat(english ? "en" : "zh-CN", { month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${selected}T12:00:00Z`))}</span><h3>{english ? "Training" : "训练"}</h3></div>
        {selectedLogs.length > 0 && <strong>{selectedLogs.length}{english ? " sessions" : " 次"}{duration > 0 ? ` · ${duration} min` : ""}</strong>}
      </header>
      {selectedLogs.length ? <div>{selectedLogs.map((log) => <article key={log.id}>
        <div><strong>{english ? typeLabels[log.trainingType].en : typeLabels[log.trainingType].zh}</strong><span>{log.bodyParts.join(" · ")}</span></div>
        <small>{[log.course, log.teacher, log.durationMinutes ? `${log.durationMinutes} min` : ""].filter(Boolean).join(" · ")}</small>
        {log.notes && <p className="user-content">{log.notes}</p>}
      </article>)}</div> : <p className="health-inline-empty">{english ? "No training logged" : "当天没有训练记录"}</p>}
    </section>
  </div>;
}
