"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { ReiconGlyph } from "./reicon-icons";
import { Checklist, CheckCircle } from "reicon-react";
import type { HomeLinkProps } from "./home-calendar-timeline";
import type { HomeDayOverview, HomeCompletedItem } from "@/lib/home-day";
import type { DueReminder } from "@/lib/types";
import { homeReminderTitle, homeTaskItems, homeReminderCompletionMatches } from "@/lib/home-task-items";
import { EVAORBIT_TIME_ZONE, dateInEvaOrbit, zonedDateTimeToUtc } from "@/lib/time";
import {reconcileNativeNotifications} from "@/lib/native-bridge";
import {playNativeHaptic} from "@/lib/native-haptics";
import { responseError } from "@/lib/response-error";
import { useBusinessRequest } from "./business-request-context";
import { useDueReminderActions } from "./due-reminders-view";
import { Icon } from "./icons";
import { ErrorNotice } from "./error-notice";

function reminderDate(item: DueReminder, english: boolean) {
  if (!item.dueAt || !Number.isFinite(Date.parse(item.dueAt))) return "";
  return new Intl.DateTimeFormat(english ? "en" : "zh-CN", { month:"short", day:"numeric", ...(item.dueHasExplicitTime ? {hour:"2-digit",minute:"2-digit",hourCycle:"h23" as const} : {}), timeZone:EVAORBIT_TIME_ZONE }).format(new Date(item.dueAt));
}
function completionTime(value: string) {
  return new Intl.DateTimeFormat("en",{hour:"2-digit",minute:"2-digit",hourCycle:"h23",timeZone:EVAORBIT_TIME_ZONE}).format(new Date(value));
}
function overdue(item: DueReminder, english: boolean) {
  const minutes = Math.floor(item.overdueMs / 60_000), days = Math.floor(minutes / 1440), hours = Math.floor(minutes / 60);
  if (minutes < 1) return english ? "Due now" : "已到期";
  const value = days || hours || minutes;
  return english ? `${value} ${days ? value===1?"day":"days" : hours ? value===1?"hour":"hours" : value===1?"minute":"minutes"} overdue` : `逾期 ${value} ${days?"天":hours?"小时":"分钟"}`;
}

export function HomeTasksSummary({tasks,completedItems=[],reminders,remindersAvailable=true,date,readOnly,english,LinkComponent:Link,onChanged}:{tasks:HomeDayOverview["tasks"];completedItems?:HomeCompletedItem[];reminders:DueReminder[];remindersAvailable?:boolean;date:string;readOnly:boolean;english:boolean;LinkComponent:ComponentType<HomeLinkProps>;onChanged:()=>void}) {
  const request=useBusinessRequest();
  const {remaining,error,busy,snoozing,setSnoozing,action}=useDueReminderActions(reminders,readOnly,onChanged);
  type Task = HomeDayOverview["tasks"][number];
  type LocalReminder = {item:DueReminder;completedAt:string;saving:boolean};
  const [localTasks,setLocalTasks]=useState<Record<number,Task&{saving:boolean}>>({});
  const [localReminders,setLocalReminders]=useState<Record<number,LocalReminder>>({});
  const [rowOrder,setRowOrder]=useState<string[]|null>(null);
  const writeLock=useRef(false);
  const listRef=useRef<HTMLUListElement>(null);
  const [rowHeights,setRowHeights]=useState<Record<string,number>>({});
  useEffect(()=>{const reset=()=>setRowHeights({});window.addEventListener("resize",reset);return()=>window.removeEventListener("resize",reset);},[]);
  const [openActions,setOpenActions]=useState<string|null>(null);
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const tick=()=>setNow(Date.now());const timer=window.setInterval(tick,60_000);window.addEventListener("focus",tick);return()=>{window.clearInterval(timer);window.removeEventListener("focus",tick);};},[]);
  const today=dateInEvaOrbit(new Date(now));
  const [taskBusy,setTaskBusy]=useState<number|null>(null),[taskError,setTaskError]=useState("");
  const remembered=Object.values(localReminders);
  const localCompletion=(item:DueReminder)=>{
    const local=localReminders[item.id];if(local?.item.dueAt!==item.dueAt)return undefined;
    const confirmed=completedItems.find(completion=>homeReminderCompletionMatches(item,completion));
    return confirmed?{...local,completedAt:confirmed.completedAt}:local;
  };
  // Retain the completed occurrence; a newly due recurrence is a different row.
  const future=remaining.filter(item=>localReminders[item.id]&& !localCompletion(item));
  const visibleReminders=remaining.filter(item=>!future.includes(item));
  for(const saved of remembered)if(!visibleReminders.some(item=>item.id===saved.item.id))visibleReminders.push(saved.item);
  const taskMap=new Map(tasks.map(task=>[task.id,{...task,...localTasks[task.id]}]));
  for(const task of Object.values(localTasks))if(!taskMap.has(task.id))taskMap.set(task.id,task);
  // A day cached while it was Today can still contain open tasks from earlier dates.
  const visibleTasks=[...taskMap.values()].filter(task=>task.completed||localTasks[task.id]?.saving||task.dueDate===undefined||task.dueDate===date||date===today&&task.dueDate!==null&&task.dueDate<date);
  const rows=[...homeTaskItems(visibleTasks,visibleReminders),...homeTaskItems([],future)].map(row=>{
    const task=row.task, dueDate=task?.dueDate===undefined?(task?date:null):task.dueDate;
    const taskDue=Boolean(!task?.completed&&dueDate&&(task?.dueTime?Date.parse(zonedDateTimeToUtc(dueDate,task.dueTime))<=now:dueDate<today));
    return {...row,dueDate,taskDue,due:taskDue||row.reminders.length>0,
      key:task?row.key:row.key+":"+Math.min(...row.reminders.map(item=>Date.parse(item.nextDueAt??item.startsAt))),
    };
  });
  const complete=(row:typeof rows[number])=>row.task?row.task.completed:Boolean(row.reminders.length&&row.reminders.every(item=>localCompletion(item)));
  const pending=(row:typeof rows[number])=>Boolean(row.task&&localTasks[row.task.id]?.saving||row.reminders.some(item=>localCompletion(item)?.saving));
  const history=completedItems.filter(item=>!remembered.some(saved=>homeReminderCompletionMatches(saved.item,item)));
  const entries=[...rows.map(row=>({key:row.key,row,completion:null})),...history.map(completion=>({key:"completed:"+completion.key,row:null,completion}))];
  if(rowOrder){const positions=new Map(rowOrder.map((key,index)=>[key,index]));entries.sort((a,b)=>(positions.get(a.key)??Infinity)-(positions.get(b.key)??Infinity));}
  const pinOrder=()=>{
    setRowOrder(current=>current?[...current,...entries.map(item=>item.key).filter(key=>!current.includes(key))]:entries.map(item=>item.key));
    const heights=Object.fromEntries(Array.from(listRef.current?.querySelectorAll<HTMLElement>("li[data-row-key]")??[]).filter(row=>!row.querySelector(".vintage-reminder-actions,.vintage-snooze")).map(row=>[row.dataset.rowKey!,row.getBoundingClientRect().height]));
    setRowHeights(current=>({...heights,...current}));
  };
  const dueCount=rows.filter(row=>!complete(row)&&row.due).length;
  const doneCount=rows.filter(complete).length+history.length;
  async function toggle(id:number,completed:boolean) {
    if(readOnly||writeLock.current||busy!==null)return;
    const task=taskMap.get(id);if(!task)return;
    writeLock.current=true;pinOrder();setTaskBusy(id);setTaskError("");
    const previous=localTasks[id];
    const changed={...task,completed,completedAt:completed?new Date().toISOString():null,saving:true};
    setLocalTasks(current=>({...current,[id]:changed}));
    try {
      const response=await request(`/api/tasks/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({completed})});
      if(!response.ok)throw new Error(await responseError(response,english?"Could not update task.":"任务更新失败。"));
      const saved=await response.json().catch(()=>null) as Task|null;
      setLocalTasks(current=>({...current,[id]:{...changed,completedAt:saved?.completedAt??changed.completedAt,saving:false}}));
      onChanged();playNativeHaptic(completed?"success":"selection");
      void reconcileNativeNotifications().catch(()=>{});
    } catch(reason) {
      setLocalTasks(current=>{const next={...current};if(previous)next[id]=previous;else delete next[id];return next;});
      setTaskError(reason instanceof Error?reason.message:"Could not update task.");playNativeHaptic("error");
    } finally {writeLock.current=false;setTaskBusy(null);}
  }
  async function performReminderAction(id:number,name:"complete"|"skip"|"snooze",body?:unknown){
    if(readOnly||writeLock.current||busy!==null)return;
    if(name!=="complete"){await action(id,name,body);return;}
    const item=remaining.find(value=>value.id===id);if(!item)return;
    writeLock.current=true;pinOrder();setOpenActions(null);
    const saved={item,completedAt:new Date().toISOString(),saving:true};
    setLocalReminders(current=>({...current,[id]:saved}));
    const task=item.targetType==="task"&&item.targetId?taskMap.get(item.targetId):undefined,previous=task&&localTasks[task.id];
    if(task)setLocalTasks(current=>({...current,[task.id]:{...task,completed:true,completedAt:saved.completedAt,saving:true}}));
    const success=await action(id,name,body);
    if(success){
      setLocalReminders(current=>({...current,[id]:{...saved,saving:false}}));
      if(task)setLocalTasks(current=>({...current,[task.id]:{...task,completed:true,completedAt:saved.completedAt,saving:false}}));
    }else{
      setLocalReminders(current=>{const next={...current};delete next[id];return next;});
      if(task)setLocalTasks(current=>{const next={...current};if(previous)next[task.id]=previous;else delete next[task.id];return next;});
    }
    writeLock.current=false;
  }
  return <article className="home-day-pane home-tasks-pane">
    <header><Checklist size={19} weight="Outline" aria-hidden="true"/><h3><Link href="/tasks">{english?"Tasks":"任务"}</Link></h3><small className="vintage-task-count">{dueCount>0?english?`${dueCount} due`:`${dueCount} 到期`:english?`${entries.length} items`:`${entries.length} 项`}</small><small aria-label={english?"Completed / total":"已完成 / 总数"}>{doneCount}/{entries.length}</small></header>
    {date!==today&&remaining.length>0&&<p className="vintage-live-label">{english?"Includes reminders pending now":"含当前待处理提醒"}</p>}
    {!remindersAvailable&&<p className="vintage-live-label">{english?"Reminder snapshot unavailable. Connect to refresh.":"提醒快照不可用，请联网刷新。"}</p>}
    <ErrorNotice>{error||taskError}</ErrorNotice>
    {entries.length===0?<p className="home-pane-empty">{english?"No tasks or reminders due":"没有待处理任务或提醒"}</p>:<ul ref={listRef} className="vintage-task-list">{entries.map(({key,row,completion})=>{
      if(completion)return <li key={key} data-completed="true"><div className="vintage-task-title"><CheckCircle className="vintage-completed-check" size={20} weight="Outline" aria-hidden="true"/><strong><Link href={completion.href}>{completion.title}</Link></strong><Link className="vintage-more" href={completion.href}><ReiconGlyph name="more" className="icon"/><span className="sr-only">{english?"View record":"查看记录"}</span></Link></div><div className="vintage-task-meta"><span>{english?"Completed":"已完成"}</span>{completion.hasExplicitTime&&<time>{completionTime(completion.completedAt)}</time>}</div></li>;
      if(!row)return null;
      const done=complete(row),saving=pending(row);
      const task=row.task, title=task?.title??homeReminderTitle(row.reminders[0]), due=!done&&row.due;
      const {dueDate,taskDue}=row, showDate=dueDate&&(taskDue||dueDate!==date), hasReminders=row.reminders.length>0;
      const taskStatus=saving?(english?"Saving…":"保存中…"):done?(english?"Completed":"已完成"):
        taskDue?(dueDate&&dueDate<today?(english?"Overdue":"已逾期"):(english?"Due":"已到期")):(english?"Pending":"待处理");
      return <li key={key} data-row-key={key} style={{minHeight:rowHeights[key]}} data-due={due} data-completed={done||undefined} aria-busy={saving||undefined}>
        <div className="vintage-task-title">{task?<label className="vintage-task-check"><input type="checkbox" aria-label={english?`${task.completed?"Reopen":"Complete"} ${task.title}`:`${task.completed?"重新打开":"完成"} ${task.title}`} checked={task.completed} disabled={readOnly||taskBusy!==null||busy!==null} onChange={event=>void toggle(task.id,event.target.checked)}/><span aria-hidden="true"><Icon name="check"/></span></label>:row.reminders.length===1||done?<button type="button" className="vintage-quick-complete" aria-pressed={done} disabled={readOnly||done||busy!==null||taskBusy!==null} aria-label={`${row.reminders[0].targetType==="subscription"?(english?"Paid":"已扣款"):(english?"Complete":"完成")} ${row.reminders[0].title}`} onClick={()=>void performReminderAction(row.reminders[0].id,"complete")}><span><Icon name="check"/></span></button>:<span className="vintage-due-mark" aria-hidden="true"/>}
          <strong>{task?<Link href={`/tasks?taskId=${task.id}`}>{task.title}</Link>:title}</strong>
          {row.reminders.length>0&&!done&&<button type="button" className="vintage-more" aria-label={`${english?"Actions for":"操作"} ${title}`} aria-expanded={openActions===row.key} onClick={()=>{setOpenActions(openActions===row.key?null:row.key);setSnoozing(null);}}><ReiconGlyph name="more" className="icon"/></button>}{row.reminders.length===0&&task&&<Link className="vintage-more" href={`/tasks?taskId=${task.id}`}><ReiconGlyph name="more" className="icon"/><span className="sr-only">{english?"Task details":"任务详情"}</span></Link>}
        </div>
        {task&&(!hasReminders||!done&&dueDate&&(showDate||task.dueTime))&&<div className="vintage-task-meta"><span className={taskDue&&!saving?"vintage-overdue":undefined}>{taskStatus}</span>{done&&task.completedAt?<time>{completionTime(task.completedAt)}</time>:!done&&dueDate&&(showDate||task.dueTime)&&<time dateTime={dueDate+(task.dueTime?`T${task.dueTime}`:"")}>{[showDate&&dueDate,task.dueTime].filter(Boolean).join(" ")}</time>}</div>}
        {row.reminders.map(item=><div className="vintage-reminder" key={item.id} data-completed={done||Boolean(localCompletion(item))||undefined}>
          <div className="vintage-task-meta"><span className={done||localCompletion(item)?undefined:"vintage-overdue"}>{localCompletion(item)?.saving||saving?(english?"Saving…":"保存中…"):done||localCompletion(item)?(english?"Completed":"已完成"):overdue(item,english)}</span><time>{done||localCompletion(item)?completionTime(localCompletion(item)?.completedAt??task?.completedAt??new Date().toISOString()):reminderDate(item,english)}</time>{row.reminders.length>1&&<span>{item.title}</span>}</div>
          {openActions===row.key&&!localCompletion(item)&&<div className="vintage-reminder-actions"><button type="button" disabled={readOnly||busy!==null} onClick={()=>void performReminderAction(item.id,"complete")}>{item.targetType==="subscription"?(english?"Paid":"已扣款"):(english?"Complete":"完成")}</button><button type="button" disabled={readOnly||busy!==null} aria-expanded={snoozing===item.id} onClick={()=>setSnoozing(snoozing===item.id?null:item.id)}>{english?"Snooze":"稍后"}</button><button type="button" disabled={readOnly||busy!==null} onClick={()=>void performReminderAction(item.id,"skip")}>{item.targetType==="subscription"?(english?"Skip cycle":"跳过本期"):(english?"Skip":"跳过")}</button></div>}
          {snoozing===item.id&&!localCompletion(item)&&<div className="vintage-snooze"><button type="button" disabled={readOnly||busy!==null} onClick={()=>void performReminderAction(item.id,"snooze",{choice:"later_today"})}>{english?"Later today":"今天稍后"}</button><button type="button" disabled={readOnly||busy!==null} onClick={()=>void performReminderAction(item.id,"snooze",{choice:"tomorrow"})}>{english?"Tomorrow":"明天"}</button><label>{english?"Custom":"自定义"}<input type="datetime-local" disabled={readOnly||busy!==null} onChange={event=>event.target.value&&void performReminderAction(item.id,"snooze",{choice:"custom",custom:new Date(event.target.value).toISOString()})}/></label></div>}
        </div>)}
      </li>;
    })}</ul>}
  </article>;
}
