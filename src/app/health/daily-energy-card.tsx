"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { dateInEvaOrbit, shiftDate } from "@/lib/time";
import type { DailyNutritionSummary } from "@/lib/types";

type EnergyDraft = {
  date: string;
  restingEnergyKcal: string;
  activeEnergyKcal: string;
  notes: string;
};

function draftFromSummary(summary: DailyNutritionSummary): EnergyDraft {
  return {
    date: summary.date,
    restingEnergyKcal: summary.restingEnergyKcal === null ? "" : String(summary.restingEnergyKcal),
    activeEnergyKcal: summary.activeEnergyKcal === null ? "" : String(summary.activeEnergyKcal),
    notes: summary.notes,
  };
}

function formatKcal(value: number | null) {
  return value === null ? "Not recorded" : `${value.toLocaleString()} kcal`;
}

function parseEnergy(value: string) {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function getError(result: unknown, fallback: string) {
  return result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : fallback;
}

export function DailyEnergyCard({ initial, initialHistory }: { initial: DailyNutritionSummary; initialHistory: DailyNutritionSummary[] }) {
  const [summary, setSummary] = useState(initial);
  const [history, setHistory] = useState(initialHistory);
  const [selectedDate, setSelectedDate] = useState(initial.date);
  const [draft, setDraft] = useState(() => draftFromSummary(initial));
  const [editing, setEditing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadDate(date: string) {
    setSelectedDate(date);
    setEditing(false);
    setMessage("");
    setError("");
    const saved = history.find((item) => item.date === date);
    if (saved) {
      setSummary(saved);
      setDraft(draftFromSummary(saved));
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/nutrition/daily?date=${encodeURIComponent(date)}`);
      const result = await response.json().catch(() => null) as DailyNutritionSummary | { error?: string } | null;
      if (!response.ok) {
        setError(getError(result, "Could not load daily energy"));
        return;
      }
      setSummary(result as DailyNutritionSummary);
      setDraft(draftFromSummary(result as DailyNutritionSummary));
    } catch {
      setError("Could not load daily energy");
    } finally {
      setLoading(false);
    }
  }

  function openEditor() {
    setDraft(draftFromSummary(summary));
    setEditing(true);
    setMessage("");
    setError("");
  }

  function closeEditor() {
    setDraft(draftFromSummary(summary));
    setEditing(false);
    setError("");
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const restingEnergyKcal = parseEnergy(draft.restingEnergyKcal);
    const activeEnergyKcal = parseEnergy(draft.activeEnergyKcal);
    if (restingEnergyKcal === undefined || activeEnergyKcal === undefined) {
      setError("Enter valid energy values or leave them blank");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) {
      setError("Enter a valid date");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/nutrition/daily", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: draft.date, restingEnergyKcal, activeEnergyKcal, notes: draft.notes }),
      });
      const result = await response.json().catch(() => null) as DailyNutritionSummary | { error?: string } | null;
      if (!response.ok) {
        setError(getError(result, "Could not save daily energy"));
        return;
      }
      const next = result as DailyNutritionSummary;
      setSummary(next);
      setSelectedDate(next.date);
      setDraft(draftFromSummary(next));
      setEditing(false);
      setMessage("Energy review saved");
      setHistory((current) => {
        const withoutDate = current.filter((item) => item.date !== next.date);
        const hasSavedEnergy = next.restingEnergyKcal !== null || next.activeEnergyKcal !== null;
        if (!hasSavedEnergy) return withoutDate;
        return [next, ...withoutDate].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 90);
      });
      setHistoryOpen(true);
    } catch {
      setError("Could not save daily energy");
    } finally {
      setSaving(false);
    }
  }

  const metrics = [
    ["Intake", summary.estimatedIntakeKcal],
    ["Resting", summary.restingEnergyKcal],
    ["Active", summary.activeEnergyKcal],
    ["Total expenditure", summary.totalExpenditureKcal],
    ["Balance", summary.energyBalance],
  ] as const;
  const today = dateInEvaOrbit();
  const isToday = selectedDate === today;
  const isYesterday = selectedDate === shiftDate(today, -1);

  return <section className="daily-energy-card" aria-labelledby="daily-energy-title">
    <div className="daily-energy-heading">
      <div><span className="eyebrow">{isToday ? "TODAY · IN PROGRESS" : "ENERGY REVIEW"}</span><h2 id="daily-energy-title">{isYesterday ? "Yesterday" : selectedDate}</h2><p>{isToday ? "Today is still changing. This is not a completed review." : "Intake from Food + Drinks, with your saved resting and active energy."}</p></div>
      {!editing && <button className="button secondary" onClick={openEditor}><Icon name="edit" />Edit</button>}
    </div>
    <div className="daily-energy-date-row">
      <label className="daily-energy-date"><span>Date</span><input type="date" value={selectedDate} disabled={editing} onChange={(event) => void loadDate(event.target.value)} /></label>
      {loading && <span className="daily-energy-loading">Loading…</span>}
    </div>
    <div className="daily-energy-summary">{metrics.map(([label, value]) => <div className={`daily-energy-metric${value === null ? " missing" : ""}`} key={label}><span>{label}</span><strong>{formatKcal(value)}</strong></div>)}</div>
    {editing && <form className="daily-energy-editor" onSubmit={(event) => void save(event)}>
      <div className="daily-energy-input-grid">
        <label className="field"><span>Resting kcal <small>(optional)</small></span><input type="number" min="0" max="20000" step="1" value={draft.restingEnergyKcal} onChange={(event) => setDraft({ ...draft, restingEnergyKcal: event.target.value })} placeholder="e.g. 1500" /></label>
        <label className="field"><span>Active kcal <small>(optional)</small></span><input type="number" min="0" max="20000" step="1" value={draft.activeEnergyKcal} onChange={(event) => setDraft({ ...draft, activeEnergyKcal: event.target.value })} placeholder="e.g. 300" /></label>
        <label className="field wide"><span>Note <small>(optional)</small></span><textarea rows={2} maxLength={2000} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="What informed this estimate?" /></label>
      </div>
      <div className="daily-energy-editor-actions"><button type="button" className="button secondary" onClick={closeEditor}>Cancel</button><button className="button primary" disabled={saving}>{saving ? "Saving…" : "Save energy"}</button></div>
    </form>}
    {!editing && summary.notes && <p className="daily-energy-note">{summary.notes}</p>}
    {error && <p className="form-error">{error}</p>}
    {message && <p className="form-success" role="status">{message}</p>}
    <div className="daily-energy-history-heading"><span>Energy history</span><button className="text-button" onClick={() => setHistoryOpen((open) => !open)}>{historyOpen ? "Hide history" : "View history"}<Icon name="arrow" /></button></div>
    {historyOpen && (history.length ? <div className="daily-energy-history">{history.slice(0, 7).map((item) => <button key={item.date} className={item.date === selectedDate ? "active" : ""} onClick={() => void loadDate(item.date)}><span>{item.date}</span><strong>{formatKcal(item.totalExpenditureKcal)}</strong><small>Balance {formatKcal(item.energyBalance)}</small></button>)}</div> : <p className="daily-energy-history-empty">Save resting or active energy to build a history.</p>)}
  </section>;
}
