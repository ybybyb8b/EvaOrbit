"use client";

import { type FormEvent, useEffect, useState } from "react";
import { FormSheet } from "@/components/form-sheet";
import { TASTE_RATINGS } from "@/lib/types";
import type { ApiError, EstimateConfidence, FoodDish, FoodLog, FoodPlace, FoodScene, MealType, TasteRating } from "@/lib/types";

const meals: { value: MealType; label: string }[] = [{ value: "breakfast", label: "早餐" }, { value: "lunch", label: "午餐" }, { value: "dinner", label: "晚餐" }, { value: "snack", label: "加餐" }, { value: "late_night", label: "夜宵" }];
const scenes: { value: FoodScene; label: string }[] = [{ value: "home", label: "自制" }, { value: "delivery", label: "外卖" }, { value: "restaurant", label: "外食" }, { value: "packaged_food", label: "包装食品" }, { value: "other", label: "其他" }];
const tasteLabels: Record<TasteRating, string> = { love: "好吃", good: "还行", neutral: "一般", dislike: "难吃" };
type Draft = { title: string; description: string; mealType: MealType; scene: FoodScene; rating: TasteRating | ""; estimatedKcal: string; kcalMin: string; kcalMax: string; confidence: EstimateConfidence; portion: string; notes: string; foodPlaceId: string; foodDishId: string };
const empty: Draft = { title: "", description: "", mealType: "lunch", scene: "other", rating: "", estimatedKcal: "", kcalMin: "", kcalMax: "", confidence: "medium", portion: "", notes: "", foodPlaceId: "", foodDishId: "" };
function canRate(scene: FoodScene) { return scene === "delivery" || scene === "restaurant"; }
function draftFromRecord(item?: FoodLog): Draft { return item ? { title: item.title, description: item.description, mealType: item.mealType, scene: item.scene, rating: item.rating ?? "", estimatedKcal: item.estimatedKcal?.toString() || "", kcalMin: item.kcalMin?.toString() || "", kcalMax: item.kcalMax?.toString() || "", confidence: item.confidence, portion: item.portion, notes: item.notes, foodPlaceId: item.foodPlaceId?.toString() ?? "", foodDishId: item.foodDishId?.toString() ?? "" } : empty; }

export function FoodRecordEditor({ date, record, onClose, onSaved, onDeleted }: { date: string; record?: FoodLog; onClose: () => void; onSaved: () => Promise<void> | void; onDeleted?: () => Promise<void> | void }) {
  const [draft, setDraft] = useState<Draft>(() => draftFromRecord(record));
  const [places, setPlaces] = useState<FoodPlace[]>([]);
  const [dishes, setDishes] = useState<FoodDish[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { void fetch("/api/food/places?limit=200").then((response) => response.ok ? response.json() : []).then(setPlaces); }, []);
  useEffect(() => { if (!draft.foodPlaceId) return; void fetch(`/api/food/places/${draft.foodPlaceId}/dishes`).then((response) => response.ok ? response.json() : []).then(setDishes); }, [draft.foodPlaceId]);

  async function submit(event: FormEvent) {
    event.preventDefault(); if (saving) return; setSaving(true); setError("");
    try {
      const body = { ...draft, rating: canRate(draft.scene) && draft.rating ? draft.rating : null, occurredAt: `${date}T12:00:00+08:00`, estimatedKcal: draft.estimatedKcal ? Number(draft.estimatedKcal) : null, kcalMin: draft.kcalMin ? Number(draft.kcalMin) : null, kcalMax: draft.kcalMax ? Number(draft.kcalMax) : null, foodPlaceId: draft.foodPlaceId ? Number(draft.foodPlaceId) : null, foodDishId: draft.foodDishId ? Number(draft.foodDishId) : null, imageUrl: null, attachmentId: null };
      const response = await fetch(record ? `/api/food/logs/${record.id}` : "/api/food/logs", { method: record ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) { setError(((await response.json()) as ApiError).error); return; }
      await onSaved(); onClose();
    } finally { setSaving(false); }
  }
  async function remove() {
    if (!record || !onDeleted || !confirm("删掉这条饮食记录？")) return; setSaving(true); setError("");
    try { const response = await fetch(`/api/food/logs/${record.id}`, { method: "DELETE" }); if (!response.ok) { setError("无法删除这条饮食记录"); return; } await onDeleted(); onClose(); } finally { setSaving(false); }
  }
  return <FormSheet title={record ? "改饮食记录" : "补一条饮食"} onClose={onClose} formId="food-record-form" submitLabel={record ? "改好了" : "记下"} busy={saving} busyLabel={record ? "正在修改…" : "正在保存…"}><form id="food-record-form" className="editor-card compact-editor" onSubmit={submit}><div className="form-grid">
    <label className="field"><span>餐次</span><select value={draft.mealType} onChange={(event) => setDraft({ ...draft, mealType: event.target.value as MealType })}>{meals.map((meal) => <option value={meal.value} key={meal.value}>{meal.label}</option>)}</select></label>
    <label className="field"><span>场景</span><select value={draft.scene} onChange={(event) => { const scene = event.target.value as FoodScene; setDraft({ ...draft, scene, rating: canRate(scene) ? draft.rating : "" }); }}>{scenes.map((scene) => <option value={scene.value} key={scene.value}>{scene.label}</option>)}</select></label>
    <label className="field"><span>吃了什么</span><input required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
    <label className="field"><span>店铺（可选）</span><select value={draft.foodPlaceId} onChange={(event) => { setDishes([]); setDraft({ ...draft, foodPlaceId: event.target.value, foodDishId: "" }); }}><option value="">未关联店铺</option>{places.map((place) => <option value={place.id} key={place.id}>{place.name}{place.branch ? ` · ${place.branch}` : ""}</option>)}</select></label>
    {draft.foodPlaceId && <label className="field"><span>菜品（可选）</span><select value={draft.foodDishId} onChange={(event) => setDraft({ ...draft, foodDishId: event.target.value })}><option value="">未关联菜品</option>{dishes.map((dish) => <option value={dish.id} key={dish.id}>{dish.name}{dish.recommended ? " · 推荐" : ""}</option>)}</select></label>}
    {canRate(draft.scene) && <label className="field"><span>评价</span><select value={draft.rating} onChange={(event) => setDraft({ ...draft, rating: event.target.value as TasteRating | "" })}><option value="">未评价</option>{TASTE_RATINGS.map((value) => <option value={value} key={value}>{tasteLabels[value]}</option>)}</select></label>}
    <label className="field wide"><span>明细</span><textarea rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
    <label className="field"><span>热量估算</span><input type="number" value={draft.estimatedKcal} onChange={(event) => setDraft({ ...draft, estimatedKcal: event.target.value })} /></label>
    <label className="field"><span>范围 kcal</span><div className="range-pair"><input type="number" placeholder="最低" value={draft.kcalMin} onChange={(event) => setDraft({ ...draft, kcalMin: event.target.value })} /><input type="number" placeholder="最高" value={draft.kcalMax} onChange={(event) => setDraft({ ...draft, kcalMax: event.target.value })} /></div></label>
  </div>{error && <p className="form-error">{error}</p>}{record && onDeleted && <button className="danger-text food-record-delete" type="button" onClick={() => void remove()}>删除这条饮食记录</button>}</form></FormSheet>;
}

export { meals, scenes, tasteLabels };
