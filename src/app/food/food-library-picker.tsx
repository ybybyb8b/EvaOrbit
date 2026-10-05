"use client";
import { useEffect, useEffectEvent, useState } from "react";
import { SearchableSelect } from "@/components/searchable-select";
import type { FoodLibraryItem } from "@/lib/types";

export function FoodLibraryPicker({ value, onChange, onLoaded, selectedItem, label = "Food Library 食品（可选）" }: { value: string; onChange: (id: string, item?: FoodLibraryItem) => void; onLoaded?: (item: FoodLibraryItem) => void; selectedItem?: { id: number; name: string; brand: string }; label?: string }) {
  const loaded = useEffectEvent((item: FoodLibraryItem) => onLoaded?.(item));
  const [items,setItems]=useState<FoodLibraryItem[]>([]),[query,setQuery]=useState(""),[loading,setLoading]=useState(false),[error,setError]=useState(""),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    const timer=setTimeout(()=>{setLoading(true);setError("");void Promise.all([fetch(`/api/food/library?q=${encodeURIComponent(query)}`,{signal:controller.signal}),...(value?[fetch(`/api/food/library/${value}`,{signal:controller.signal})]:[])])
      .then(async responses=>{if(!responses[0].ok)throw new Error("食品库加载失败，请重试");const list=await responses[0].json() as FoodLibraryItem[];const selected=responses[1]?.ok?await responses[1].json() as FoodLibraryItem:null;if(!controller.signal.aborted){setItems([...new Map([...list,...(selected?[selected]:[])].map(item=>[item.id,item])).values()]);if(selected)loaded(selected);}})
      .catch(reason=>{if(!controller.signal.aborted)setError(reason.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});},150);
    return()=>{clearTimeout(timer);controller.abort();};
  },[query,value,attempt]);
  return <div className="field"><span>{label}</span><SearchableSelect label={label} value={value} onValueChange={id=>onChange(id,items.find(item=>String(item.id)===id))} options={[{value:"",label:"未关联食品"},...(selectedItem&&!items.some(item=>item.id===selectedItem.id)?[{value:String(selectedItem.id),label:selectedItem.name,detail:selectedItem.brand}]:[]),...items.map(item=>({value:String(item.id),label:item.name,detail:[item.brand,item.archivedAt?"已归档":""].filter(Boolean).join(" · "),disabled:Boolean(item.archivedAt&&String(item.id)!==value)}))]} onSearch={setQuery} loading={loading} error={error} onRetry={()=>setAttempt(value=>value+1)}/></div>;
}
