"use client";
import { PageLoading } from "@/components/page-loading";
import { useRememberedState } from "@/components/use-remembered-state";
import { useDataRefresh } from "@/components/use-data-refresh";
import { showActionToast } from "@/components/action-toast";

import { useCallback, useEffect, useState } from "react";
import { PageHeading as PageHeader } from "@/components/page-heading";
import {ErrorNotice} from "@/components/error-notice";
import {responseError} from "@/lib/response-error";
import {useFormPreview} from "@/components/form-preview";
import {useInboxData} from "@/components/inbox-data-context";
import { BottomLogScope } from "@/components/bottom-log-core";
import { Icon } from "@/components/icons";
import { useLocale } from "@/components/locale-controller";
import type { InboxItem, InboxStatus } from "@/lib/types";
import { InboxCaptureForm } from "./inbox-capture-form";

export function InboxView() {
  const { english } = useLocale();
  const {read,local}=useInboxData(),readonly=useFormPreview();
  const [error,setError]=useState("");
  const filters = [["inbox", english ? "Unsorted" : "没整理"], ["processed", english ? "Processed" : "处理过"], ["archived", english ? "Archived" : "归档"], ["all", english ? "All" : "全部"]] as const;
  const statusLabels: Record<InboxStatus, string> = { inbox: english ? "Unsorted" : "没整理", processed: english ? "Processed" : "处理过", archived: english ? "Archived" : "已归档" };
  const [items, setItems] = useState<InboxItem[]>([]);
  const [status, setStatus] = useRememberedState<InboxStatus | "all">("InboxView:status", "inbox");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async(signal?:AbortSignal)=>{
    setLoading(true);setError("");
    try{const response=await read(`/api/inbox?status=${status}`,{cache:"no-store",signal});if(!response.ok)throw new Error(await responseError(response,english?"Could not load Inbox. Try again.":"暂时无法读取 Inbox，请重试。"));const next=await response.json() as InboxItem[];if(!signal?.aborted)setItems(next);}
    catch(reason){if(!signal?.aborted)setError(reason instanceof Error?reason.message:"Could not load Inbox.");}
    finally{if(!signal?.aborted)setLoading(false);}
  },[status,read,english]);
  useDataRefresh("/inbox", () => load());


  useEffect(()=>{const controller=new AbortController();const timer=setTimeout(()=>void load(controller.signal),0);return()=>{clearTimeout(timer);controller.abort();};},[load]);

  async function patch(id:number,body:object){
    if(readonly)return;
    try{const response=await fetch(`/api/inbox/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});if(!response.ok)throw new Error(await responseError(response,"Could not update Inbox item."));await load();}
    catch(reason){setError(reason instanceof Error?reason.message:"Could not update Inbox item.");}
  }
  async function remove(id:number){
    if(readonly)return;
    if(!confirm(english?"Delete this temporary record?":"删掉这条临时记录？"))return;
    try{const response=await fetch(`/api/inbox/${id}`,{method:"DELETE"});if(!response.ok)throw new Error(await responseError(response,"Could not delete Inbox item."));await load();showActionToast(english?"Inbox item deleted":"Inbox 记录已删除","deleted");}
    catch(reason){setError(reason instanceof Error?reason.message:"Could not delete Inbox item.");}
  }

  return <div className="page inbox-page">
    <PageHeader eyebrow={english ? "SPACE" : "空间"} title="Inbox" />
    <BottomLogScope label={english ? "Capture Inbox" : "记下散落"} picker="inbox" onSaved={async () => { setStatus("inbox"); await load(); }} />
    {error&&<ErrorNotice>{error}</ErrorNotice>}
    <InboxCaptureForm onSaved={async()=>{setStatus("inbox");await load();}} />
    <div className="toolbar inbox-toolbar">
      <div className="segmented" aria-label={english ? "Inbox status filter" : "Inbox 状态筛选"}>{filters.map(([value, label]) => <button className={status === value ? "active" : ""} type="button" aria-pressed={status === value} onClick={() => setStatus(value)} key={value}>{label}</button>)}</div>
      <span className="result-count">{english ? `${items.length} ${items.length === 1 ? "entry" : "entries"}` : `${items.length} 条`}</span>
    </div>
    {local&&<p className="chronicle-scope">{english?"Downloaded Inbox only · up to 500 items":"仅显示已下载 Inbox · 最多500条"}</p>}
    {error&&<button className="text-button" onClick={()=>void load()}>{english?"Try again":"重试"}</button>}
    {loading && !items.length ? <PageLoading title="Inbox" englishTitle="Inbox" inline /> : items.length ? <div className="inbox-list" aria-busy={loading}>{items.map((item) => <article className="inbox-row" key={item.id}>
      <p className="user-content">{item.content}</p>
      <div className="inbox-row-footer">
        <div className="inbox-meta"><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString(english ? "en-US" : "zh-CN")}</time><span>{statusLabels[item.status]}</span>{item.convertedType && <span>{english ? "Converted from legacy" : "旧版已转为"} {item.convertedType}</span>}</div>
        <div className="row-actions">
          {item.status === "inbox" && <><button type="button" disabled={readonly} onClick={() => patch(item.id, { status: "processed" })}>{english ? "Mark processed" : "处理好了"}</button><button type="button" disabled={readonly} onClick={() => patch(item.id, { status: "archived" })}>{english ? "Archive" : "归档"}</button></>}
          {item.status !== "inbox" && <button type="button" disabled={readonly} onClick={() => patch(item.id, { status: "inbox" })}>{english ? "Move to unsorted" : "放回未整理"}</button>}
          <button className="danger inbox-delete" type="button" disabled={readonly} aria-label={english ? "Delete Inbox item" : "删除这条 Inbox"} title={english ? "Delete" : "删除"} onClick={() => remove(item.id)}><Icon name="trash" /></button>
        </div>
      </div>
    </article>)}</div> : <div className="empty-state"><span className="empty-icon"><Icon name="check" /></span><h2>{english ? "Inbox is empty" : "Inbox 为空"}</h2></div>}
  </div>;
}
