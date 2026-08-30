"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { FormSheet } from "@/components/form-sheet";
import { PageHeader } from "@/components/page-header";
import type { ApiError, DrinkLimitStatus, DrinkLog, DrinkType, EstimateConfidence, LimitPeriod } from "@/lib/types";

const types: [DrinkType, string][] = [
  ["coffee", "咖啡"], ["milk_tea", "奶茶"], ["tea", "茶"], ["soda", "汽水"],
  ["juice", "果汁"], ["water", "水"], ["alcohol", "酒"], ["other", "其他"],
];
const emptyDrink = { name: "", brand: "", drinkType: "other" as DrinkType, volumeMl: "", sugarLevel: "", estimatedKcal: "", kcalMin: "", kcalMax: "", confidence: "medium" as EstimateConfidence, notes: "" };
const emptyLimit = { name: "", targetType: "coffee", period: "weekly" as LimitPeriod, limitValue: "" };

export function DrinksView() {
  const today = new Date().toLocaleDateString("en-CA");
  const [logs, setLogs] = useState<DrinkLog[]>([]);
  const [limits, setLimits] = useState<DrinkLimitStatus[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showLimitForm, setShowLimitForm] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState(emptyDrink);
  const [limitDraft, setLimitDraft] = useState(emptyLimit);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [logResponse, limitResponse] = await Promise.all([fetch(`/api/drinks/logs?date=${today}`), fetch("/api/drinks/limits?status=1")]);
    if (logResponse.ok) setLogs(await logResponse.json());
    if (limitResponse.ok) setLimits(await limitResponse.json());
  }, [today]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  function edit(log: DrinkLog) {
    setEditing(log.id);
    setDraft({ name: log.name, brand: log.brand, drinkType: log.drinkType, volumeMl: log.volumeMl?.toString() ?? "", sugarLevel: log.sugarLevel, estimatedKcal: log.estimatedKcal?.toString() ?? "", kcalMin: log.kcalMin?.toString() ?? "", kcalMax: log.kcalMax?.toString() ?? "", confidence: log.confidence, notes: log.notes });
    setShowForm(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); if (saving) return; setError(""); setSaving(true);
    const body = { ...draft, occurredAt: new Date().toISOString(), volumeMl: draft.volumeMl ? Number(draft.volumeMl) : null, caffeineMg: null, estimatedKcal: draft.estimatedKcal ? Number(draft.estimatedKcal) : null, kcalMin: draft.kcalMin ? Number(draft.kcalMin) : null, kcalMax: draft.kcalMax ? Number(draft.kcalMax) : null, foodLibraryId: null };
    try { const response = await fetch(editing ? `/api/drinks/logs/${editing}` : "/api/drinks/logs", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) { setError(((await response.json()) as ApiError).error); return; }
    setDraft(emptyDrink); setEditing(null); setShowForm(false); await load(); } finally { setSaving(false); }
  }

  async function submitLimit(event: FormEvent) {
    event.preventDefault(); setError("");
    const response = await fetch("/api/drinks/limits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...limitDraft, limitValue: Number(limitDraft.limitValue), enabled: true }) });
    if (!response.ok) { setError(((await response.json()) as ApiError).error); return; }
    setLimitDraft(emptyLimit); setShowLimitForm(false); await load();
  }

  async function remove(id: number) {
    if (!confirm("删掉这条饮品记录？")) return;
    await fetch(`/api/drinks/logs/${id}`, { method: "DELETE" }); await load();
  }
  async function removeLimit(id: number) {
    if (!confirm("删掉这条饮品限制？")) return;
    await fetch(`/api/drinks/limits/${id}`, { method: "DELETE" }); await load();
  }

  return <div className="page">
    <PageHeader eyebrow="LIFE" title="Drinks" description="只记事实，不给一杯饮料下道德结论。" action={<button className="button primary" onClick={() => { setEditing(null); setDraft(emptyDrink); setShowForm(true); }}><Icon name="plus" />补一杯</button>} />

    <div className="section-heading"><div><span className="eyebrow">LIMITS</span><h2>我设的数量线</h2></div><button className="text-button" onClick={() => setShowLimitForm((value) => !value)}>{showLimitForm ? "先不设" : "设置限制"}</button></div>
    {showLimitForm && <form className="editor-card compact-editor" onSubmit={submitLimit}>
      <div className="form-grid">
        <label className="field"><span>叫什么</span><input required value={limitDraft.name} onChange={(event) => setLimitDraft({ ...limitDraft, name: event.target.value })} placeholder="例如：本周奶茶" /></label>
        <label className="field"><span>限制哪类</span><select value={limitDraft.targetType} onChange={(event) => setLimitDraft({ ...limitDraft, targetType: event.target.value })}>{types.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="field"><span>周期</span><select value={limitDraft.period} onChange={(event) => setLimitDraft({ ...limitDraft, period: event.target.value as LimitPeriod })}><option value="daily">每天</option><option value="weekly">每周</option></select></label>
        <label className="field"><span>数量</span><input required min={1} max={1000} type="number" value={limitDraft.limitValue} onChange={(event) => setLimitDraft({ ...limitDraft, limitValue: event.target.value })} /></label>
      </div>
      {error && <p className="form-error">{error}</p>}<button className="button primary">设好</button>
    </form>}
    <div className="drink-limit-grid">{limits.length ? limits.map((status) => <article key={status.limit.id}><div><span>{status.limit.name}</span><button aria-label="删除限制" onClick={() => removeLimit(status.limit.id)}><Icon name="trash" /></button></div><strong>{status.count} / {status.limit.limitValue}</strong><small>{status.limit.period === "weekly" ? "本周" : "今天"} · {status.state === "exceeded_limit" ? "已超过" : status.state === "reached_limit" ? "已到上限" : status.state === "near_limit" ? "接近上限" : "范围内"}</small></article>) : <article><span>饮品限制</span><strong>还没设置</strong><small>需要时再加，不默认催你。</small></article>}</div>

    {showForm && <FormSheet title={editing ? "改饮品记录" : "补一杯"} onClose={() => setShowForm(false)} formId="drink-record-form" submitLabel={editing ? "改好了" : "记下"} busy={saving} busyLabel={editing ? "正在修改…" : "正在保存…"}><form id="drink-record-form" className="editor-card compact-editor" onSubmit={submit}>
      <div className="editor-title"><h2>{editing ? "改饮品记录" : "补一杯"}</h2><button type="button" className="text-button" onClick={() => setShowForm(false)}>先不写</button></div>
      <div className="form-grid">
        <label className="field"><span>饮品</span><input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
        <label className="field"><span>类型</span><select value={draft.drinkType} onChange={(event) => setDraft({ ...draft, drinkType: event.target.value as DrinkType })}>{types.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="field"><span>容量 ml</span><input type="number" value={draft.volumeMl} onChange={(event) => setDraft({ ...draft, volumeMl: event.target.value })} /></label>
        <label className="field"><span>糖度</span><input value={draft.sugarLevel} onChange={(event) => setDraft({ ...draft, sugarLevel: event.target.value })} placeholder="例如：半糖" /></label>
        <label className="field"><span>热量估算</span><input type="number" value={draft.estimatedKcal} onChange={(event) => setDraft({ ...draft, estimatedKcal: event.target.value })} /></label>
      </div>
      {error && <p className="form-error">{error}</p>}<button className="button primary">{editing ? "改好了" : "记下"}</button>
    </form></FormSheet>}

    {logs.length ? <div className="food-log-list">{logs.map((log) => <article className="food-log-card" key={log.id}><div><span>{types.find(([value]) => value === log.drinkType)?.[1]} · {new Date(log.occurredAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span><h2>{log.name}</h2><p>{[log.brand, log.volumeMl ? `${log.volumeMl} ml` : "", log.sugarLevel].filter(Boolean).join(" · ")}</p><small>{log.kcalMin !== null && log.kcalMax !== null ? `${log.kcalMin}–${log.kcalMax} kcal` : log.estimatedKcal !== null ? `约 ${log.estimatedKcal} kcal` : "未估算热量"}</small></div><div className="row-actions"><button onClick={() => edit(log)}><Icon name="edit" /></button><button className="danger" onClick={() => remove(log.id)}><Icon name="trash" /></button></div></article>)}</div> : <div className="empty-state"><h2>今天还没记饮品</h2><Link className="button secondary" href="/ai?prompt=我刚刚喝了">告诉 Eva</Link></div>}
    <Link className="section-link" href="/food">回到今日饮食 <Icon name="arrow" /></Link>
  </div>;
}
