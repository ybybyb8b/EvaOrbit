"use client";

import Link from "next/link";
import { useState } from "react";
import type { DueReminder } from "@/lib/types";
import { reconcileNativeNotifications } from "@/lib/native-bridge";
import { useLocale } from "./locale-controller";

function dueLabel(item:DueReminder){if(item.overdueMs<60_000)return"Now";const days=Math.floor(item.overdueMs/86_400_000);if(days>0)return`${days} ${days===1?"day":"days"} overdue`;return"Today";}

export function DueReminders({items,limit,onChanged,compact=false}:{items:DueReminder[];limit?:number;onChanged?:()=>void;compact?:boolean}){
  const {english}=useLocale();
  const [busy,setBusy]=useState<number|null>(null);const [snoozing,setSnoozing]=useState<number|null>(null);const [dismissed,setDismissed]=useState<number[]>([]);const remaining=items.filter(item=>!dismissed.includes(item.id));const visible=limit?remaining.slice(0,limit):remaining;
  if(!visible.length)return null;
  async function action(id:number,name:"complete"|"skip"|"snooze",body?:unknown){setBusy(id);const response=await fetch(`/api/reminders/${id}/${name}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body??{})});setBusy(null);if(response.ok){setSnoozing(null);setDismissed(current=>[...current,id]);onChanged?.();try{await reconcileNativeNotifications();}catch{/* Web notification delivery remains active. */}}}
  return <section className={`due-section ${compact?"compact":""}`}><div className="section-heading compact"><span className="eyebrow">{english?"DUE":"待办"}</span>{limit&&items.length>limit?<Link href="/cats">{english?"View all →":"查看全部 →"}</Link>:null}</div><div className="due-list">{visible.map(item=><article key={item.id}><div><strong className="user-content">{item.subjectLabel} · {item.title}</strong><small>{english?dueLabel(item):item.overdueMs<60_000?"现在":Math.floor(item.overdueMs/86_400_000)>0?`逾期 ${Math.floor(item.overdueMs/86_400_000)} 天`:"今天"}</small></div><div className="due-actions"><button disabled={busy===item.id} onClick={()=>void action(item.id,"complete")}>{english?"Complete":"完成"}</button><button disabled={busy===item.id} onClick={()=>setSnoozing(snoozing===item.id?null:item.id)}>{english?"Snooze":"稍后"}</button><button disabled={busy===item.id} onClick={()=>void action(item.id,"skip")}>{english?"Skip":"跳过"}</button></div>{snoozing===item.id&&<div className="snooze-menu"><button onClick={()=>void action(item.id,"snooze",{choice:"later_today"})}>{english?"Later today":"今天稍后"}</button><button onClick={()=>void action(item.id,"snooze",{choice:"tomorrow"})}>{english?"Tomorrow":"明天"}</button><label>{english?"Custom":"自定义"}<input type="datetime-local" onChange={event=>event.target.value&&void action(item.id,"snooze",{choice:"custom",custom:new Date(event.target.value).toISOString()})}/></label></div>}</article>)}</div></section>;
}
