"use client";
import {useBusinessRequest} from "@/components/business-request-context";
import { useRememberedState } from "@/components/use-remembered-state";
import { useDataRefresh } from "@/components/use-data-refresh";

import Link from "next/link";
import {DrinkRecordsView} from "@/components/drink-records-view";
import { useCallback, useEffect, useState } from "react";
import { BottomLogScope } from "@/components/bottom-log";
import type { DrinkLog, DrinkType } from "@/lib/types";
import { DrinkRecordEditor } from "../drink-ui";

export function DrinkHistoryView(){
  const businessFetch=useBusinessRequest();

  const[logs,setLogs]=useState<DrinkLog[]>([]);const[query,setQuery]=useRememberedState("DrinkHistoryView:query", "");const[type,setType]=useRememberedState<DrinkType|"">("DrinkHistoryView:type", "");const[editing,setEditing]=useState<DrinkLog>();
  const load=useCallback(async()=>{const params=new URLSearchParams();if(query.trim())params.set("q",query.trim());if(type)params.set("drinkType",type);const recordsResponse=await businessFetch(`/api/drinks/logs?${params}`);if(recordsResponse.ok)setLogs(await recordsResponse.json());},[query,type,businessFetch]);
  useDataRefresh("/drinks/history", () => load());

  useEffect(()=>{const timer=setTimeout(()=>void load(),query?150:0);return()=>clearTimeout(timer);},[load,query]);
  return <DrinkRecordsView logs={logs} query={query} setQuery={setQuery} type={type} setType={setType} onOpen={setEditing} LinkComponent={Link} logScope={<BottomLogScope label="记录饮品" picker="drink" onSaved={load}/>} editor={editing&&<DrinkRecordEditor record={editing} onClose={()=>setEditing(undefined)} onSaved={load} onDeleted={load}/>}/>;
}
