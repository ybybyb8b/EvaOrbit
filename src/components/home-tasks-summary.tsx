"use client";

import { useEffect, useState, type ComponentType } from "react";
import { Checklist } from "reicon-react";
import type { HomeLinkProps } from "./home-calendar-timeline";
import type { HomeDayOverview } from "@/lib/home-day";
import type { DueReminder } from "@/lib/types";
import { homeReminderTitle, homeTaskItems } from "@/lib/home-task-items";
import { EVAORBIT_TIME_ZONE, dateInEvaOrbit, zonedDateTimeToUtc } from "@/lib/time";
import {reconcileNativeNotifications} from "@/lib/native-bridge";
import {playNativeHaptic} from "@/lib/native-haptics";
import { responseError } from "@/lib/response-error";
import { useBusinessRequest } from "./business-request-context";
import { useDueReminderActions } from "./due-reminders-view";
import { ErrorNotice } from "./error-notice";

function reminderDate(item: DueReminder, english: boolean) {
  if (!item.dueAt || !Number.isFinite(Date.parse(item.dueAt))) return "";
  return new Intl.DateTimeFormat(english ? "en" : "zh-CN", { month:"short", day:"numeric", ...(item.dueHasExplicitTime ? {hour:"2-digit",minute:"2-digit",hourCycle:"h23" as const} : {}), timeZone:EVAORBIT_TIME_ZONE }).format(new Date(item.dueAt));
}
function overdue(item: DueReminder, english: boolean) {
  const minutes = Math.floor(item.overdueMs / 60_000), days = Math.floor(minutes / 1440), hours = Math.floor(minutes / 60);
  if (minutes < 1) return english ? "Due now" : "已到期";
  const value = days || hours || minutes;
  return english ? `${value} ${days ? value===1?"day":"days" : hours ? value===1?"hour":"hours" : value===1?"minute":"minutes"} overdue` : `逾期 ${value} ${days?"天":hours?"小时":"分钟"}`;
}

export function HomeTasksSummary({tasks,reminders,remindersAvailable=true,date,readOnly,english,LinkComponent:Link,onChanged}:{tasks:HomeDayOverview["tasks"];reminders:DueReminder[];remindersAvailable?:boolean;date:string;readOnly:boolean;english:boolean;LinkComponent:ComponentType<HomeLinkProps>;onChanged:()=>void}) {
  const request=useBusinessRequest();
  const {remaining,error,busy,snoozing,setSnoozing,action}=useDueReminderActions(reminders,readOnly,onChanged);
  const [taskState,setTaskState]=useState<Record<number,boolean>>({});
  const [openActions,setOpenActions]=useState<string|null>(null);
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const tick=()=>setNow(Date.now());const timer=window.setInterval(tick,60_000);window.addEventListener("focus",tick);return()=>{window.clearInterval(timer);window.removeEventListener("focus",tick);};},[]);
  const [taskBusy,setTaskBusy]=useState<number|null>(null),[taskError,setTaskError]=useState("");
  const rows=homeTaskItems(tasks.map(task=>({...task,completed:taskState[task.id]??task.completed})),remaining);
  const dueCount=rows.filter(row=>row.reminders.length>0 || row.task&&!row.task.completed&&row.task.dueTime&&Date.parse(zonedDateTimeToUtc(date,row.task.dueTime))<=now).length;
  async function toggle(id:number,completed:boolean) {
    if(readOnly||taskBusy!==null)return;
    setTaskBusy(id);setTaskError("");
    try {
      const response=await request(`/api/tasks/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({completed})});
      if(!response.ok)throw new Error(await responseError(response,english?"Could not update task.":"任务更新失败。"));
      setTaskState(current=>({...current,[id]:completed}));onChanged();playNativeHaptic(completed?"success":"selection");try{await reconcileNativeNotifications();}catch{/* Online completion remains saved. */}
    } catch(reason) {setTaskError(reason instanceof Error?reason.message:"Could not update task.");}
    finally {setTaskBusy(null);}
  }
  return <article className="home-day-pane home-tasks-pane">
    <header><Checklist size={19} weight="Outline" aria-hidden="true"/><h3><Link href="/tasks">{english?"Tasks":"任务"}</Link></h3><small className="vintage-task-count">{dueCount>0?english?`${dueCount} due`:`${dueCount} 到期`:english?`${rows.length} items`:`${rows.length} 项`}</small><small aria-label={english?"Completed / total":"已完成 / 总数"}>{rows.filter(row=>row.task?.completed&&!row.reminders.length).length}/{rows.length}</small></header>
    {date!==dateInEvaOrbit(new Date(now))&&remaining.length>0&&<p className="vintage-live-label">{english?"Includes reminders pending now":"含当前待处理提醒"}</p>}
    {!remindersAvailable&&<p className="vintage-live-label">{english?"Reminder snapshot unavailable. Connect to refresh.":"提醒快照不可用，请联网刷新。"}</p>}
    <ErrorNotice>{error||taskError}</ErrorNotice>
    {rows.length===0?<p className="home-pane-empty">{english?"No tasks or reminders due":"没有待处理任务或提醒"}</p>:<ul className="vintage-task-list">{rows.map(row=>{
      const task=row.task, title=task?.title??homeReminderTitle(row.reminders[0]), due=row.reminders.length>0||Boolean(task&&!task.completed&&task.dueTime&&Date.parse(zonedDateTimeToUtc(date,task.dueTime))<=now);
      return <li key={row.key} data-due={due} data-completed={task?.completed&&!row.reminders.length||undefined}>
        <div className="vintage-task-title">{!row.reminders.length&&task?<label className="vintage-task-check"><input type="checkbox" aria-label={english?`Complete ${task.title}`:`完成 ${task.title}`} checked={task.completed} disabled={readOnly||taskBusy!==null} onChange={event=>void toggle(task.id,event.target.checked)}/></label>:row.reminders.length===1?<button type="button" className="vintage-quick-complete" disabled={readOnly||busy!==null} aria-label={`${row.reminders[0].targetType==="subscription"?(english?"Paid":"已扣款"):(english?"Complete":"完成")} ${row.reminders[0].title}`} onClick={()=>void action(row.reminders[0].id,"complete")}><span/></button>:<span className="vintage-due-mark" aria-hidden="true"/>}
          <strong>{task?<Link href={`/tasks?taskId=${task.id}`}>{task.title}</Link>:title}</strong>
          {row.reminders.length>0&&<button type="button" className="vintage-more" aria-label={`${english?"Actions for":"操作"} ${title}`} aria-expanded={openActions===row.key} onClick={()=>{setOpenActions(openActions===row.key?null:row.key);setSnoozing(null);}}><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg></button>}{row.reminders.length===0&&task&&<Link className="vintage-more" href={`/tasks?taskId=${task.id}`}><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg><span className="sr-only">{english?"Task details":"任务详情"}</span></Link>}
        </div>
        {row.reminders.length?row.reminders.map(item=><div className="vintage-reminder" key={item.id}>
          <div className="vintage-task-meta"><span className="vintage-overdue">{overdue(item,english)}</span><time>{reminderDate(item,english)}</time>{row.reminders.length>1&&<span>{item.title}</span>}</div>
          {openActions===row.key&&<div className="vintage-reminder-actions"><button type="button" disabled={readOnly||busy!==null} onClick={()=>void action(item.id,"complete")}>{item.targetType==="subscription"?(english?"Paid":"已扣款"):(english?"Complete":"完成")}</button><button type="button" disabled={readOnly||busy!==null} aria-expanded={snoozing===item.id} onClick={()=>setSnoozing(snoozing===item.id?null:item.id)}>{english?"Snooze":"稍后"}</button><button type="button" disabled={readOnly||busy!==null} onClick={()=>void action(item.id,"skip")}>{item.targetType==="subscription"?(english?"Skip cycle":"跳过本期"):(english?"Skip":"跳过")}</button></div>}
          {snoozing===item.id&&<div className="vintage-snooze"><button type="button" disabled={readOnly||busy!==null} onClick={()=>void action(item.id,"snooze",{choice:"later_today"})}>{english?"Later today":"今天稍后"}</button><button type="button" disabled={readOnly||busy!==null} onClick={()=>void action(item.id,"snooze",{choice:"tomorrow"})}>{english?"Tomorrow":"明天"}</button><label>{english?"Custom":"自定义"}<input type="datetime-local" disabled={readOnly||busy!==null} onChange={event=>event.target.value&&void action(item.id,"snooze",{choice:"custom",custom:new Date(event.target.value).toISOString()})}/></label></div>}
        </div>):<div className="vintage-task-meta"><span>{task?.completed?(english?"Completed":"已完成"):due?(english?"Due":"已到期"):(english?"Pending":"待处理")}</span>{task?.dueTime&&<time>{task.dueTime}</time>}</div>}
      </li>;
    })}</ul>}
  </article>;
}
