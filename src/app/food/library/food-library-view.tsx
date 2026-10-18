"use client";
import { ErrorNotice } from "@/components/error-notice";
import { useRememberedState } from "@/components/use-remembered-state";
import { useDataRefresh } from "@/components/use-data-refresh";
import { PageLogAction } from "@/components/bottom-log";
import { DRINK_TYPE_OPTIONS } from "@/lib/drink-types";
import type { DrinkType } from "@/lib/types";
import { FoodLinkPicker } from "../food-link-picker";
import type { FoodPlace } from "@/lib/types";
import { SearchableSelect } from "@/components/searchable-select";
import { SuggestedInput } from "@/components/suggested-input";
import { ToastNotice } from "@/components/action-toast";
import { PageLoading } from "@/components/page-loading";
import { FoodDeleteAction } from "../food-delete-action";
import { foodReferenceKcal } from "@/lib/food-calculation";
import { useLocale } from "@/components/locale-controller";
import { translateUiCopy } from "@/lib/ui-copy";
import styles from "./food-library.module.css";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { FormSheet } from "@/components/form-sheet";
import { PageHeader } from "@/components/page-header";
import type { ApiError, FoodCategory, FoodDataSource, FoodLibraryItem, FoodReferenceType } from "@/lib/types";

const empty = { foodPlaceId:"", name: "", brand: "", category: "other" as FoodCategory, drinkType: "" as Exclude<DrinkType,"water"> | "", defaultPortion: "", referenceType: "per_serving" as FoodReferenceType, referenceEnergyKj: "", referenceKcal: "", servingWeight: "", servingKcal: "", dataSource: "manual" as FoodDataSource, notes: "" };
type Draft = typeof empty;

const categoryLabels:Record<FoodCategory,string>={staple:"主食",dish:"菜品",snack:"零食",drink:"饮品",other:"其他"};
const sourceLabels:Record<FoodDataSource,string>={package_label:"包装营养表",official:"官方数据",estimated:"估算",manual:"手动填写"};

function draftFromItem(item: FoodLibraryItem): Draft {
  return {
    foodPlaceId: item.foodPlaceId?.toString()??"",
    name: item.name,
    brand: item.brand,
    category: item.category,
    drinkType: item.drinkType ?? "",
    defaultPortion: item.defaultPortion,
    referenceType: item.referenceType,
    referenceEnergyKj: item.referenceEnergyKj === null ? "" : String(item.referenceEnergyKj),
    referenceKcal: item.referenceKcal === null ? "" : String(item.referenceKcal),
    servingWeight: item.servingWeight === null ? "" : String(item.servingWeight),
    servingKcal: item.servingKcal === null ? "" : String(item.servingKcal),
    dataSource: item.dataSource,
    notes: item.notes,
  };
}

export function FoodLibraryView() {
  const {english}=useLocale();
  const t=(value:string)=>translateUiCopy(value,english?"en":"zh-CN");
  const [places,setPlaces]=useState<FoodPlace[]>([]),[placeQuery,setPlaceQuery]=useState("");
  useEffect(()=>{const controller=new AbortController();void fetch(`/api/food/places?limit=200&q=${encodeURIComponent(placeQuery)}`,{signal:controller.signal}).then(async response=>{if(response.ok)setPlaces(await response.json());}).catch(()=>undefined);return()=>controller.abort();},[placeQuery]);
  const [items, setItems] = useState<FoodLibraryItem[]>([]);
  const [query, setQuery] = useRememberedState("FoodLibraryView:query", "");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>(empty);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState("");
  const editingItem=items.find(item=>item.id===editingId);


  const load = useCallback(async (signal?:AbortSignal) => {
    setLoading(true);setLoadError("");
    try{
      const response = await fetch(`/api/food/library?q=${encodeURIComponent(query)}`,{signal});
      if(!response.ok)throw new Error("食品库加载失败，请重试");
      const next=await response.json() as FoodLibraryItem[];
      if(!signal?.aborted)setItems(next);
    }catch(reason){if(!signal?.aborted)setLoadError(reason instanceof Error?reason.message:"食品库加载失败，请重试");}
    finally{if(!signal?.aborted)setLoading(false);}
  }, [query]);
  useDataRefresh("/food/library", () => load());

  useEffect(() => { const controller=new AbortController();const timer = setTimeout(() => void load(controller.signal), 120); return () => {clearTimeout(timer);controller.abort();}; }, [load]);

  function openCreate() {
    setDraft(empty); setEditingId(null); setError(""); setNotice(""); setShowForm(true);
  }

  function openEdit(item: FoodLibraryItem) {
    setDraft(draftFromItem(item)); setEditingId(item.id); setError(""); setNotice(""); setShowForm(true);
  }

  function closeEditor() {
    setShowForm(false); setEditingId(null); setDraft(empty); setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); if (saving) return; setError(""); setNotice(""); setSaving(true);
    const optionalNumber = (value: string) => value ? Number(value) : null;
    const body = { ...draft, foodPlaceId:draft.foodPlaceId?Number(draft.foodPlaceId):null, drinkType: draft.category === "drink" ? draft.drinkType || null : null, referenceEnergyKj: optionalNumber(draft.referenceEnergyKj), referenceKcal: optionalNumber(draft.referenceKcal), servingWeight: optionalNumber(draft.servingWeight), servingKcal: optionalNumber(draft.servingKcal) };
    const editing = editingId;
    try{
      const response = await fetch(editing ? `/api/food/library/${editing}` : "/api/food/library", { method: editing ? "PATCH" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) { setError(((await response.json()) as ApiError).error); return; }
      closeEditor();setNotice(editing ? "食品已更新" : "食品已添加");await load();
    }catch(reason){setError(reason instanceof Error?reason.message:"无法保存食品，请重试");}
    finally{setSaving(false);}
  }

  async function remove(item: FoodLibraryItem) {
    if(saving)return;
    setSaving(true);setError("");setNotice("");
    try{
    const response = await fetch(`/api/food/library/${item.id}`, { method: "DELETE" });
    if (!response.ok) throw new Error(((await response.json()) as ApiError).error);
    const result = await response.json() as { action: "deleted" | "archived" };
    if(editingId===item.id)closeEditor();
    setNotice(result.action === "archived" ? "食品已归档，历史引用保持不变" : "食品已删除");
    await load();
    }finally{setSaving(false);}
  }

  return <div className="page food-library-page">
    <PageHeader eyebrow="Food & Drink" title="Food Library" description="常用食品与饮品的营养参考。" action={<PageLogAction label="添加食品" onClick={openCreate}><Icon name="plus" />添加食品</PageLogAction>} />

    {showForm && <FormSheet title={editingId ? "编辑食品" : "添加食品"} onClose={closeEditor} formId="food-library-form" submitLabel={editingId ? "保存修改" : "添加食品"} busy={saving}><form id="food-library-form" className={`editor-card compact-editor ${styles.editor}`} onSubmit={submit}>
      <section className={styles.formSection} aria-labelledby="library-identity"><h3 id="library-identity">食品信息</h3><div className="form-grid">
        <label className="field wide"><span>食品名称</span><input required maxLength={200} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
        <div className="field"><span>品牌（可选）</span><SuggestedInput recommendationStyle="search" suggestionLabel="品牌" suggestions={items.map(item => item.brand)} value={draft.brand} onValueChange={nextValue => setDraft({ ...draft, brand: nextValue })} placeholder="可不填" /></div>
        <div className="field"><span>品类</span><SearchableSelect label="品类" searchable={false} value={draft.category} onValueChange={(value) => setDraft({ ...draft, category: value as FoodCategory, drinkType: value === "drink" ? draft.drinkType : "" })} options={Object.entries(categoryLabels).map(([value,label])=>({value,label}))}/></div>
        {draft.category === "drink" && <div className="field"><span>饮品类型</span><SearchableSelect label="饮品类型" searchable={false} value={draft.drinkType} onValueChange={value=>setDraft({...draft,drinkType:value as Draft["drinkType"]})} options={[{value:"",label:"未分类"},...DRINK_TYPE_OPTIONS.map(([value,label])=>({value,label}))]}/></div>}
        <div className="field wide"><FoodLinkPicker label="归属店铺（通用食品留空）" options={places.map(place=>({id:place.id,name:place.name,detail:place.branch}))} selected={draft.foodPlaceId?[Number(draft.foodPlaceId)]:[]} onSearch={setPlaceQuery} onChange={ids=>setDraft({...draft,foodPlaceId:ids[0]?.toString()??""})}/></div>
      </div></section>
      <section className={styles.formSection} aria-labelledby="library-nutrition"><h3 id="library-nutrition">营养参考</h3><div className="form-grid">
        <div className="field wide"><span>热量基准</span><SearchableSelect label="热量基准" searchable={false} value={draft.referenceType} onValueChange={(value) => setDraft({ ...draft, referenceType: value as FoodReferenceType })} options={[{value:"per_serving",label:"每份"},{value:"per_100g",label:"每 100 克"},{value:"per_100ml",label:"每 100 毫升"}]}/></div>
        <div className="field wide"><span>默认份量</span><SuggestedInput recommendationStyle="chips" suggestionLabel="份量" suggestions={[...items.map(item => item.defaultPortion), "1 份", "1 碗", "1 个"]} value={draft.defaultPortion} onValueChange={nextValue => setDraft({ ...draft, defaultPortion: nextValue })} placeholder="例如：1 杯 / 35 克" /></div>
        <label className="field"><span>基准热量 kcal</span><input type="number" min={0} step="any" value={draft.referenceKcal} onChange={(event) => setDraft({ ...draft, referenceKcal: event.target.value })} /></label>
        <label className="field"><span>每份热量 kcal</span><input type="number" min={0} step="any" value={draft.servingKcal} onChange={(event) => setDraft({ ...draft, servingKcal: event.target.value })} /></label>
        <div className="field wide"><span>数据来源</span><SearchableSelect label="数据来源" searchable={false} value={draft.dataSource} onValueChange={(value) => setDraft({ ...draft, dataSource: value as FoodDataSource })} options={Object.entries(sourceLabels).map(([value,label])=>({value,label}))}/></div>
      </div></section>
      {error && <ErrorNotice role="alert">{error}</ErrorNotice>}
      {editingItem&&<FoodDeleteAction label="移除食品" description={`${t("确定移除")}「${draft.name}」？${t("有关联记录时会归档，历史记录保持不变。")}`} disabled={saving} onDelete={()=>remove(editingItem)}/>}
    </form></FormSheet>}

    {!showForm && error && <ErrorNotice>{error}</ErrorNotice>}
    {notice && <ToastNotice message={notice} onShown={() => setNotice("")} />}
    <div className={styles.content}><label className={`search-box ${styles.search}`}><Icon name="search" /><input type="search" aria-label={t("搜索食品名称或品牌")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("搜索食品名称或品牌")} /></label>
    <div className={styles.summary}><span role="status">{loading?t("正在加载…"):`${t("当前显示")} ${items.length} ${t("项")}`}</span>{query&&<button type="button" className="text-button" onClick={()=>setQuery("")}>清除搜索</button>}</div>
    {loadError&&<div className={styles.loadError} role="alert"><span>{t(loadError)}</span><button type="button" className="text-button" onClick={()=>void load()}>重试</button></div>}
    {loading&&!items.length?<PageLoading title="食品库" englishTitle="library" inline/>:items.length ? <ul className={styles.list} aria-label={t("食品列表")} aria-busy={loading}>{items.map((item) => {
      const kcal=item.servingKcal??foodReferenceKcal(item);
      const basis=item.servingKcal!==null||item.referenceType==="per_serving"?"每份":item.referenceType==="per_100g"?"每 100 克":"每 100 毫升";
      const owner=places.find(place=>place.id===item.foodPlaceId);
      const context=[item.brand,t(categoryLabels[item.category]),item.foodPlaceId?(owner?[owner.name,owner.branch].filter(Boolean).join(" · "):t("店铺食品")):""].filter(Boolean).join(" · ");
      return <li className={styles.row} key={item.id}>
        <button type="button" className={styles.copy} disabled={saving} onClick={() => openEdit(item)} aria-label={`${t("编辑食品")} ${item.name}`}>
          <span className={styles.identity}><strong className="user-content">{item.name}</strong><span className={`user-content ${styles.meta}`}>{context}</span>{item.defaultPortion&&<span className={`user-content ${styles.portion}`}>{item.defaultPortion}</span>}</span>
          <span className={styles.energy}>{kcal!==null?<><strong>{Number(kcal.toFixed(1))}<span> kcal</span></strong><small>{t(basis)}</small></>:<small>{t("未填热量")}</small>}{item.dataSource==="estimated"&&<small className={styles.estimate}>{t("估算")}</small>}</span>
        </button>
        <button type="button" className={styles.editButton} disabled={saving} aria-label={`${t("编辑食品")} ${item.name}`} onClick={() => openEdit(item)}><Icon name="edit" /></button>
        <FoodDeleteAction iconOnly className={styles.rowDelete} label={`${t("移除食品")} ${item.name}`} description={`${t("确定移除")}「${item.name}」？${t("有关联记录时会归档，历史记录保持不变。")}`} disabled={saving} onDelete={()=>remove(item)}/>
      </li>;
    })}</ul> : !loadError&&<div className={`empty-state compact-empty ${styles.empty}`}><Icon name="foodLibrary"/><h2>{query ? "没有匹配的食品" : "食品库还是空的"}</h2><p>{query?"试试其他名称或品牌。":"添加常用食品，记录时就能直接选择。"}</p><button type="button" className="button secondary" onClick={query?()=>setQuery(""):openCreate}>{query?"清除搜索":"添加食品"}</button></div>}</div>
    <Link className={`section-link ${styles.back}`} href="/food-drink">返回 Food & Drink <Icon name="arrow" /></Link>
  </div>;
}
