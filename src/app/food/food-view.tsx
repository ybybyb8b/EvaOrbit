"use client";
import {useBusinessRequest} from "@/components/business-request-context";
import { useRememberedState } from "@/components/use-remembered-state";
import { useDataRefresh } from "@/components/use-data-refresh";
import { PageLogAction } from "@/components/bottom-log";

import {FoodSourceLinks} from "./food-source-links";
import {FoodRecordsView} from "@/components/food-records-view";
import { useCallback,useEffect,useState } from "react";
import { Icon } from "@/components/icons";
import type { FoodLog } from "@/lib/types";
import { subscribeDataChanged } from "@/lib/data-changed";
import { FoodRecordEditor, meals } from "./food-record-editor";


export function FoodView({initialDate,initialMealType}:{initialDate?:string;initialMealType?:string}={}){
  const businessFetch=useBusinessRequest();

  const today=new Date().toLocaleDateString("en-CA");const[date,setDate]=useRememberedState("FoodView:date", initialDate??today);const[mealFilter,setMealFilter]=useRememberedState("FoodView:mealFilter", meals.some(meal=>meal.value===initialMealType)?initialMealType!:"");const[query,setQuery]=useRememberedState("FoodView:query", "");const[logs,setLogs]=useState<FoodLog[]>([]);const[editing,setEditing]=useState<FoodLog>();const[showForm,setShowForm]=useState(false);
  const load=useCallback(async()=>{const params=new URLSearchParams({date});if(mealFilter)params.set("mealType",mealFilter);if(query)params.set("q",query);const recordsResponse=await businessFetch(`/api/food/logs?${params}`);if(recordsResponse.ok)setLogs(await recordsResponse.json());},[date,mealFilter,query,businessFetch]);
  useDataRefresh("/food", () => load());

  useEffect(()=>{const timer=setTimeout(()=>void load(),query?120:0);return()=>clearTimeout(timer);},[load,query]);
  useEffect(()=>subscribeDataChanged(["calendar"],()=>{void load();}),[load]);
  function edit(item:FoodLog){setEditing(item);setShowForm(true);}
  return <FoodRecordsView date={date} setDate={setDate} query={query} setQuery={setQuery} mealFilter={mealFilter} setMealFilter={setMealFilter} logs={logs} onOpen={edit} renderSources={log=><FoodSourceLinks record={log}/>} action={<PageLogAction label="Add record" className="button primary" onClick={()=>{setEditing(undefined);setShowForm(true);}}><Icon name="plus"/>新增记录</PageLogAction>} editor={showForm&&<FoodRecordEditor date={date} record={editing} initialMealType={meals.find(meal=>meal.value===mealFilter)?.value} onClose={()=>setShowForm(false)} onSaved={load} onDeleted={load}/>}/>;
}
