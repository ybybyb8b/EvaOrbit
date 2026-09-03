"use client";

import Link from "next/link";
import { FormEvent,useCallback,useEffect,useMemo,useState } from "react";
import { FormSheet } from "@/components/form-sheet";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import type { ApiError,FoodPlace,FoodPlaceStatus,TasteRating } from "@/lib/types";

const ratingLabels:Record<TasteRating,string>={love:"喜欢",good:"还不错",neutral:"一般",dislike:"避雷"};
const statusLabels:Record<FoodPlaceStatus,string>={frequent:"常吃",occasional:"偶尔吃",paused:"暂时不点",avoid:"避雷",closed:"已关闭"};
const empty={name:"",branch:"",category:"",rating:"" as TasteRating|"",status:"occasional" as FoodPlaceStatus,notes:""};

export function FoodPlacesView(){
  const[items,setItems]=useState<FoodPlace[]>([]),[query,setQuery]=useState(""),[showForm,setShowForm]=useState(false),[draft,setDraft]=useState(empty),[saving,setSaving]=useState(false),[error,setError]=useState("");
  const load=useCallback(async()=>{const response=await fetch(`/api/food/places?q=${encodeURIComponent(query)}`);if(response.ok)setItems(await response.json());},[query]);
  useEffect(()=>{const timer=setTimeout(()=>void load(),120);return()=>clearTimeout(timer);},[load]);
  const categories=useMemo(()=>[...new Set(["米线","川菜","咖啡","甜品","快餐",...items.map(item=>item.category).filter(Boolean)])],[items]);
  async function submit(event:FormEvent){event.preventDefault();if(saving)return;setSaving(true);setError("");const response=await fetch("/api/food/places",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...draft,rating:draft.rating||null})});setSaving(false);if(!response.ok){setError(((await response.json())as ApiError).error);return;}setShowForm(false);setDraft(empty);await load();}
  return <div className="page food-places-page"><PageHeader eyebrow="FOOD" title="店铺库" description="长期留下值得吃的店，以及店里真正好吃的菜。" action={<button className="button primary" onClick={()=>setShowForm(true)}><Icon name="plus"/>新增店铺</button>}/>
    <label className="search-box food-place-search"><Icon name="search"/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜索店铺、分店或品类…"/></label>
    {items.length?<div className="food-place-list">{items.map(place=><Link href={`/food/places/${place.id}`} className="food-place-row" key={place.id}><span className="food-place-main"><strong>{place.name}{place.branch&&<small> · {place.branch}</small>}</strong><span>{[place.category,place.rating?ratingLabels[place.rating]:"",statusLabels[place.status]].filter(Boolean).join(" · ")}</span></span><span className="food-place-stats"><small>{place.lastVisitedAt?`最近 ${new Date(place.lastVisitedAt).toLocaleDateString("zh-CN")}`:"还没有关联记录"}</small><small>{place.dishCount} 道菜</small></span><Icon name="arrow"/></Link>)}</div>:<div className="empty-state compact-empty"><h2>{query?"没有找到匹配店铺":"店铺库还是空的"}</h2><p>{query?"换个店名、分店或品类试试。":"先记下一家你愿意再吃的店。"}</p></div>}
    <Link className="section-link" href="/food">返回 Food <Icon name="arrow"/></Link>
    {showForm&&<FormSheet title="新增店铺" onClose={()=>{setShowForm(false);setError("");}} formId="food-place-create-form" submitLabel="保存店铺" busy={saving}><form id="food-place-create-form" className="editor-card compact-editor" onSubmit={submit}><div className="form-grid"><label className="field"><span>店铺名称</span><input required autoFocus value={draft.name} onChange={event=>setDraft({...draft,name:event.target.value})}/></label><label className="field"><span>分店 / 门店</span><input value={draft.branch} onChange={event=>setDraft({...draft,branch:event.target.value})} placeholder="例如：天府和悦店"/></label><label className="field"><span>品类</span><input list="food-place-categories" value={draft.category} onChange={event=>setDraft({...draft,category:event.target.value})} placeholder="自由输入"/><datalist id="food-place-categories">{categories.map(value=><option value={value} key={value}/>)}</datalist></label><label className="field"><span>总体评价</span><select value={draft.rating} onChange={event=>setDraft({...draft,rating:event.target.value as TasteRating|""})}><option value="">未评价</option>{Object.entries(ratingLabels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label><label className="field"><span>状态</span><select value={draft.status} onChange={event=>setDraft({...draft,status:event.target.value as FoodPlaceStatus})}>{Object.entries(statusLabels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label><label className="field wide"><span>备注</span><textarea rows={4} value={draft.notes} onChange={event=>setDraft({...draft,notes:event.target.value})}/></label></div>{error&&<p className="form-error">{error}</p>}</form></FormSheet>}
  </div>;
}
