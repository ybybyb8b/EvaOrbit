"use client";

import { useState, type FormEvent } from "react";
import { FormSheet } from "@/components/form-sheet";
import { SearchableSelect } from "@/components/searchable-select";
import { showActionToast } from "@/components/action-toast";
import { FoodDeleteAction } from "../food/food-delete-action";
import { drinkTypes } from "../drinks/drink-ui";
import type { DrinkLimit, LimitPeriod } from "@/lib/types";

export const limitStateLabels = { within_limit: "范围内", near_limit: "接近上限", reached_limit: "已到上限", exceeded_limit: "已超过" };
export const limitPeriodLabels = { daily: "今天", weekly: "本周", monthly: "本月" };

export function LimitEditor({ limit, onClose, onSaved }: { limit?: DrinkLimit; onClose: () => void; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState({ name: limit?.name ?? "", targetType: limit?.targetType ?? "coffee", period: limit?.period ?? "weekly", limitValue: String(limit?.limitValue ?? ""), enabled: limit?.enabled ?? true });
  const [custom, setCustom] = useState(Boolean(limit && !drinkTypes.some(([type]) => type === limit.targetType)));
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); if (saving) return; setSaving(true); setError("");
    try {
      const response = await fetch(limit ? `/api/drinks/limits/${limit.id}` : "/api/drinks/limits", { method: limit ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, limitValue: Number(draft.limitValue) }) });
      if (!response.ok) throw new Error((await response.json()).error ?? "无法保存限额，请重试");
      await onSaved(); onClose(); showActionToast("饮品限额已保存", "success");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "无法保存限额，请重试"); }
    finally { setSaving(false); }
  }
  async function remove() {
    if (!limit || saving) return; setSaving(true);
    try {
      const response = await fetch(`/api/drinks/limits/${limit.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("无法删除限额，请重试");
      await onSaved(); onClose(); showActionToast("饮品限额已删除", "deleted");
    } finally { setSaving(false); }
  }
  return <FormSheet title={limit ? "编辑饮品限额" : "设置饮品限额"} onClose={onClose} formId="drink-limit-form" submitLabel="保存" busy={saving}>
    <form id="drink-limit-form" className="editor-card compact-editor" onSubmit={submit}><div className="form-grid">
      <label className="field"><span>限额名称</span><input required maxLength={120} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="例如：奶茶 KPI" /></label>
      <div className="field"><span>限制对象</span><SearchableSelect label="限制对象" searchable={false} value={custom ? "__custom__" : draft.targetType} onValueChange={value => { setCustom(value === "__custom__"); setDraft({ ...draft, targetType: value === "__custom__" ? "" : value }); }} options={[...drinkTypes.map(([value, label]) => ({ value, label })), { value: "__custom__", label: "自定义品名关键词" }]} /></div>
      {custom && <label className="field"><span>品名关键词</span><input required maxLength={80} value={draft.targetType} onChange={event => setDraft({ ...draft, targetType: event.target.value })} placeholder="例如：拿铁" /></label>}
      <div className="field"><span>周期</span><SearchableSelect label="周期" searchable={false} value={draft.period} onValueChange={value => setDraft({ ...draft, period: value as LimitPeriod })} options={[{ value: "daily", label: "每天" }, { value: "weekly", label: "每周" }, { value: "monthly", label: "每月" }]} /></div>
      <label className="field"><span>数量上限（杯）</span><input required type="number" min={1} max={1000} step={1} value={draft.limitValue} onChange={event => setDraft({ ...draft, limitValue: event.target.value })} /></label>
      <label className="field checkbox-field"><input type="checkbox" checked={draft.enabled} onChange={event => setDraft({ ...draft, enabled: event.target.checked })} /><span>启用限额</span></label>
    </div><p className="field-hint">沿用现有规则：按饮品类型或品名关键词计杯数。</p>{error && <p className="form-error" role="alert">{error}</p>}
      {limit && <FoodDeleteAction label="删除这条限额" description={`确定删除「${limit.name}」？饮品记录不会删除。`} onDelete={remove} disabled={saving} />}
    </form>
  </FormSheet>;
}
