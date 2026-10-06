"use client";
import { SearchableSelect } from "@/components/searchable-select";
import { showActionToast } from "@/components/action-toast";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { compactDateTimePayload, compactDateTimeValue, DateTimeField } from "@/components/date-time-field";
import { FoodDeleteAction } from "./food-delete-action";
import { FoodLibraryPicker } from "./food-library-picker";
import { consumptionFromItem, FoodConsumptionFields } from "./food-consumption-fields";
import { calculateFoodKcal, foodCalculatedTotal } from "@/lib/food-calculation";
import type { FoodConsumption } from "@/lib/types";
import { FoodLinkPicker } from "./food-link-picker";
import { FormSheet } from "@/components/form-sheet";
import { TASTE_RATINGS } from "@/lib/types";
import type { ApiError, EstimateConfidence, FoodDish, FoodLog, FoodPlace, FoodScene, MealType, TasteRating } from "@/lib/types";
import { reconcileNativeNotifications } from "@/lib/native-bridge";

const meals: { value: MealType; label: string }[] = [{ value: "breakfast", label: "早餐" }, { value: "lunch", label: "午餐" }, { value: "dinner", label: "晚餐" }, { value: "snack", label: "加餐" }, { value: "late_night", label: "夜宵" }];
const scenes: { value: FoodScene; label: string }[] = [{ value: "home", label: "自制" }, { value: "delivery", label: "外卖" }, { value: "restaurant", label: "外食" }, { value: "packaged_food", label: "包装食品" }, { value: "other", label: "其他" }];
const tasteLabels: Record<TasteRating, string> = { love: "好吃", good: "还行", neutral: "一般", dislike: "难吃" };
type Draft = { foodLibraryId:string; occurredAt: string; title: string; description: string; mealType: MealType; scene: FoodScene; rating: TasteRating | ""; estimatedKcal: string; kcalMin: string; kcalMax: string; confidence: EstimateConfidence; portion: string; notes: string; foodPlaceId: string; foodDishIds: number[] };
const empty: Draft = { foodLibraryId:"",occurredAt: "", title: "", description: "", mealType: "lunch", scene: "other", rating: "", estimatedKcal: "", kcalMin: "", kcalMax: "", confidence: "medium", portion: "", notes: "", foodPlaceId: "", foodDishIds: [] };
function canRate(scene: FoodScene) { return scene === "delivery" || scene === "restaurant"; }
function draftFromRecord(item?: FoodLog, date = ""): Draft { return item ? { foodLibraryId:item.foodLibraryId?.toString()??"",occurredAt: compactDateTimeValue(item.occurredAt, item.occurredHasExplicitTime ?? true), title: item.title, description: item.description, mealType: item.mealType, scene: item.scene, rating: item.rating ?? "", estimatedKcal: item.estimatedKcal?.toString() || "", kcalMin: item.kcalMin?.toString() || "", kcalMax: item.kcalMax?.toString() || "", confidence: item.confidence, portion: item.portion, notes: item.notes, foodPlaceId: item.foodPlaceId?.toString() ?? "", foodDishIds: item.foodDishIds ?? (item.foodDishId ? [item.foodDishId] : []) } : { ...empty, occurredAt: date }; }

export function FoodRecordEditor({ date, record, onClose, onSaved, onDeleted }: { date: string; record?: FoodLog; onClose: () => void; onSaved: () => Promise<void> | void; onDeleted?: () => Promise<void> | void }) {
  const [draft, setDraft] = useState<Draft>(() => draftFromRecord(record, date));
  const [calendarTimeEnabled, setCalendarTimeEnabled] = useState(record?.calendarTimeEnabled ?? true);
  const [consumptions, setConsumptions] = useState<FoodConsumption[]>(() => record?.foodLibraryItems?.length ? record.foodLibraryItems : record?.foodLibraryId ? [{ foodLibraryId: record.foodLibraryId, quantity: null, unit: "serving" }] : []);
  const [kcalMode, setKcalMode] = useState<"auto" | "manual">(() => record?.foodKcalMode ?? (record ? "manual" : "auto"));
  const calculatedTotal = foodCalculatedTotal(consumptions);
  const estimatedKcal = kcalMode === "auto" && consumptions.length ? calculatedTotal?.toString() ?? "" : draft.estimatedKcal;
  function preserveReference(value: FoodConsumption): FoodConsumption {
    const previous = record?.foodLibraryItems?.find(item => item.foodLibraryId === value.foodLibraryId);
    return previous?.nutritionReference ? { ...value, item: previous.item, nutritionReference: previous.nutritionReference, calculatedKcal: calculateFoodKcal(previous.nutritionReference, value.quantity, value.unit) } : value;
  }
  function changeConsumption(index: number, value: FoodConsumption) {
    if (consumptions.some((item, other) => other !== index && item.foodLibraryId === value.foodLibraryId)) { setError("该食品已关联，请修改已有食用量"); return; }
    setError(""); setConsumptions(items => items.map((item, position) => position === index ? preserveReference(value) : item));
  }
  const [places, setPlaces] = useState<FoodPlace[]>([]);
  const [dishes, setDishes] = useState<FoodDish[]>([]);
  const automaticTitle = useRef<string | null>(null);
  const [placeQuery, setPlaceQuery] = useState("");
  const [dishQuery, setDishQuery] = useState("");
  const [placeLoading, setPlaceLoading] = useState(false); const [placeError, setPlaceError] = useState(""); const [placeAttempt, setPlaceAttempt] = useState(0);
  const [dishLoading, setDishLoading] = useState(false); const [dishError, setDishError] = useState(""); const [dishAttempt, setDishAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => { setPlaceLoading(true); setPlaceError(""); void fetch(`/api/food/places?purpose=food&limit=200&q=${encodeURIComponent(placeQuery)}`, { signal: controller.signal }).then(response => { if (!response.ok) throw new Error(); return response.json() as Promise<FoodPlace[]>; }).then(items => setPlaces(current => [...new Map([...current, ...items].map(item => [item.id, item])).values()])).catch(error => { if (error.name !== "AbortError") setPlaceError("店铺加载失败，请重试"); }).finally(() => { if (!controller.signal.aborted) setPlaceLoading(false); }); }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [placeQuery, placeAttempt]);
  useEffect(() => {
    if (!draft.foodPlaceId) return;
    const controller = new AbortController();
    const timer = setTimeout(() => { setDishLoading(true); setDishError(""); void fetch(`/api/food/places/${draft.foodPlaceId}/dishes?kind=food&q=${encodeURIComponent(dishQuery)}`, { signal: controller.signal }).then(response => { if (!response.ok) throw new Error(); return response.json() as Promise<FoodDish[]>; }).then(items => setDishes(current => [...new Map([...current, ...items].map(item => [item.id, item])).values()])).catch(error => { if (error.name !== "AbortError") setDishError("菜品加载失败，请重试"); }).finally(() => { if (!controller.signal.aborted) setDishLoading(false); }); }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [draft.foodPlaceId, dishQuery, dishAttempt]);
  const dishOptions = [...new Map([...(record?.foodPlaceId === Number(draft.foodPlaceId) ? record.foodDishes ?? (record.foodDishId && record.foodDishName ? [{ id: record.foodDishId, name: record.foodDishName }] : []) : []), ...dishes.map(dish => ({ id: dish.id, name: dish.name, detail: [dish.category, dish.recommended ? "推荐" : ""].filter(Boolean).join(" · ") }))].map(dish => [dish.id, dish])).values()];
  const placeOptions = [...new Map([...(record?.foodPlaceId && record.foodPlaceName ? [{ id: record.foodPlaceId, name: record.foodPlaceName, detail: [record.foodPlaceCity, record.foodPlaceLocation, record.foodPlaceBranch].filter(Boolean).join(" · ") }] : []), ...places.map(place => ({ id: place.id, name: place.name, detail: [place.city, place.location, place.branch].filter(Boolean).join(" · ") }))].map(place => [place.id, place])).values()];
  function selectDishes(ids: number[]) {
    const title = ids.map(id => dishOptions.find(dish => dish.id === id)?.name).filter(Boolean).join(" + ").slice(0, 200);
    const fill = !draft.title.trim() || draft.title === automaticTitle.current;
    if (fill) automaticTitle.current = title;
    setDraft({ ...draft, foodDishIds: ids, ...(fill ? { title } : {}) });
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); if (saving) return; setSaving(true); setError("");
    try {
      const occurred = compactDateTimePayload(draft.occurredAt);
      const unchangedTime = record && draft.occurredAt === compactDateTimeValue(record.occurredAt, record.occurredHasExplicitTime ?? true);
      const body = { ...draft, calendarTimeEnabled, rating: canRate(draft.scene) && draft.rating ? draft.rating : null, occurredAt: unchangedTime ? record.originalOccurredAt ?? record.occurredAt : occurred.value, occurredHasExplicitTime: unchangedTime ? record.originalHasExplicitTime ?? record.occurredHasExplicitTime ?? true : occurred.hasExplicitTime, estimatedKcal: draft.estimatedKcal ? Number(draft.estimatedKcal) : null, kcalMin: draft.kcalMin ? Number(draft.kcalMin) : null, kcalMax: draft.kcalMax ? Number(draft.kcalMax) : null, foodLibraryId:draft.foodLibraryId?Number(draft.foodLibraryId):null,foodPlaceId: draft.foodPlaceId ? Number(draft.foodPlaceId) : null, foodDishIds: draft.foodDishIds, imageUrl: null, attachmentId: null };
      const payload = { ...body, foodLibraryId: consumptions[0]?.foodLibraryId ?? null, foodLibraryItems: consumptions.map(({ foodLibraryId, quantity, unit }) => ({ foodLibraryId, quantity, unit })), foodKcalMode: consumptions.length ? kcalMode : "manual", estimatedKcal: estimatedKcal ? Number(estimatedKcal) : null };
      const response = await fetch(record ? `/api/food/logs/${record.id}` : "/api/food/logs", { method: record ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) { setError(((await response.json()) as ApiError).error); return; }
      await onSaved(); try { await reconcileNativeNotifications(); } catch { /* Web Push remains the fallback. */ } onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "无法保存饮食记录"); } finally { setSaving(false); }
  }
  async function remove() {
    if (!record || !onDeleted || saving) return; setSaving(true); setError("");
    try { const response = await fetch(`/api/food/logs/${record.id}`, { method: "DELETE" }); if (!response.ok) throw new Error("无法删除这条饮食记录，请重试"); await onDeleted(); showActionToast("饮食记录已删除", "deleted"); try { await reconcileNativeNotifications(); } catch { /* Web Push remains the fallback. */ } onClose(); } finally { setSaving(false); }
  }
  return <FormSheet title={record ? "改饮食记录" : "补一条饮食"} onClose={onClose} formId="food-record-form" submitLabel={record ? "改好了" : "记下"} busy={saving} busyLabel={record ? "正在修改…" : "正在保存…"}><form id="food-record-form" className="editor-card compact-editor" onSubmit={submit}><DateTimeField label="日期" minuteStep={1} value={{date:draft.occurredAt.slice(0,10),time:draft.occurredAt.length>10?draft.occurredAt.slice(11,16):""}} onChange={value=>{setDraft({...draft,occurredAt:value.date+(value.time?`T${value.time}`:"")});if(record)setCalendarTimeEnabled(false);}}/><label className="calendar-rule-toggle"><input type="checkbox" checked={calendarTimeEnabled} onChange={event=>setCalendarTimeEnabled(event.target.checked)}/><span>自动采用匹配的日历用餐时段</span></label><p className="muted">{record?.calendarMeal && calendarTimeEnabled ? `时间来自日历：${record.calendarMeal.title}；原饮食时间保留，取消自动采用可恢复。` : "没有匹配时保留填写的时间；直接修改日期或时间后，以你的修改为准。"}</p><div className="form-grid">
    <div className="field"><span>餐次</span><SearchableSelect label="餐次" searchable={false} value={draft.mealType} onValueChange={(value) => setDraft({ ...draft, mealType: value as MealType })} options={[...meals.map((meal) => ({value:meal.value,label:meal.label}))]}/></div>
    <div className="field"><span>场景</span><SearchableSelect label="场景" searchable={false} value={draft.scene} onValueChange={(value) => { const scene = value as FoodScene; setDraft({ ...draft, scene, rating: canRate(scene) ? draft.rating : "" }); }} options={[...scenes.map((scene) => ({value:scene.value,label:scene.label}))]}/></div>
    <label className="field"><span>吃了什么</span><input required value={draft.title} placeholder="可手动填写，或选择菜品自动生成" maxLength={200} onChange={(event) => { automaticTitle.current = null; setDraft({ ...draft, title: event.target.value }); }} /></label>
    <FoodLinkPicker label="店铺（可选）" options={placeOptions} selected={draft.foodPlaceId ? [Number(draft.foodPlaceId)] : []} loading={placeLoading} error={placeError} onRetry={() => setPlaceAttempt(value => value + 1)} onSearch={setPlaceQuery} onChange={ids => { setDishes([]); setDishQuery(""); setDishError(""); setDishLoading(false); const clearTitle = draft.title === automaticTitle.current; if (clearTitle) automaticTitle.current = ""; setDraft({ ...draft, foodPlaceId: ids[0]?.toString() ?? "", foodDishIds: [], ...(clearTitle ? { title: "" } : {}) }); }} />
    {draft.foodPlaceId && <FoodLinkPicker key={draft.foodPlaceId} label="菜品（可选，可多选）" options={dishOptions} selected={draft.foodDishIds} multiple loading={dishLoading} error={dishError} onRetry={() => setDishAttempt(value => value + 1)} onSearch={setDishQuery} onChange={selectDishes} />}
    {consumptions.map((item, index) => <FoodConsumptionFields placeId={draft.foodPlaceId} key={item.foodLibraryId} value={item} index={index} onChange={value => changeConsumption(index, value)} onRemove={() => setConsumptions(items => items.filter((_, position) => position !== index))} onLoaded={libraryItem => setConsumptions(items => items.map(value => value.foodLibraryId === libraryItem.id && !value.nutritionReference ? { ...consumptionFromItem(libraryItem), quantity: value.quantity } : value))} />)}
    {consumptions.length < 50 && <FoodLibraryPicker placeId={draft.foodPlaceId} label={consumptions.length ? "添加 Food Library 食品" : "Food Library 食品（可选）"} value="" onChange={(_, item) => {
      if (!item) return;
      if (consumptions.some(value => value.foodLibraryId === item.id)) { setError("该食品已关联，请修改已有食用量"); return; }
      setError(""); setConsumptions(items => [...items, preserveReference(consumptionFromItem(item))]);
      if (!draft.title || draft.title === automaticTitle.current) { automaticTitle.current = [...consumptions.map(value => value.item?.name), item.name].filter(Boolean).join(" + ").slice(0, 200); setDraft({ ...draft, title: automaticTitle.current }); }
    }} />}
    {canRate(draft.scene) && <div className="field"><span>评价</span><SearchableSelect label="评价" searchable={false} value={draft.rating} onValueChange={(value) => setDraft({ ...draft, rating: value as TasteRating | "" })} options={[{value:"",label:"未评价"},...TASTE_RATINGS.map((value) => ({value:value,label:tasteLabels[value]}))]}/></div>}
    <label className="field wide"><span>明细</span><textarea rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
    {consumptions.length > 0 && <div className="field wide"><output aria-live="polite">{calculatedTotal === null ? "食品热量尚未全部可计算，请补充食用量或手动估算" : `食品热量合计：约 ${calculatedTotal} kcal`}</output><div className="field"><span>最终热量</span><SearchableSelect label="最终热量计算方式" searchable={false} value={kcalMode} onValueChange={value => { if (value === "manual") setDraft({ ...draft, estimatedKcal }); setKcalMode(value as "auto" | "manual"); }} options={[{value:"auto",label:"按食品自动汇总"},{value:"manual",label:"手动估算 / 覆盖"}]} /></div>{record?.foodLibraryItems?.length ? <p className="muted">食用量按记录保存的营养基准换算</p> : null}</div>}
    <label className="field"><span>热量估算 kcal</span><input type="number" min="0" step="any" value={estimatedKcal} onChange={(event) => { setKcalMode("manual"); setDraft({ ...draft, estimatedKcal: event.target.value }); }} /></label>
    <label className="field"><span>范围 kcal</span><div className="range-pair"><input type="number" placeholder="最低" value={draft.kcalMin} onChange={(event) => setDraft({ ...draft, kcalMin: event.target.value })} /><input type="number" placeholder="最高" value={draft.kcalMax} onChange={(event) => setDraft({ ...draft, kcalMax: event.target.value })} /></div></label>
  </div>{error && <p className="form-error">{error}</p>}{record && onDeleted && <FoodDeleteAction label="删除这条饮食记录" description={`确定删除「${record.title}」？删除后无法恢复。`} onDelete={remove} disabled={saving}/>}</form></FormSheet>;
}

export { meals, scenes, tasteLabels };
