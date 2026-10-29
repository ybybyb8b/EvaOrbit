"use client";
import {ErrorNotice} from "./error-notice";
import {responseError} from "@/lib/response-error";
import {useBusinessRequest} from "@/components/business-request-context";

import type { ComponentType } from "react";
import type { HomeLinkProps } from "./home-calendar-timeline";
const PlainLink=(props:HomeLinkProps)=><a {...props}/>;
import { ArrowDown5 } from "reicon-react";
import { useEffect, useState } from "react";
import { subscribeDataChanged } from "@/lib/data-changed";
import type { DueReminder } from "@/lib/types";
import { reconcileNativeNotifications } from "@/lib/native-bridge";
import { useLocale } from "./locale-controller";
import { playNativeHaptic } from "@/lib/native-haptics";

function dueLabel(item:DueReminder){if(item.overdueMs<60_000)return"Now";const days=Math.floor(item.overdueMs/86_400_000);if(days>0)return`${days} ${days===1?"day":"days"} overdue`;return"Today";}

export function useDueReminderActions(items:DueReminder[],readOnly:boolean,onChanged?:()=>void){
  const businessFetch=useBusinessRequest();
  const [error,setError]=useState("");
  const [busy,setBusy]=useState<number|null>(null);const [snoozing,setSnoozing]=useState<number|null>(null);const [dismissed,setDismissed]=useState<number[]>([]);const [promoted,setPromoted]=useState<number|null>(null);const remaining=items.filter(item=>!dismissed.includes(item.id));
  useEffect(() => subscribeDataChanged(["tasks", "reminders"], () => setDismissed([])), []);

  async function action(id:number,name:"complete"|"skip"|"snooze",body?:unknown){
    if(readOnly||busy!==null)return;setBusy(id);setError("");
    try{const response=await businessFetch(`/api/reminders/${id}/${name}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body??{})});
      if(!response.ok)throw new Error(await responseError(response,"Could not update reminder."));
      playNativeHaptic(name==="complete"?"success":"selection");setSnoozing(null);if(id===remaining[0]?.id)setPromoted(remaining.find(item=>item.id!==id)?.id??null);setDismissed(current=>[...current,id]);onChanged?.();try{await reconcileNativeNotifications();}catch{/* Web delivery remains active. */}
    }catch(reason){setError(reason instanceof Error?reason.message:"Could not update reminder.");playNativeHaptic("error");}finally{setBusy(null);}
  }
  return {error,busy,snoozing,setSnoozing,remaining,promoted,action};
}

export function DueRemindersView({items,limit,onChanged,compact=false,readOnly=false,LinkComponent=PlainLink}:{items:DueReminder[];limit?:number;onChanged?:()=>void;compact?:boolean;readOnly?:boolean;LinkComponent?:ComponentType<HomeLinkProps>}){
  const Link=LinkComponent;
  const {english}=useLocale();
  const {error,busy,snoozing,setSnoozing,remaining,promoted,action}=useDueReminderActions(items,readOnly,onChanged);
  const [expanded,setExpanded]=useState(false);
  const visible=limit?remaining.slice(0,limit):remaining;
  if(!visible.length)return null;
  function card(item:DueReminder,top=false){const subscription=item.targetType==="subscription";const content=<><div className="due-card-copy"><strong className="user-content">{item.subjectLabel} · {item.title}</strong><small>{english?dueLabel(item):item.overdueMs<60_000?"现在":Math.floor(item.overdueMs/86_400_000)>0?`逾期 ${Math.floor(item.overdueMs/86_400_000)} 天`:"今天"}</small></div><div className="due-actions"><button disabled={readOnly||busy===item.id} onClick={()=>void action(item.id,"complete")}>{subscription?(english?"Paid":"已扣款"):(english?"Complete":"完成")}</button><button disabled={readOnly||busy===item.id} onClick={()=>setSnoozing(snoozing===item.id?null:item.id)}>{english?"Snooze":"稍后"}</button><button disabled={readOnly||busy===item.id} onClick={()=>void action(item.id,"skip")}>{subscription?(english?"Skip cycle":"跳过本期"):(english?"Skip":"跳过")}</button></div></>;return <article className={top?"due-stack-top":""} data-promoted={top&&promoted===item.id||undefined} key={item.id}>{top?<><div className="due-stack-card-head"><button className="due-stack-toggle" type="button" aria-expanded={expanded} aria-label={expanded?(english?"Collapse due reminders":"收起待办"):(english?"Expand due reminders":"展开待办")} onClick={()=>setExpanded(value=>!value)}><span className="eyebrow">{english?"DUE":"待办"}</span><span className="due-stack-count">{remaining.length}</span><ArrowDown5 className="due-stack-toggle-icon" size={13} weight="Outline" aria-hidden="true"/></button>{limit&&remaining.length>limit?<Link href="/notifications">{english?"View all →":"查看全部 →"}</Link>:null}</div><div className="due-stack-card-body">{content}</div></>:content}{snoozing===item.id&&<div className="snooze-menu"><button onClick={()=>void action(item.id,"snooze",{choice:"later_today"})}>{english?"Later today":"今天稍后"}</button><button onClick={()=>void action(item.id,"snooze",{choice:"tomorrow"})}>{english?"Tomorrow":"明天"}</button><label>{english?"Custom":"自定义"}<input disabled={readOnly} type="datetime-local" onChange={event=>event.target.value&&void action(item.id,"snooze",{choice:"custom",custom:new Date(event.target.value).toISOString()})}/></label></div>}</article>}
  if(!compact||visible.length===1)return <><ErrorNotice>{error}</ErrorNotice><section className={`due-section ${compact?"compact":""}`}><div className="section-heading compact"><span className="eyebrow">{english?"DUE":"待办"}</span>{limit&&remaining.length>limit?<Link href="/notifications">{english?"View all →":"查看全部 →"}</Link>:null}</div><div className="due-list">{visible.map(item=>card(item))}</div></section></>;
  return <><ErrorNotice>{error}</ErrorNotice><section className={`due-section compact due-stack ${expanded?"expanded":""}`}><div className="due-stack-shell" data-layers={Math.min(remaining.length-1,2)}><div className="due-list">{card(visible[0],true)}<div className="due-stack-more" aria-hidden={!expanded} inert={!expanded}><div>{visible.slice(1).map(item=>card(item))}</div></div></div></div></section></>;
}
