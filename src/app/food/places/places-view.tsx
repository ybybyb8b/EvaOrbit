"use client";
import { PageLoading } from "@/components/page-loading";
import { useRememberedState } from "@/components/use-remembered-state";
import { useDataRefresh } from "@/components/use-data-refresh";
import { PageLogAction } from "@/components/bottom-log";
import { SearchableSelect } from "@/components/searchable-select";
import styles from "./places-filter.module.css";
import { PlacesCascader } from "./places-cascader";
import { FoodDeleteAction } from "../food-delete-action";
import { showActionToast } from "@/components/action-toast";

import { placeServiceLabels, placeKindLabels, placeScopeLabels } from "@/lib/place-menu";
import type { FoodPlace as PlaceType } from "@/lib/types";
import Link from "next/link";
import { FormEvent,useCallback,useEffect,useState } from "react";
import { FormSheet } from "@/components/form-sheet";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { PlaceSuggestionFields } from "./place-location-fields";
import type { ApiError,FoodPlace,FoodPlaceStatus,TasteRating } from "@/lib/types";

const ratingLabels:Record<TasteRating,string>={love:"喜欢",good:"还不错",neutral:"一般",dislike:"避雷"};
const statusLabels:Record<FoodPlaceStatus,string>={frequent:"正常",occasional:"正常",paused:"暂时不去",avoid:"避雷",closed:"已关闭"};
const empty={kind:"restaurant" as FoodPlace["kind"],scope:"branch" as FoodPlace["scope"],address:"",serviceType:"food" as PlaceType["serviceType"],name:"",branch:"",city:"",location:"",category:"",rating:"" as TasteRating|"",status:"occasional" as FoodPlaceStatus,notes:""};
const filterLabels={kind:"来源类型",scope:"地点范围",serviceType:"店铺类型",category:"品类",city:"城市",status:"状态",rating:"评价"};
type FilterKind=keyof typeof filterLabels|"";

export function FoodPlacesView(){
  const[editingId,setEditingId]=useState<number|null>(null);
  function closeEditor(){setShowForm(false);setEditingId(null);setDraft(empty);setError("");}
  function openCreate(){setEditingId(null);setDraft(empty);setError("");setShowForm(true);}
  function openEdit(place:FoodPlace){
    setEditingId(place.id);setDraft({kind:place.kind??"restaurant",scope:place.scope??"branch",address:place.address??"",serviceType:place.serviceType??"food",name:place.name,branch:place.branch,city:place.city??"",location:place.location??"",category:place.category,rating:place.rating??"",status:place.status==="frequent"?"occasional":place.status,notes:place.notes});setError("");setShowForm(true);
  }
  const[items,setItems]=useState<FoodPlace[]>([]),[query,setQuery]=useRememberedState("FoodPlacesView:query", ""),[showForm,setShowForm]=useState(false),[draft,setDraft]=useState(empty),[saving,setSaving]=useState(false),[error,setError]=useState("");
  const[filterKind,setFilterKind]=useRememberedState<FilterKind>("FoodPlacesView:filterKind", ""),[filterValue,setFilterValue]=useRememberedState("FoodPlacesView:filterValue", ""),[candidates,setCandidates]=useState<FoodPlace[]>([]),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState("");
  const load=useCallback(async(signal?:AbortSignal)=>{setLoading(true);setLoadError("");try{const params=new URLSearchParams({q:query,limit:"200"});if(filterKind&&filterValue)params.set(filterKind,filterValue);const response=await fetch(`/api/food/places?${params}`,{signal});if(!response.ok)throw new Error("店铺加载失败，请重试");const next=await response.json();if(!signal?.aborted)setItems(next);}catch(reason){if(!signal?.aborted)setLoadError(reason instanceof Error?reason.message:"店铺加载失败，请重试");}finally{if(!signal?.aborted)setLoading(false);}},[query,filterKind,filterValue]);
  useDataRefresh("/food/places", () => load());
  const loadCandidates=useCallback(async(signal?:AbortSignal)=>{try{const response=await fetch("/api/food/places?limit=200",{signal});if(response.ok){const next=await response.json();if(!signal?.aborted)setCandidates(next);}}catch{/* Optional candidate lists do not block type, rating or status filters. */}},[]);
  useEffect(()=>{const controller=new AbortController();const timer=setTimeout(()=>void load(controller.signal),120);return()=>{clearTimeout(timer);controller.abort();};},[load]);
  useEffect(()=>{const controller=new AbortController();const timer=setTimeout(()=>void loadCandidates(controller.signal),0);return()=>{clearTimeout(timer);controller.abort();};},[loadCandidates]);
  const groups=Object.entries(filterLabels).map(([key,label])=>({value:key,label,children:key==="kind"?Object.entries(placeKindLabels).map(([value,label])=>({value,label})):key==="scope"?Object.entries(placeScopeLabels).map(([value,label])=>({value,label})):key==="serviceType"?Object.entries(placeServiceLabels).map(([value,label])=>({value,label})):key==="status"?Object.entries(statusLabels).filter(([value])=>value!=="frequent"&&value!=="occasional").map(([value,label])=>({value,label})):key==="rating"?[...Object.entries(ratingLabels).map(([value,label])=>({value,label})),{value:"unrated",label:"未评价"}]:[...new Set(candidates.map(place=>place[key as "category"|"city"]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"zh-CN")).map(value=>({value,label:value}))}));
  const filtered=Boolean(query.trim()||filterKind&&filterValue);
  async function submit(event:FormEvent){
    event.preventDefault();if(saving)return;setSaving(true);setError("");
    try{const response=await fetch(editingId?`/api/food/places/${editingId}`:"/api/food/places",{method:editingId?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...draft,rating:draft.rating||null})});if(!response.ok){setError(((await response.json())as ApiError).error);return;}closeEditor();await Promise.all([load(),loadCandidates()]);}
    catch(reason){setError(reason instanceof Error?reason.message:"无法保存店铺，请重试");}finally{setSaving(false);}
  }
  async function removePlace(place:FoodPlace){
    if(saving)return;setSaving(true);
    try{const response=await fetch(`/api/food/places/${place.id}`,{method:"DELETE"});if(!response.ok)throw new Error("无法删除店铺，请重试");const result=await response.json() as {action:"deleted"|"archived"};showActionToast(result.action==="archived"?"店铺已归档并标记为已关闭，历史记录保持不变":"店铺已删除",result.action==="archived"?"success":"deleted");await Promise.all([load(),loadCandidates()]);}finally{setSaving(false);}
  }
  return <div className="page food-places-page"><PageHeader eyebrow="Food & Drink" title="店铺库" description="餐饮、饮品、零售与自制，共用一个来源库。" action={<PageLogAction label="新增店铺" onClick={openCreate}><Icon name="plus"/>新增店铺</PageLogAction>}/>
    <div className={styles.toolbar}><label className="search-box food-place-search"><Icon name="search"/><input aria-label="搜索店铺" value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜索店名、城市、地点或品类…"/></label><PlacesCascader groups={groups} kind={filterKind} value={filterValue} onChange={(kind,value)=>{setFilterKind(kind as FilterKind);setFilterValue(value);}}/></div><div className={styles.summary}>{filterKind&&filterValue&&<span className={styles.selection}>{filterLabels[filterKind]} → {groups.find(group=>group.value===filterKind)?.children.find(child=>child.value===filterValue)?.label??filterValue}</span>}<span role="status">{loading && !items.length ? "" : `显示 ${items.length} 家`}</span>{(filterKind||query)&&<button className="text-button" onClick={()=>{setFilterKind("");setFilterValue("");setQuery("");}}>清除筛选</button>}</div>
    {loadError?<div className="form-error" role="alert">{loadError}<button className="text-button" onClick={()=>void load()}>重试</button></div>:loading?<PageLoading title="店铺" englishTitle="places" inline />:items.length?<div className="food-place-list">{items.map(place=><article className={`food-place-row ${styles.placeRow}`} key={place.id}><Link href={`/food/places/${place.id}`} className={styles.placeLink}><span className="food-place-main"><strong>{place.name}</strong>{(place.scope??"branch")==="branch"&&(place.city||place.branch)&&<span className="food-place-location">{[place.city,place.branch].filter(Boolean).join(" · ")}</span>}<span className="food-place-meta">{[placeKindLabels[place.kind??"restaurant"],placeScopeLabels[place.scope??"branch"],placeServiceLabels[place.serviceType??"food"],place.category,place.rating?ratingLabels[place.rating]:"",statusLabels[place.status]].filter(Boolean).join(" · ")}</span></span><span className="food-place-stats"><small>{place.lastVisitedAt?`最近 ${new Date(place.lastVisitedAt).toLocaleDateString("zh-CN")}`:"还没有关联记录"}</small><small>累计关联 {place.frequency??place.visitCount} 次</small><small>{place.serviceType!=="drink"&&`吃过 ${place.foodVisitCount??place.visitCount} 次`}{place.serviceType==="both"&&" · "}{place.serviceType!=="food"&&`喝过 ${place.drinkVisitCount??0} 次`}</small></span></Link><button type="button" className={styles.editButton} disabled={saving} aria-label={`编辑 ${place.name}`} onClick={()=>openEdit(place)}><Icon name="edit"/></button><FoodDeleteAction iconOnly className={styles.rowDelete} label={`删除或归档店铺 ${place.name}`} description={`确定删除「${place.name}」？有关联饮食或饮品记录时会归档并标记为已关闭，历史记录会保留；否则永久删除。`} onDelete={()=>removePlace(place)} disabled={saving}/></article>)}</div>:<div className="empty-state compact-empty"><h2>{filtered?"没有找到匹配店铺":"店铺库还是空的"}</h2><p>{filtered?"试试其他筛选值，或清除筛选后重新搜索。":"先记下一家你愿意再去的店。"}</p></div>}
    <Link className="section-link" href="/food-drink">返回 Food & Drink <Icon name="arrow"/></Link>
    {showForm&&<FormSheet title={editingId?"编辑店铺":"新增店铺"} onClose={closeEditor} formId="food-place-create-form" submitLabel="保存店铺" busy={saving}><form id="food-place-create-form" className="editor-card compact-editor" onSubmit={submit}><div className="form-grid"><label className="field"><span>店铺名称</span><input required autoFocus value={draft.name} onChange={event=>setDraft({...draft,name:event.target.value})}/></label><PlaceSuggestionFields values={draft} onChange={patch=>setDraft({...draft,...patch})}/><div className="field"><span>总体评价</span><SearchableSelect label="总体评价" searchable={false} value={draft.rating} onValueChange={(value) =>setDraft({...draft,rating:value as TasteRating|""})} options={[{value:"",label:"未评价"},...Object.entries(ratingLabels).map(([value,label])=>({value:value,label:label}))]}/></div><div className="field"><span>状态</span><SearchableSelect label="状态" searchable={false} value={draft.status} onValueChange={(value) =>setDraft({...draft,status:value as FoodPlaceStatus})} options={[...Object.entries(statusLabels).filter(([value])=>value!=="frequent").map(([value,label])=>({value:value,label:label}))]}/></div><label className="field wide"><span>备注</span><textarea rows={4} value={draft.notes} onChange={event=>setDraft({...draft,notes:event.target.value})}/></label></div>{error&&<p className="form-error">{error}</p>}</form></FormSheet>}
  </div>;
}
