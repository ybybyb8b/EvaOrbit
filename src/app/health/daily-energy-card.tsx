"use client";
import { ErrorNotice } from "@/components/error-notice";
import { PageLoading } from "@/components/page-loading";
import { useServerDataState } from "@/components/use-data-refresh";
import { ToastNotice } from "@/components/action-toast";

import { useRef, useState } from "react";
import { useBottomLogAction } from "@/components/bottom-log";
import { Icon } from "@/components/icons";
import { useLocale } from "@/components/locale-controller";
import { translateUiCopy } from "@/lib/ui-copy";
import { dateInEvaOrbit } from "@/lib/time";
import type { DailyNutritionSummary } from "@/lib/types";

type EnergyDraft = {
  date: string;
  restingEnergyKcal: string;
  activeEnergyKcal: string;
  notes: string;
};

function draftFromSummary(summary: DailyNutritionSummary): EnergyDraft {
  const resting = summary.manualRestingEnergyKcal === undefined ? summary.restingEnergyKcal : summary.manualRestingEnergyKcal;
  const active = summary.manualActiveEnergyKcal === undefined ? summary.activeEnergyKcal : summary.manualActiveEnergyKcal;
  return {
    date: summary.date,
    restingEnergyKcal: resting === null ? "" : String(resting),
    activeEnergyKcal: active === null ? "" : String(active),
    notes: summary.notes,
  };
}

function formatKcalNumber(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatKcal(value: number | null, english: boolean) {
  return value === null ? english ? "Not recorded" : "未记录" : `${formatKcalNumber(value)} kcal`;
}

function shortDate(value: string, english: boolean) {
  return new Intl.DateTimeFormat(english ? "en" : "zh-CN", { month: "short", day: "2-digit" }).format(new Date(`${value}T12:00:00`));
}

function energySourceLabel(summary: DailyNutritionSummary, english: boolean) {
  const resting = english ? "resting" : "静息", active = english ? "active" : "活动";
  const apple = [summary.restingEnergySource === "apple_health" ? resting : null, summary.activeEnergySource === "apple_health" ? active : null].filter(Boolean);
  const manual = [summary.restingEnergySource === "manual" ? resting : null, summary.activeEnergySource === "manual" ? active : null].filter(Boolean);
  const appleLabel = english ? "Apple Health" : "Apple 健康";
  if (apple.length === 2 && !manual.length) return appleLabel;
  if (manual.length === 2 && !apple.length) return english ? "Manual overrides" : "手动覆盖";
  return [apple.length ? `${appleLabel} (${apple.join(" + ")})` : null, manual.length ? `${english ? "Manual" : "手动"} (${manual.join(" + ")})` : null].filter(Boolean).join(" · ");
}

function PrimaryEnergyMetric({ label, value, english }: { label: string; value: number | null; english: boolean }) {
  return <div className={`daily-energy-primary-metric${value === null ? " missing" : ""}`}>
    <strong>{value === null ? english ? "Not recorded" : "未记录" : formatKcalNumber(value)}</strong>
    {value !== null && <span>kcal</span>}
    <small>{label}</small>
  </div>;
}

function parseEnergy(value: string) {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function getError(result: unknown, fallback: string, english: boolean) {
  return result && typeof result === "object" && "error" in result && typeof result.error === "string" ? translateUiCopy(result.error, english ? "en" : "zh-CN") : fallback;
}

export function DailyEnergyCard({ initial, initialHistory }: { initial: DailyNutritionSummary; initialHistory: DailyNutritionSummary[] }) {
  const { english } = useLocale();
  const t = (en: string, zh: string) => english ? en : zh;
  const [selectedDate, setSelectedDate] = useState(initial.date);
  const [summary, setSummary] = useServerDataState(initial, selectedDate === initial.date);
  const [history, setHistory] = useServerDataState(initialHistory);
  const [draft, setDraft] = useState(() => draftFromSummary(initial));
  const [editing, setEditing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const editorRef = useRef<HTMLFormElement>(null);
  useBottomLogAction({ label: t("Log energy", "记录能量"), onClick: openEditor, disabled: loading || saving || editing });

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
        setError(getError(result, t("Could not load daily energy", "能量数据加载失败，请重试。"), english));
        return;
      }
      setSummary(result as DailyNutritionSummary);
      setDraft(draftFromSummary(result as DailyNutritionSummary));
    } catch {
      setError(t("Could not load daily energy", "能量数据加载失败，请重试。"));
    } finally {
      setLoading(false);
    }
  }

  function openEditor() {
    setDraft(draftFromSummary(summary));
    setEditing(true);
    setMessage("");
    setError("");
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ block: "center" }));
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
      setError(t("Enter valid energy values or leave them blank", "请输入有效的能量数值，或留空。"));
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) {
      setError(t("Enter a valid date", "请输入有效日期。"));
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
        setError(getError(result, t("Could not save daily energy", "能量数据保存失败，请检查填写内容后重试。"), english));
        return;
      }
      const next = result as DailyNutritionSummary;
      setSummary(next);
      setSelectedDate(next.date);
      setDraft(draftFromSummary(next));
      setEditing(false);
      setMessage(t("Energy review saved", "能量数据已保存"));
      setHistory((current) => {
        const withoutDate = current.filter((item) => item.date !== next.date);
        const hasSavedEnergy = next.restingEnergyKcal !== null || next.activeEnergyKcal !== null;
        if (!hasSavedEnergy) return withoutDate;
        return [next, ...withoutDate].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 90);
      });
      setHistoryOpen(true);
    } catch {
      setError(t("Could not save daily energy", "能量数据保存失败，请重试。"));
    } finally {
      setSaving(false);
    }
  }

  const today = dateInEvaOrbit();
  const isToday = selectedDate === today;
  const sourceLabel = energySourceLabel(summary, english);

  return <section className="daily-energy-card health-section health-energy-section" aria-labelledby="daily-energy-title">
    <div className="daily-energy-heading">
      <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "8px 14px" }}><h2 id="daily-energy-title">{t("Calorie balance", "能量收支")}</h2><small style={{ color: "var(--text-secondary)" }}>{isToday ? t("Today in progress", "截至目前") : shortDate(selectedDate, english)}</small></div>
      {!editing && <button className="text-button daily-energy-edit page-log-action" onClick={openEditor}>{t("Edit", "编辑")}</button>}
    </div>
    <div className="daily-energy-primary">
      <PrimaryEnergyMetric label={t("Intake", "摄入")} value={summary.estimatedIntakeKcal} english={english} />
      <PrimaryEnergyMetric label={t("Expenditure", "消耗")} value={summary.totalExpenditureKcal} english={english} />
      <PrimaryEnergyMetric label={t("Balance", "差额")} value={summary.energyBalance} english={english} />
    </div>
    <div className="daily-energy-breakdown">
      <p><span>{t("Resting", "静息")} <strong>{formatKcal(summary.restingEnergyKcal, english)}</strong></span><i aria-hidden="true">·</i><span>{t("Active", "活动")} <strong>{formatKcal(summary.activeEnergyKcal, english)}</strong></span></p>
      {sourceLabel && <small>{sourceLabel}</small>}
    </div>
    {loading && <span className="daily-energy-loading"><PageLoading title="能量" englishTitle="energy" compact /></span>}
    {editing && <form ref={editorRef} className="daily-energy-editor" onSubmit={(event) => void save(event)}>
      <div className="daily-energy-input-grid">
        <label className="field wide"><span>{t("Date", "日期")}</span><input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label>
        <label className="field"><span>{t("Resting kcal", "静息能量（kcal）")} <small>{t("(optional)", "（选填）")}</small></span><input type="number" min="0" max="20000" step="1" value={draft.restingEnergyKcal} onChange={(event) => setDraft({ ...draft, restingEnergyKcal: event.target.value })} placeholder={t("e.g. 1500", "例如 1500")} /></label>
        <label className="field"><span>{t("Active kcal", "活动能量（kcal）")} <small>{t("(optional)", "（选填）")}</small></span><input type="number" min="0" max="20000" step="1" value={draft.activeEnergyKcal} onChange={(event) => setDraft({ ...draft, activeEnergyKcal: event.target.value })} placeholder={t("e.g. 300", "例如 300")} /></label>
        <label className="field wide"><span>{t("Note", "备注")} <small>{t("(optional)", "（选填）")}</small></span><textarea rows={2} maxLength={2000} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder={t("What informed this estimate?", "记录估算依据")} /></label>
      </div>
      <div className="daily-energy-editor-actions"><button type="button" className="button secondary" onClick={closeEditor}>{t("Cancel", "取消")}</button><button className="button primary" disabled={saving}>{saving ? t("Saving…", "保存中…") : t("Save energy", "保存能量")}</button></div>
    </form>}
    {!editing && summary.notes && <p className="daily-energy-note">{summary.notes}</p>}
    {error && <ErrorNotice>{error}</ErrorNotice>}
    {message && <ToastNotice message={message} onShown={() => setMessage("")} />}
    <div className="daily-energy-history-heading"><span>{t("Energy history", "能量历史")}</span><button className="text-button" onClick={() => setHistoryOpen((open) => !open)}>{historyOpen ? t("Hide history", "收起历史") : t("View history", "查看历史")}<Icon name="arrow" /></button></div>
    {historyOpen && (history.length ? <div className="daily-energy-history">{history.slice(0, 7).map((item) => <button key={item.date} className={item.date === selectedDate ? "active" : ""} onClick={() => void loadDate(item.date)}><span>{item.date}</span><strong>{formatKcal(item.totalExpenditureKcal, english)}</strong><small>{t("Balance", "差额")} {formatKcal(item.energyBalance, english)}</small></button>)}</div> : <p className="daily-energy-history-empty">{t("Save resting or active energy to build a history.", "保存静息或活动能量后即可查看历史。")}</p>)}
  </section>;
}
