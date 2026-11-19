"use client";
import {useBusinessRequest} from "@/components/business-request-context";
import {useFoodData} from "@/components/food-data-context";
import {useFormPreview,FormPreviewNotice} from "@/components/form-preview";
import { ErrorNotice } from "@/components/error-notice";
import { useLocale } from "@/components/locale-controller";
import { translateUiCopy } from "@/lib/ui-copy";
import { SearchableSelect } from "@/components/searchable-select";
import { showActionToast } from "@/components/action-toast";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { Disclosure } from "@/components/disclosure";
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

import {meals,scenes,tasteLabels} from "@/lib/food-record-labels";
type SelectedDish = { id: number; name: string; foodLibraryId?: number | null; foodPlaceId?:number };
type Draft = { foodLibraryId:string; occurredAt: string; title: string; description: string; mealType: MealType; scene: FoodScene; rating: TasteRating | ""; estimatedKcal: string; kcalMin: string; kcalMax: string; confidence: EstimateConfidence; foodPlaceId: string; foodDishIds: number[] };
const empty: Draft = { foodLibraryId:"",occurredAt: "", title: "", description: "", mealType: "lunch", scene: "other", rating: "", estimatedKcal: "", kcalMin: "", kcalMax: "", confidence: "medium", foodPlaceId: "", foodDishIds: [] };
function canRate(scene: FoodScene) { return scene === "delivery" || scene === "restaurant"; }
function selectionTitle(ids:number[],items:FoodConsumption[],dishes:SelectedDish[]){
  const active=dishes.filter(dish=>ids.includes(dish.id));
  const referenceIds=new Set(active.flatMap(dish=>dish.foodLibraryId?[dish.foodLibraryId]:[]));
  return [...new Set([...active.map(dish=>dish.name),...items.filter(item=>!referenceIds.has(item.foodLibraryId)).map(item=>item.item?.name)].filter(Boolean))].join(" + ").slice(0,200);
}
function draftFromRecord(item?: FoodLog, date = ""): Draft { return item ? { foodLibraryId:item.foodLibraryId?.toString()??"",occurredAt: compactDateTimeValue(item.occurredAt, item.occurredHasExplicitTime ?? true), title: item.title, description: item.description, mealType: item.mealType, scene: item.scene, rating: item.rating ?? "", estimatedKcal: item.estimatedKcal?.toString() ?? "", kcalMin: item.kcalMin?.toString() ?? "", kcalMax: item.kcalMax?.toString() ?? "", confidence: item.confidence, foodPlaceId: item.foodPlaceId?.toString() ?? "", foodDishIds: item.foodDishIds ?? (item.foodDishId ? [item.foodDishId] : []) } : { ...empty, occurredAt: date }; }

export function FoodRecordEditor({ date, record, initialMealType, onClose, onSaved, onDeleted }: { date: string; record?: FoodLog; initialMealType?: MealType; onClose: () => void; onSaved: () => Promise<void> | void; onDeleted?: () => Promise<void> | void }) {
  const businessFetch=useBusinessRequest();
  const {read,local}=useFoodData();
  const previewOnly=useFormPreview();
  const { english } = useLocale();
  const t = (value: string) => translateUiCopy(value, english ? "en" : "zh-CN");
  const [suggestedMeal] = useState(() => usualMeal(new Date().getHours()));
  const [draft, setDraft] = useState<Draft>(() => ({ ...draftFromRecord(record, date), ...(!record ? { mealType: initialMealType ?? suggestedMeal } : {}) }));
  const mealChosen = useRef(Boolean(record || initialMealType));
  const [consumptions, setConsumptions] = useState<FoodConsumption[]>(() => record?.foodLibraryItems?.length ? record.foodLibraryItems : record?.foodLibraryId ? [{ foodLibraryId: record.foodLibraryId, quantity: null, unit: "serving" }] : []);
  const [selectedDishes, setSelectedDishes] = useState<SelectedDish[]>(() => record?.foodDishes ?? (record?.foodDishId && record.foodDishName ? [{id:record.foodDishId,name:record.foodDishName}] : []));
  const [caloriesChanged, setCaloriesChanged] = useState(false);
  const [consumedWeight, setConsumedWeight] = useState(() => record?.consumedWeightG?.toString() ?? "");
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingCalories, setEditingCalories] = useState(false);
  const [kcalMode, setKcalMode] = useState<"auto" | "manual">(() => record?.foodKcalMode ?? (record ? "manual" : "auto"));
  const calculatedTotal = foodCalculatedTotal(consumptions);
  const estimatedKcal = kcalMode === "auto" && consumptions.length ? calculatedTotal?.toFixed(2) ?? "" : draft.estimatedKcal;
  const calculatedItems = consumptions.filter(item => item.calculatedKcal != null);
  const partialTotal = foodCalculatedTotal(calculatedItems);
  const uncalculated = consumptions.length - calculatedItems.length;
  const displayCalories = (value: number) => `${value.toLocaleString(english ? "en" : "zh-CN", { maximumFractionDigits: 2 })} kcal`;
  function preserveReference(value: FoodConsumption): FoodConsumption {
    const previous = record?.foodLibraryItems?.find(item => item.foodLibraryId === value.foodLibraryId);
    return previous?.nutritionReference ? { ...value, item: previous.item, nutritionReference: previous.nutritionReference, calculatedKcal: calculateFoodKcal(previous.nutritionReference, value.quantity, value.unit) } : value;
  }
  function changeConsumption(index: number, value: FoodConsumption) {
    if (consumptions.some((item, other) => other !== index && item.foodLibraryId === value.foodLibraryId)) { setError("该食品已关联，请修改已有食用量"); return; }
    // A replacement denotes a different food, so its amount starts blank.
    setError(""); updateSelection(draft.foodDishIds,consumptions.map((item, position) => position === index ? preserveReference(value) : item));
  }
  const [places, setPlaces] = useState<FoodPlace[]>([]);
  const [chosen,setChosen]=useState<FoodCatalogItem>();
  const [sourceOptions,setSourceOptions]=useState<{id:number;name:string}[]>(record?.foodPlaces??[]);
  const [browseQuery,setBrowseQuery]=useState(()=>consumptions.length||draft.foodDishIds.length?"":draft.title);
  const hasSelectedFoods=consumptions.length>0||draft.foodDishIds.length>0;
  const automaticTitle = useRef<string | null>(draft.title===selectionTitle(draft.foodDishIds,consumptions,selectedDishes)?draft.title:null);
  function updateSelection(ids: number[], items: FoodConsumption[], dishes = selectedDishes, placeId = draft.foodPlaceId, replaceTitle = false) {
    setConsumptions(items);
    const active = dishes.filter(dish=>ids.includes(dish.id));
    setSelectedDishes(active);
    const title = selectionTitle(ids,items,active);
    const fill = replaceTitle || !draft.title.trim() || draft.title === automaticTitle.current;
    if(fill)automaticTitle.current=title;
    setDraft(current=>({...current,foodDishIds:ids,foodPlaceId:placeId,...(fill?{title}:{}),...(kcalMode==="auto"&&!items.length?{estimatedKcal:""}:{})}));
    if(kcalMode==="auto")setCaloriesChanged(true);
    if(!items.length && kcalMode==="auto")setKcalMode("manual");
  }
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeLoading, setPlaceLoading] = useState(false); const [placeError, setPlaceError] = useState(""); const [placeAttempt, setPlaceAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {if(previewOnly&&!local)return;
    const controller = new AbortController();
    const timer = setTimeout(() => { setPlaceLoading(true); setPlaceError(""); void read(`/api/food/places?purpose=food&limit=200&q=${encodeURIComponent(placeQuery)}`, { signal: controller.signal }).then(response => { if (!response.ok) throw new Error(); return response.json() as Promise<FoodPlace[]>; }).then(items => setPlaces(current => [...new Map([...current, ...items].map(item => [item.id, item])).values()])).catch(error => { if (error.name !== "AbortError") setPlaceError("店铺加载失败，请重试"); }).finally(() => { if (!controller.signal.aborted) setPlaceLoading(false); }); }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [placeQuery, placeAttempt,previewOnly,read,local]);
  const placeOptions = [...new Map([...(record?.foodPlaceId && record.foodPlaceName ? [{ id: record.foodPlaceId, name: record.foodPlaceName }] : []),...sourceOptions, ...(chosen?.placeId?[{id:chosen.placeId,name:chosen.placeName}]:[]), ...places.map(place=>({id:place.id,name:place.name,detail:[place.city,place.branch].filter(Boolean).join(" · ")}))].map(place=>[place.id,place])).values()];
  const sourceName=(id?:number|null)=>id?(placeOptions.find(place=>place.id===id)?.name??`Place #${id}`):"";
  function removeSelectedFood(dishId: number | null, libraryId?: number | null){
    const ids=dishId===null?draft.foodDishIds:draft.foodDishIds.filter(id=>id!==dishId);
    const dishes=selectedDishes.filter(dish=>ids.includes(dish.id));
    const keepReference=libraryId&&dishes.some(dish=>dish.foodLibraryId===libraryId);
    updateSelection(ids,libraryId&&!keepReference?consumptions.filter(item=>item.foodLibraryId!==libraryId):consumptions,dishes);
  }
  function recordFreeName(name:string){
    if(!name)return;
    automaticTitle.current=null;
    setDraft(current=>({...current,title:hasSelectedFoods&&current.title.trim()?`${current.title} + ${name}`.slice(0,200):name}));
    setBrowseQuery("");
  }
  function selectItem(item:FoodCatalogItem){
    const duplicateDish=item.menu && draft.foodDishIds.includes(item.menu.id);
    const duplicateFood=item.library && consumptions.some(value=>value.foodLibraryId===item.library!.id);
    if(duplicateDish || (!item.menu && duplicateFood)){setBrowseQuery("");setError("该食物已添加，可修改已有食用量");return;}
    if((item.menu && draft.foodDishIds.length>=50)||(!duplicateFood && item.library && consumptions.length>=50)){setError("一条记录最多关联 50 道菜品和 50 项食品");return;}
    setError("");setChosen(item);setBrowseQuery("");
    if(item.placeId)setSourceOptions(current=>[...current.filter(place=>place.id!==item.placeId),{id:item.placeId!,name:item.placeName}]);
    const consumption=item.library?preserveReference(consumptionFromItem(item.library)):null;
    if(consumption && item.servingKcal!==null){consumption.quantity=1;consumption.unit="serving";consumption.calculatedKcal=calculateFoodKcal(consumption.nutritionReference!,1,"serving");}
    const items=consumption&&!duplicateFood?[...consumptions,consumption]:consumptions;
    const ids=item.menu?[...draft.foodDishIds,item.menu.id]:draft.foodDishIds;
    const dishes=item.menu?[...selectedDishes,{id:item.menu.id,name:item.name,foodLibraryId:item.library?.id,foodPlaceId:item.placeId??undefined}]:selectedDishes;
    updateSelection(ids,items,dishes,draft.foodPlaceId,!hasSelectedFoods&&draft.title===browseQuery);
    if(!consumptions.length && items.length && !draft.estimatedKcal)setKcalMode("auto");
  }

  // Each nutrition snapshot belongs to one visible row, even when menus share it.
  const portionOwners = new Map<number, number>();
  for (const dish of selectedDishes) {
    if (dish.foodLibraryId && !portionOwners.has(dish.foodLibraryId)) portionOwners.set(dish.foodLibraryId, dish.id);
  }
  const selectedFoods = [
    ...draft.foodDishIds.map(id => {
      const dish = selectedDishes.find(item => item.id === id);
      const libraryId = dish?.foodLibraryId;
      const shared = Boolean(libraryId && portionOwners.get(libraryId) !== id && consumptions.some(item => item.foodLibraryId === libraryId));
      return { key: `dish:${id}`, dishId: id, libraryId, shared, name: dish?.name ?? `菜品 #${id}`, source: sourceName(dish?.foodPlaceId) };
    }),
    ...consumptions.filter(item => !portionOwners.has(item.foodLibraryId)).map(item => ({
      key: `library:${item.foodLibraryId}`, dishId: null, libraryId: item.foodLibraryId, shared: false,
      name: item.item?.name ?? `食品 #${item.foodLibraryId}`, source: sourceName(item.item?.foodPlaceId),
    })),
  ];
  const unlinkedDishes = selectedFoods.filter(food => food.dishId !== null && !consumptions.some(item => item.foodLibraryId === food.libraryId)).length;
  const incomplete = uncalculated + unlinkedDishes;
  const calorieSummary = kcalMode === "manual" && estimatedKcal
    ? `${english ? "Manual estimate" : "手动估算"} ${displayCalories(Number(estimatedKcal))}`
    : kcalMode === "auto" && calculatedTotal !== null
      ? `${t(unlinkedDishes ? "食品库热量" : "热量合计")} ${displayCalories(calculatedTotal)}`
      : kcalMode === "auto" && partialTotal !== null
        ? `${t("已计算")} ${displayCalories(partialTotal)}`
        : t("尚未估算热量");
  function loadFoodReference(libraryItem: Parameters<typeof consumptionFromItem>[0]) {
    const loaded = consumptionFromItem(libraryItem);
    setConsumptions(items => items.map(item => item.foodLibraryId === libraryItem.id && !item.nutritionReference
      ? { ...loaded, quantity: item.quantity, unit: item.unit, calculatedKcal: calculateFoodKcal(loaded.nutritionReference!, item.quantity, item.unit) }
      : item));
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); if (previewOnly || saving) return; setSaving(true); setError("");
    try {
      const occurred = compactDateTimePayload(draft.occurredAt);
      const unchangedTime = record && draft.occurredAt === compactDateTimeValue(record.occurredAt, record.occurredHasExplicitTime ?? true);
      const body = { ...draft, title:draft.title.trim()||(!hasSelectedFoods?browseQuery.trim():""), rating: canRate(draft.scene) && draft.rating ? draft.rating : null, occurredAt: unchangedTime ? record.originalOccurredAt ?? record.occurredAt : occurred.value, occurredHasExplicitTime: unchangedTime ? record.originalHasExplicitTime ?? record.occurredHasExplicitTime ?? true : occurred.hasExplicitTime, estimatedKcal: draft.estimatedKcal ? Number(draft.estimatedKcal) : null, kcalMin: draft.kcalMin ? Number(draft.kcalMin) : null, kcalMax: draft.kcalMax ? Number(draft.kcalMax) : null, foodLibraryId:draft.foodLibraryId?Number(draft.foodLibraryId):null,foodPlaceId: draft.foodPlaceId ? Number(draft.foodPlaceId) : null, foodDishIds: draft.foodDishIds, imageUrl: record?.imageUrl ?? null, attachmentId: record?.attachmentId ?? null };
      const payload = { ...body, ...(caloriesChanged?{kcalMin:null,kcalMax:null}:{}), consumedWeightG: consumedWeight === "" ? null : Number(consumedWeight), separateMealWeight: true, foodLibraryId: consumptions[0]?.foodLibraryId ?? null, foodLibraryItems: consumptions.map(({ foodLibraryId, quantity, unit }) => ({ foodLibraryId, quantity, unit })), foodKcalMode: consumptions.length ? kcalMode : "manual", estimatedKcal: estimatedKcal ? Number(estimatedKcal) : null };
      const response = await businessFetch(record ? `/api/food/logs/${record.id}` : "/api/food/logs", { method: record ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) { setError(((await response.json()) as ApiError).error); return; }
      await onSaved(); showActionToast("饮食记录已保存"); try { await reconcileNativeNotifications(); } catch { /* Web Push remains the fallback. */ } onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "无法保存饮食记录"); } finally { setSaving(false); }
  }
  async function remove() {
    if (previewOnly || !record || !onDeleted || saving) return; setSaving(true); setError("");
    try { const response = await businessFetch(`/api/food/logs/${record.id}`, { method: "DELETE" }); if (!response.ok) throw new Error("无法删除这条饮食记录，请重试"); await onDeleted(); showActionToast("饮食记录已删除", "deleted"); try { await reconcileNativeNotifications(); } catch { /* Web Push remains the fallback. */ } onClose(); } finally { setSaving(false); }
  }
  return <FormSheet title={record ? "改饮食记录" : "补一条饮食"} onClose={onClose} formId="food-record-form" submitLabel={record ? "改好了" : "记下"} submitDisabled={previewOnly} busy={saving} busyLabel={record ? "正在修改…" : "正在保存…"}>
    <form id="food-record-form" className={`editor-card compact-editor field-focus-surface ${styles.editor}`} onSubmit={submit}>{previewOnly&&<FormPreviewNotice/>}
      <DateTimeField label="日期" value={{ date: draft.occurredAt.slice(0, 10), time: draft.occurredAt.length > 10 ? draft.occurredAt.slice(11, 16) : "" }} onChange={value => {
        setDraft({ ...draft, occurredAt: value.date + (value.time ? `T${value.time}` : ""), ...(!mealChosen.current && value.time ? { mealType: usualMeal(Number(value.time.slice(0, 2))) } : {}) });
      }} />
      {record?.calendarMeal && <p className="muted">时间来自日历：<span className="user-content">{record.calendarMeal.title}</span></p>}
      <div className={styles.foodSelection}>
      <FoodNameInput kind="food" label="吃了什么" placeholder={hasSelectedFoods ? "搜索并添加食物" : undefined} required={!hasSelectedFoods&&!draft.title.trim()} value={browseQuery} onSelect={selectItem} onRecord={recordFreeName} onValueChange={value=>{setBrowseQuery(value);if(!hasSelectedFoods){automaticTitle.current=null;setDraft({...draft,title:value});}}}/>
      {error && <ErrorNotice role="alert">{error}</ErrorNotice>}
      {(hasSelectedFoods || draft.title.trim()) && <div className={styles.foodGroup}>
        {hasSelectedFoods && <ul className={styles.selectedFoods} aria-label={t("已选食物")}>
          {selectedFoods.map(food => {
            const index = food.shared ? -1 : consumptions.findIndex(item => item.foodLibraryId === food.libraryId);
            return <FoodConsumptionFields key={food.key} name={food.name} source={food.source} value={consumptions[index]} placeId={draft.foodPlaceId} dish={food.dishId !== null} shared={food.shared}
              onChange={value => changeConsumption(index, value)} onLoaded={loadFoodReference} onRemove={() => removeSelectedFood(food.dishId, food.libraryId)} />;
          })}
        </ul>}
        <div className={styles.energy}>
          <output aria-live="polite">
            <strong>{calorieSummary}</strong>
            {kcalMode === "auto" && incomplete > 0 && <small>{english ? `${incomplete} not counted` : `还有 ${incomplete} 项未计入`}</small>}
          </output>
          <button type="button" className="text-button" aria-expanded={editingCalories} onClick={() => setEditingCalories(!editingCalories)}>{t(editingCalories ? "收起" : kcalMode === "manual" && estimatedKcal ? "修改热量" : "手动估算")}</button>
          {editingCalories && <div className={styles.manualEnergy}>
            <label className="field"><span>热量估算 kcal</span><input type="number" inputMode="decimal" min="0" step="any" value={estimatedKcal} onChange={event => { setKcalMode("manual"); setCaloriesChanged(true); setDraft({ ...draft, estimatedKcal: event.target.value }); }} /></label>
            {consumptions.length > 0 && kcalMode === "manual" && <button type="button" className="text-button" data-form-change onClick={() => { setCaloriesChanged(true); setKcalMode("auto"); setEditingCalories(false); }}>{t("恢复自动计算")}</button>}
          </div>}
        </div>
      </div>}
      {(hasSelectedFoods || (draft.title && !browseQuery)) && <div className={styles.title}>
        {editingTitle ? <label className="field"><span>记录名称</span><input required autoFocus className="user-content" maxLength={200} value={draft.title} onChange={event=>{automaticTitle.current=null;setDraft({...draft,title:event.target.value});}}/></label>
          : <><span className="user-content">{draft.title}</span><button type="button" className="text-button" onClick={() => setEditingTitle(true)}>{t("改名")}</button></>}
      </div>}
      </div>
      <div className="field"><span>餐次</span><SearchableSelect label="餐次" searchable={false} value={draft.mealType} options={meals} onValueChange={value=>{mealChosen.current=true;setDraft({...draft,mealType:value as MealType});}}/></div>
      <div className="field"><span>场景</span><SearchableSelect label="场景" searchable={false} value={draft.scene} options={scenes} onValueChange={value=>{const scene=value as FoodScene;setDraft({...draft,scene,rating:canRate(scene)?draft.rating:""});}}/></div>
      {draft.foodPlaceId && !canRate(draft.scene) && <p className="muted">外卖或外食可补充本次口味评价。</p>}
      {canRate(draft.scene) && <div className="field"><span>评价</span><SearchableSelect label="评价" searchable={false} clearable value={draft.rating} options={TASTE_RATINGS.map(value=>({value,label:tasteLabels[value]}))} onValueChange={value=>setDraft({...draft,rating:value as TasteRating|""})}/></div>}
      <div className={styles.browser}><FoodLinkPicker label="用餐地点（可选）" options={placeOptions} selected={draft.foodPlaceId?[Number(draft.foodPlaceId)]:[]} loading={placeLoading} error={placeError} onRetry={()=>setPlaceAttempt(value=>value+1)} onSearch={setPlaceQuery} onChange={ids=>{setBrowseQuery("");setDraft({...draft,foodPlaceId:ids[0]?.toString()??""});}}/>
      </div>
      <label className="field"><span>明细 / 备注</span><textarea rows={3} maxLength={8000} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
      <Disclosure title={t("整餐实测重量")} trailing={consumedWeight ? `${consumedWeight} ${t("克")}` : undefined} defaultOpen={Boolean(consumedWeight)}>
        <label className="field"><span>{t("整餐实测重量（克）")}</span><input type="number" inputMode="decimal" min="0" max="1000000" step="0.01" value={consumedWeight} onChange={event => setConsumedWeight(event.target.value)} /></label>
      </Disclosure>
      {!previewOnly && record && onDeleted && <FoodDeleteAction label="删除这条饮食记录" description={`确定删除「${record.title}」？删除后无法恢复。`} onDelete={remove} disabled={saving} />}
    </form>
  </FormSheet>;
}

export { meals, scenes, tasteLabels };
