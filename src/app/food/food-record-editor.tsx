"use client";
import { useLocale } from "@/components/locale-controller";
import { translateUiCopy } from "@/lib/ui-copy";
import { SearchableSelect } from "@/components/searchable-select";
import { showActionToast } from "@/components/action-toast";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { compactDateTimePayload, compactDateTimeValue, DateTimeField } from "@/components/date-time-field";
import { FoodDeleteAction } from "./food-delete-action";
import { FoodNameInput } from "./food-name-input";
import type { FoodCatalogItem } from "@/lib/food-catalog";
import { consumptionFromItem, FoodConsumptionFields } from "./food-consumption-fields";
import { calculateFoodKcal, foodCalculatedTotal } from "@/lib/food-calculation";
import type { FoodConsumption } from "@/lib/types";
import { FoodLinkPicker } from "./food-link-picker";
import { FormSheet } from "@/components/form-sheet";
import { TASTE_RATINGS } from "@/lib/types";
import type { ApiError, EstimateConfidence, FoodLog, FoodPlace, FoodScene, MealType, TasteRating } from "@/lib/types";
import { reconcileNativeNotifications } from "@/lib/native-bridge";
import { usualMeal } from "@/lib/meal-calendar";
import styles from "./food-record-editor.module.css";

const meals: { value: MealType; label: string }[] = [{ value: "breakfast", label: "早餐" }, { value: "lunch", label: "午餐" }, { value: "dinner", label: "晚餐" }, { value: "snack", label: "加餐" }, { value: "late_night", label: "夜宵" }];
const scenes: { value: FoodScene; label: string }[] = [{ value: "home", label: "自制" }, { value: "delivery", label: "外卖" }, { value: "restaurant", label: "外食" }, { value: "packaged_food", label: "包装食品" }, { value: "other", label: "其他" }];
const tasteLabels: Record<TasteRating, string> = { love: "好吃", good: "还行", neutral: "一般", dislike: "难吃" };
type Draft = { foodLibraryId:string; occurredAt: string; title: string; description: string; mealType: MealType; scene: FoodScene; rating: TasteRating | ""; estimatedKcal: string; kcalMin: string; kcalMax: string; confidence: EstimateConfidence; portion: string; notes: string; foodPlaceId: string; foodDishIds: number[] };
const empty: Draft = { foodLibraryId:"",occurredAt: "", title: "", description: "", mealType: "lunch", scene: "other", rating: "", estimatedKcal: "", kcalMin: "", kcalMax: "", confidence: "medium", portion: "", notes: "", foodPlaceId: "", foodDishIds: [] };
function canRate(scene: FoodScene) { return scene === "delivery" || scene === "restaurant"; }
function draftFromRecord(item?: FoodLog, date = ""): Draft { return item ? { foodLibraryId:item.foodLibraryId?.toString()??"",occurredAt: compactDateTimeValue(item.occurredAt, item.occurredHasExplicitTime ?? true), title: item.title, description: item.description, mealType: item.mealType, scene: item.scene, rating: item.rating ?? "", estimatedKcal: item.estimatedKcal?.toString() || "", kcalMin: item.kcalMin?.toString() || "", kcalMax: item.kcalMax?.toString() || "", confidence: item.confidence, portion: item.portion, notes: item.notes, foodPlaceId: item.foodPlaceId?.toString() ?? "", foodDishIds: item.foodDishIds ?? (item.foodDishId ? [item.foodDishId] : []) } : { ...empty, occurredAt: date }; }

export function FoodRecordEditor({ date, record, initialMealType, onClose, onSaved, onDeleted }: { date: string; record?: FoodLog; initialMealType?: MealType; onClose: () => void; onSaved: () => Promise<void> | void; onDeleted?: () => Promise<void> | void }) {
  const { english } = useLocale();
  const t = (value: string) => translateUiCopy(value, english ? "en" : "zh-CN");
  const [suggestedMeal] = useState(() => usualMeal(new Date().getHours()));
  const [draft, setDraft] = useState<Draft>(() => ({ ...draftFromRecord(record, date), ...(!record ? { mealType: initialMealType ?? suggestedMeal } : {}) }));
  const mealChosen = useRef(Boolean(record || initialMealType));
  const [calendarTimeEnabled, setCalendarTimeEnabled] = useState(record?.calendarTimeEnabled ?? true);
  const [consumptions, setConsumptions] = useState<FoodConsumption[]>(() => record?.foodLibraryItems?.length ? record.foodLibraryItems : record?.foodLibraryId ? [{ foodLibraryId: record.foodLibraryId, quantity: null, unit: "serving" }] : []);
  const [consumedWeight, setConsumedWeight] = useState(() => (record?.consumedWeightG ?? (record?.foodLibraryItems?.length === 1 && record.foodLibraryItems[0].unit === "g" ? record.foodLibraryItems[0].quantity : null))?.toFixed(2) ?? "");
  function changeWeight(value: string) {
    setConsumedWeight(value);
    if (consumptions.length === 1) {
      const item = consumptions[0], quantity = value === "" ? null : Number(value);
      const calculatedKcal = item.nutritionReference ? calculateFoodKcal(item.nutritionReference, quantity, "g") : null;
      setConsumptions([{ ...item, quantity, unit: "g", calculatedKcal }]);
      setKcalMode(!item.nutritionReference || calculatedKcal !== null ? "auto" : "manual");
    }
  }
  const [kcalMode, setKcalMode] = useState<"auto" | "manual">(() => record?.foodKcalMode ?? (record ? "manual" : "auto"));
  const calculatedTotal = foodCalculatedTotal(consumptions);
  const estimatedKcal = kcalMode === "auto" && consumptions.length ? calculatedTotal?.toFixed(2) ?? "" : draft.estimatedKcal;
  function preserveReference(value: FoodConsumption): FoodConsumption {
    const previous = record?.foodLibraryItems?.find(item => item.foodLibraryId === value.foodLibraryId);
    return previous?.nutritionReference ? { ...value, item: previous.item, nutritionReference: previous.nutritionReference, calculatedKcal: calculateFoodKcal(previous.nutritionReference, value.quantity, value.unit) } : value;
  }
  function changeConsumption(index: number, value: FoodConsumption) {
    if (consumptions.some((item, other) => other !== index && item.foodLibraryId === value.foodLibraryId)) { setError("该食品已关联，请修改已有食用量"); return; }
    setError(""); updateConsumptions(consumptions.map((item, position) => position === index ? preserveReference(value) : item));
  }
  const [places, setPlaces] = useState<FoodPlace[]>([]);
  const [chosen,setChosen]=useState<FoodCatalogItem>();
  const [browseQuery,setBrowseQuery]=useState("");
  const automaticTitle = useRef<string | null>(null);
  const titleSource = useRef<"dish" | "library" | null>(null);
  function updateConsumptions(items: FoodConsumption[]) {
    setConsumptions(items);
    if (!draft.title.trim() || (titleSource.current === "library" && draft.title === automaticTitle.current)) {
      const title = items.map(item => item.item?.name).filter(Boolean).join(" + ").slice(0, 200);
      automaticTitle.current = title; titleSource.current = "library";
      setDraft(current => ({ ...current, title }));
    }
  }
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeLoading, setPlaceLoading] = useState(false); const [placeError, setPlaceError] = useState(""); const [placeAttempt, setPlaceAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => { setPlaceLoading(true); setPlaceError(""); void fetch(`/api/food/places?purpose=food&limit=200&q=${encodeURIComponent(placeQuery)}`, { signal: controller.signal }).then(response => { if (!response.ok) throw new Error(); return response.json() as Promise<FoodPlace[]>; }).then(items => setPlaces(current => [...new Map([...current, ...items].map(item => [item.id, item])).values()])).catch(error => { if (error.name !== "AbortError") setPlaceError("店铺加载失败，请重试"); }).finally(() => { if (!controller.signal.aborted) setPlaceLoading(false); }); }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [placeQuery, placeAttempt]);
  const placeOptions = [...new Map([...(record?.foodPlaceId && record.foodPlaceName ? [{ id: record.foodPlaceId, name: record.foodPlaceName }] : []), ...(chosen?.placeId?[{id:chosen.placeId,name:chosen.placeName}]:[]), ...places.map(place=>({id:place.id,name:place.name,detail:[place.city,place.location,place.branch].filter(Boolean).join(" · ")}))].map(place=>[place.id,place])).values()];
  function selectItem(item:FoodCatalogItem){
    setChosen(item);setBrowseQuery("");automaticTitle.current=item.name;titleSource.current=item.menu?"dish":"library";
    const consumption=item.library?preserveReference(consumptionFromItem(item.library)):null;
    if(consumption && item.servingKcal!==null){consumption.quantity=1;consumption.unit="serving";consumption.calculatedKcal=calculateFoodKcal(consumption.nutritionReference!,1,"serving");}
    if(consumption && consumedWeight!==""){consumption.quantity=Number(consumedWeight);consumption.unit="g";consumption.calculatedKcal=calculateFoodKcal(consumption.nutritionReference!,consumption.quantity,"g");}
    setConsumptions(consumption?[consumption]:[]);setKcalMode(consumption?"auto":"manual");
    setDraft({...draft,title:item.name,foodPlaceId:item.placeId?.toString()??"",foodDishIds:item.menu?[item.menu.id]:[],foodLibraryId:item.library?.id.toString()??"",estimatedKcal:"",kcalMin:"",kcalMax:""});
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); if (saving) return; setSaving(true); setError("");
    try {
      const occurred = compactDateTimePayload(draft.occurredAt);
      const unchangedTime = record && draft.occurredAt === compactDateTimeValue(record.occurredAt, record.occurredHasExplicitTime ?? true);
      const body = { ...draft, calendarTimeEnabled, rating: canRate(draft.scene) && draft.rating ? draft.rating : null, occurredAt: unchangedTime ? record.originalOccurredAt ?? record.occurredAt : occurred.value, occurredHasExplicitTime: unchangedTime ? record.originalHasExplicitTime ?? record.occurredHasExplicitTime ?? true : occurred.hasExplicitTime, estimatedKcal: draft.estimatedKcal ? Number(draft.estimatedKcal) : null, kcalMin: draft.kcalMin ? Number(draft.kcalMin) : null, kcalMax: draft.kcalMax ? Number(draft.kcalMax) : null, foodLibraryId:draft.foodLibraryId?Number(draft.foodLibraryId):null,foodPlaceId: draft.foodPlaceId ? Number(draft.foodPlaceId) : null, foodDishIds: draft.foodDishIds, imageUrl: null, attachmentId: null };
      const payload = { ...body, consumedWeightG: consumedWeight === "" ? null : Number(consumedWeight), foodLibraryId: consumptions[0]?.foodLibraryId ?? null, foodLibraryItems: consumptions.map(({ foodLibraryId, quantity, unit }) => ({ foodLibraryId, quantity, unit })), foodKcalMode: consumptions.length ? kcalMode : "manual", estimatedKcal: estimatedKcal ? Number(estimatedKcal) : null };
      const response = await fetch(record ? `/api/food/logs/${record.id}` : "/api/food/logs", { method: record ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) { setError(((await response.json()) as ApiError).error); return; }
      await onSaved(); try { await reconcileNativeNotifications(); } catch { /* Web Push remains the fallback. */ } onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "无法保存饮食记录"); } finally { setSaving(false); }
  }
  async function remove() {
    if (!record || !onDeleted || saving) return; setSaving(true); setError("");
    try { const response = await fetch(`/api/food/logs/${record.id}`, { method: "DELETE" }); if (!response.ok) throw new Error("无法删除这条饮食记录，请重试"); await onDeleted(); showActionToast("饮食记录已删除", "deleted"); try { await reconcileNativeNotifications(); } catch { /* Web Push remains the fallback. */ } onClose(); } finally { setSaving(false); }
  }
  return <FormSheet title={record ? "改饮食记录" : "补一条饮食"} onClose={onClose} formId="food-record-form" submitLabel={record ? "改好了" : "记下"} busy={saving} busyLabel={record ? "正在修改…" : "正在保存…"}>
    <form id="food-record-form" className={`editor-card compact-editor ${styles.editor}`} onSubmit={submit}>
      <FoodNameInput kind="food" label="吃了什么" required value={draft.title} onSelect={selectItem} onValueChange={title=>{automaticTitle.current=null;titleSource.current=null;if(chosen){setConsumptions([]);setKcalMode("manual");}setChosen(undefined);setDraft({...draft,title,...(chosen?{foodPlaceId:"",foodDishIds:[],foodLibraryId:"",estimatedKcal:""}:{})});}}/>
      {(chosen?.placeName||record?.foodPlaceName)&&draft.foodPlaceId&&<p className="muted user-content">{chosen?.placeName??record?.foodPlaceName}</p>}
      <DateTimeField inline label="日期" minuteStep={1} value={{ date: draft.occurredAt.slice(0, 10), time: draft.occurredAt.length > 10 ? draft.occurredAt.slice(11, 16) : "" }} onChange={value => {
        setDraft({ ...draft, occurredAt: value.date + (value.time ? `T${value.time}` : ""), ...(!mealChosen.current && value.time ? { mealType: usualMeal(Number(value.time.slice(0, 2))) } : {}) });
        if (record) setCalendarTimeEnabled(false);
      }} />
      {record?.calendarMeal && calendarTimeEnabled && <p className="muted">时间来自日历：<span className="user-content">{record.calendarMeal.title}</span></p>}
      <div className="field"><span>餐次</span><SearchableSelect label="餐次" searchable={false} value={draft.mealType} options={meals} onValueChange={value=>{mealChosen.current=true;setDraft({...draft,mealType:value as MealType});}}/></div>
      <div className="field"><span>场景</span><SearchableSelect label="场景" searchable={false} value={draft.scene} options={scenes} onValueChange={value=>{const scene=value as FoodScene;setDraft({...draft,scene,rating:canRate(scene)?draft.rating:""});}}/></div>
      {draft.foodPlaceId && !canRate(draft.scene) && <p className="muted">外卖或外食可补充本次口味评价。</p>}
      {canRate(draft.scene) && <div className="field"><span>评价</span><SearchableSelect label="评价" searchable={false} clearable value={draft.rating} options={TASTE_RATINGS.map(value=>({value,label:tasteLabels[value]}))} onValueChange={value=>setDraft({...draft,rating:value as TasteRating|""})}/></div>}
      <div className={styles.nutrition}>
          <div className={styles.amountEnergy}>
          <label className="field"><span>吃了多少（克）</span><input type="number" inputMode="decimal" min="0" max="1000000" step="0.01" value={consumedWeight} onChange={event => changeWeight(event.target.value)} onBlur={() => { if (consumedWeight !== "" && Number.isFinite(Number(consumedWeight))) { const formatted = Number(consumedWeight).toFixed(2); if (Number(formatted) !== Number(consumedWeight)) changeWeight(formatted); else setConsumedWeight(formatted); } }} /></label>
          <label className="field"><span>热量估算 kcal</span><input type="number" inputMode="decimal" min="0" step="any" readOnly={consumptions.length > 0 && kcalMode === "auto"} value={estimatedKcal} onChange={event => { setKcalMode("manual"); setDraft({ ...draft, estimatedKcal: event.target.value }); }} /></label>
          </div>
          {consumptions.map((item, index) => <FoodConsumptionFields hideQuantity={consumptions.length === 1} placeId={draft.foodPlaceId} key={item.foodLibraryId} value={item} index={index} onChange={value => changeConsumption(index, value)} onRemove={() => updateConsumptions(consumptions.filter((_, position) => position !== index))} onLoaded={libraryItem => setConsumptions(items => items.map(value => value.foodLibraryId === libraryItem.id && !value.nutritionReference ? { ...consumptionFromItem(libraryItem), quantity: value.quantity, unit: value.unit, calculatedKcal: calculateFoodKcal(consumptionFromItem(libraryItem).nutritionReference!, value.quantity, value.unit) } : value))} />)}
          {consumptions.length > 0 && <div className={styles.energy}><output aria-live="polite">{kcalMode === "manual" ? estimatedKcal ? `${english?"Manual estimate:":"手动估算："} ${Number(estimatedKcal).toFixed(2)} kcal` : t("尚未估算热量") : calculatedTotal === null ? t("部分食品缺少食用量或营养基准，可直接保存") : `${english?"Total: about":"合计：约"} ${calculatedTotal.toFixed(2)} kcal`}</output><button type="button" className="text-button" data-form-change onClick={() => { if (kcalMode === "auto") setDraft({ ...draft, estimatedKcal }); setKcalMode(kcalMode === "auto" ? "manual" : "auto"); }}>{kcalMode === "auto" ? "手动修改" : "恢复自动计算"}</button></div>}
          {record?.foodLibraryItems?.length ? <p className="muted">食用量按记录保存的营养基准换算</p> : null}
      </div>
      <div className={styles.browser}><FoodLinkPicker label="店铺" options={placeOptions} selected={draft.foodPlaceId?[Number(draft.foodPlaceId)]:[]} loading={placeLoading} error={placeError} onRetry={()=>setPlaceAttempt(value=>value+1)} onSearch={setPlaceQuery} onChange={ids=>{setChosen(undefined);setBrowseQuery("");setDraft({...draft,foodPlaceId:ids[0]?.toString()??"",foodDishIds:[]});}}/>
        {draft.foodPlaceId&&<FoodNameInput key={draft.foodPlaceId} kind="food" placeId={draft.foodPlaceId} label="店铺食品" value={browseQuery} onValueChange={setBrowseQuery} onSelect={selectItem}/>}
      </div>
      <label className="field"><span>明细</span><textarea rows={3} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
      {record?.portion && <label className="field"><span>份量说明</span><input value={draft.portion} onChange={event => setDraft({ ...draft, portion: event.target.value })} /></label>}
      {record?.notes && <label className="field"><span>备注</span><textarea rows={2} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></label>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {record && onDeleted && <FoodDeleteAction label="删除这条饮食记录" description={`确定删除「${record.title}」？删除后无法恢复。`} onDelete={remove} disabled={saving} />}
    </form>
  </FormSheet>;
}

export { meals, scenes, tasteLabels };
