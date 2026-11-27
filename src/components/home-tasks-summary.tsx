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

export function HomeTasksSummary({tasks,completedItems=[],reminders,remindersAvailable=true,date,readOnly,english,LinkComponent:Link,onChanged}:{tasks:HomeDayOverview["tasks"];completedItems?:HomeCompletedItem[];reminders:DueReminder[];remindersAvailable?:boolean;date:string;readOnly:boolean;english:boolean;LinkComponent:ComponentType<HomeLinkProps>;onChanged:(completedOn?:string)=>void}) {
  const request=useBusinessRequest();
  const {remaining,error,busy,snoozing,setSnoozing,action,restore}=useDueReminderActions(reminders,readOnly,onChanged);
  type Task = HomeDayOverview["tasks"][number];
  type LocalReminder = {item:DueReminder;saving:boolean};
  const [localTasks,setLocalTasks]=useState<Record<number,Task&{saving:boolean}>>({});
  const [localReminders,setLocalReminders]=useState<Record<number,LocalReminder>>({});
  const [rowOrder,setRowOrder]=useState<string[]|null>(null);
  const writeLock=useRef(false);
  const listRef=useRef<HTMLUListElement>(null);
  const [rowHeights,setRowHeights]=useState<Record<string,number>>({});
  useEffect(()=>{const reset=()=>setRowHeights({});window.addEventListener("resize",reset);return()=>window.removeEventListener("resize",reset);},[]);
  const [openActions,setOpenActions]=useState<string|null>(null);
  const [completionEditor,setCompletionEditor]=useState<{key:string;date:string}|null>(null);
  const [completionBusy,setCompletionBusy]=useState(false);
  const [hiddenCompletions,setHiddenCompletions]=useState<HomeCompletedItem[]>([]);
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const tick=()=>setNow(Date.now());const timer=window.setInterval(tick,60_000);window.addEventListener("focus",tick);return()=>{window.clearInterval(timer);window.removeEventListener("focus",tick);};},[]);
  const today=dateInEvaOrbit(new Date(now));
  const [taskBusy,setTaskBusy]=useState<number|null>(null),[taskError,setTaskError]=useState("");
  const remembered=Object.values(localReminders);
  const localCompletion=(item:DueReminder)=>{
    const local=localReminders[item.id];return local?.item.dueAt===item.dueAt?local:undefined;
  };
  // Retain the completed occurrence; a newly due recurrence is a different row.
  const future=remaining.filter(item=>localReminders[item.id]&& !localCompletion(item));
  const visibleReminders=remaining.filter(item=>!future.includes(item));
  for(const saved of remembered)if(!visibleReminders.some(item=>item.id===saved.item.id))visibleReminders.push(saved.item);
  const taskMap=new Map(tasks.map(task=>[task.id,{...task,...localTasks[task.id]}]));
  for(const task of Object.values(localTasks))if(!taskMap.has(task.id))taskMap.set(task.id,task);
  // A day cached while it was Today can still contain open tasks from earlier dates.
  const visibleTasks=[...taskMap.values()].filter(task=>localTasks[task.id]?.saving||(
    task.completed ? !task.completedOn||task.completedOn===date
      : task.dueDate===undefined||task.dueDate===date||date===today&&task.dueDate!==null&&task.dueDate<date));
  const rows=[...homeTaskItems(visibleTasks,visibleReminders),...homeTaskItems([],future)].map(row=>{
    const task=row.task, dueDate=task?.dueDate===undefined?(task?date:null):task.dueDate;
    const taskDue=Boolean(!task?.completed&&dueDate&&(task?.dueTime?Date.parse(zonedDateTimeToUtc(dueDate,task.dueTime))<=now:dueDate<today));
    return {...row,dueDate,taskDue,due:taskDue||row.reminders.length>0,
      key:task?row.key:row.key+":"+Math.min(...row.reminders.map(item=>Date.parse(item.nextDueAt??item.startsAt))),
    };
  });
  const complete=(row:typeof rows[number])=>row.task?row.task.completed:Boolean(row.reminders.length&&row.reminders.every(item=>localCompletion(item)));
  const pending=(row:typeof rows[number])=>Boolean(row.task&&localTasks[row.task.id]?.saving||row.reminders.some(item=>localCompletion(item)?.saving));
  const completionVisible=(item:HomeCompletedItem)=>!hiddenCompletions.some(hidden=>hidden.key===item.key&&hidden.completedAt===item.completedAt
    && (hidden.correction?.kind!=="cat"||item.correction?.kind==="cat"&&hidden.correction.eventId===item.correction.eventId));
  const history=completedItems.filter(item=>completionVisible(item)&&!remembered.some(saved=>homeReminderCompletionMatches(saved.item,item)));
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
    writeLock.current=true;pinOrder();setTaskBusy(id);setTaskError("");setCompletionEditor(null);
    const previous=localTasks[id];
    const changed={...task,completed,completedOn:completed?dateInEvaOrbit():null,completedAt:null,saving:true};
    setLocalTasks(current=>({...current,[id]:changed}));
    try {
      const response=await request(`/api/tasks/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({completed})});
      if(!response.ok)throw new Error(await responseError(response,english?"Could not update task.":"任务更新失败。"));
      const saved=await response.json().catch(()=>null) as Task|null;
      setLocalTasks(current=>({...current,[id]:{...changed,completedAt:saved?.completedAt??null,completedOn:saved?.completedOn??changed.completedOn,saving:false}}));
      onChanged(completed?(saved?.completedOn??changed.completedOn??undefined):undefined);playNativeHaptic(completed?"success":"selection");
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
    if(item.targetType==="task"&&item.targetId&&taskMap.has(item.targetId)){
      setOpenActions(null);
      await toggle(item.targetId,true);
      return;
    }
    writeLock.current=true;pinOrder();setOpenActions(null);
    const saved={item,saving:true};
    setLocalReminders(current=>({...current,[id]:saved}));
    const success=await action(id,name,body);
    if(success&&(success.completedOn??today)===date){
      setLocalReminders(current=>({...current,[id]:{...saved,saving:false}}));
    }else{
      setLocalReminders(current=>{const next={...current};delete next[id];return next;});
    }
    writeLock.current=false;
  }
  async function changeCompletion(task:Task|undefined,completion:HomeCompletedItem|undefined,completedOn:string|null) {
    if(readOnly||writeLock.current||busy!==null)return;
    const correction=completion?.correction;
    let url:string, payload:Record<string,unknown>;
    if(task&&completedOn){url=`/api/tasks/${task.id}`;payload={completedOn};}
    else if(correction?.kind==="cat"){
      if(completedOn){url=`/api/cats/records/event/${correction.eventId}`;payload={completedOn};}
      else if(correction.canUndo&&correction.routineId){url=`/api/cats/routines/${correction.routineId}`;payload={undoEventId:correction.eventId};}
      else return;
    }else if(correction?.kind==="reminder"&&completedOn){
      url=`/api/reminders/${correction.reminderId}`;payload={occurrenceId:correction.occurrenceId,completedOn};
    }else return;
    writeLock.current=true;
    setCompletionBusy(true);setTaskError("");
    try{
      const response=await request(url,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      if(!response.ok)throw new Error(await responseError(response,english?"Could not update completion.":"无法更新完成记录。"));
      if(correction?.kind==="reminder"){
        const saved=await response.json().catch(()=>null) as {completedOn?:string}|null;
        if(saved?.completedOn!==completedOn)throw new Error(english?"Could not update completion.":"无法更新完成记录。");
      }
      if(task&&completedOn)setLocalTasks(current=>({...current,[task.id]:{...task,completedOn,saving:false}}));
      if(completion){
        if(!completedOn){
          const rememberedItem=remembered.find(saved=>homeReminderCompletionMatches(saved.item,completion))?.item;
          if(rememberedItem)restore(rememberedItem);
        }
        setHiddenCompletions(current=>[...current,completion]);
        setLocalReminders(current=>Object.fromEntries(Object.entries(current).filter(([,saved])=>!homeReminderCompletionMatches(saved.item,completion))));
      }
      setCompletionEditor(null);onChanged(completedOn??undefined);playNativeHaptic("success");
      void reconcileNativeNotifications().catch(()=>{});
    }catch(reason){
      setTaskError(reason instanceof Error?reason.message:english?"Could not update completion.":"无法更新完成记录。");
      playNativeHaptic("error");
    }finally{writeLock.current=false;setCompletionBusy(false);}
  }
  function completionMenu(key:string,title:string) {
    return <button type="button" className="vintage-more" aria-label={english?`Completion options for ${title}`:`完成记录操作：${title}`}
      aria-expanded={completionEditor?.key===key} disabled={completionBusy||taskBusy!==null||busy!==null}
      onClick={()=>{setOpenActions(null);setTaskError("");setCompletionEditor(completionEditor?.key===key?null:{key,date});}}>
      <ReiconGlyph name="more" className="icon"/>
    </button>;
  }
  function completionForm(key:string,task?:Task,completion?:HomeCompletedItem) {
    if(completionEditor?.key!==key)return null;
    const canUndo=completion?.correction?.kind==="cat"&&completion.correction.canUndo;
    return <form className="vintage-completion-form vintage-snooze" onSubmit={event=>{
      event.preventDefault();void changeCompletion(task,completion,completionEditor.date);
    }}>
      <label><span>{english?"Completion date":"完成日期"}</span>
        <input type="date" required max={today} value={completionEditor.date} disabled={completionBusy}
          onChange={event=>setCompletionEditor({key,date:event.target.value})}/>
      </label>
      <button type="submit" disabled={completionBusy||!completionEditor.date||completionEditor.date===date}>
        {completionBusy?(english?"Saving…":"保存中…"):(english?"Save date":"保存日期")}
      </button>
      {canUndo&&<button type="button" disabled={completionBusy} onClick={()=>void changeCompletion(undefined,completion,null)}>
        {english?"Undo completion":"撤销完成"}
      </button>}
    </form>;
  }
  return <article className="home-day-pane home-tasks-pane">
    <header><Checklist size={19} weight="Outline" aria-hidden="true"/><h3><Link href="/tasks">{english?"Tasks":"任务"}</Link></h3><span className="home-task-date">{date===today?(english?"Today":"今天"):new Intl.DateTimeFormat(english?"en":"zh-CN",{month:"short",day:"numeric",...(date.slice(0,4)!==today.slice(0,4)?{year:"numeric" as const}:{}),timeZone:EVAORBIT_TIME_ZONE}).format(new Date(`${date}T12:00:00+08:00`))}</span><small className="vintage-task-count">{dueCount>0?english?`${dueCount} due`:`${dueCount} 到期`:english?`${entries.length} items`:`${entries.length} 项`}</small><small aria-label={english?"Completed / total":"已完成 / 总数"}>{doneCount}/{entries.length}</small></header>
    {date!==today&&remaining.length>0&&<p className="vintage-live-label">{english?"Includes reminders pending now":"含当前待处理提醒"}</p>}
    {!remindersAvailable&&<p className="vintage-live-label">{english?"Reminder snapshot unavailable. Connect to refresh.":"提醒快照不可用，请联网刷新。"}</p>}
    <ErrorNotice>{error||taskError}</ErrorNotice>
    {entries.length===0?<p className="home-pane-empty">{english?"No tasks or reminders due":"没有待处理任务或提醒"}</p>:<ul ref={listRef} className="vintage-task-list">{entries.map(({key,row,completion})=>{
      if(completion)return <li key={key} data-completed="true"><div className="vintage-task-title"><CheckCircle className="vintage-completed-check" size={20} weight="Outline" aria-hidden="true"/><strong><Link href={completion.href}>{completion.title}</Link></strong>{completion.correction&&!readOnly?completionMenu(key,completion.title):<Link className="vintage-more" href={completion.href}><ReiconGlyph name="more" className="icon"/><span className="sr-only">{english?"View record":"查看记录"}</span></Link>}</div><div className="vintage-task-meta"><span>{completion.handled?(english?"Handled":"已处理"):(english?"Completed":"已完成")}</span>{completion.hasExplicitTime&&<time>{completionTime(completion.completedAt)}</time>}</div>{completionForm(key,undefined,completion)}</li>;
      if(!row)return null;
      const done=complete(row),saving=pending(row);
      const task=row.task, title=task?.title??homeReminderTitle(row.reminders[0]), due=!done&&row.due;
      const confirmed=done&&!task?completedItems.find(item=>completionVisible(item)&&row.reminders.some(reminder=>homeReminderCompletionMatches(reminder,item))):undefined;
      const {dueDate,taskDue}=row, showDate=dueDate&&(taskDue||dueDate!==date), hasReminders=row.reminders.length>0;
      const taskStatus=saving?(english?"Saving…":"保存中…"):done?(english?"Completed":"已完成"):
        taskDue?(dueDate&&dueDate<today?(english?"Overdue":"已逾期"):(english?"Due":"已到期")):(english?"Pending":"待处理");
      return <li key={key} data-row-key={key} style={{minHeight:rowHeights[key]}} data-due={due} data-completed={done||undefined} aria-busy={saving||undefined}>
        <div className="vintage-task-title">{task?<label className="vintage-task-check"><input type="checkbox" aria-label={english?`${task.completed?"Reopen":"Complete"} ${task.title}`:`${task.completed?"取消完成":"完成"} ${task.title}`} checked={task.completed} disabled={readOnly||completionBusy||taskBusy!==null||busy!==null} onChange={event=>void toggle(task.id,event.target.checked)}/><span aria-hidden="true"><Icon name="check"/></span></label>:row.reminders.length===1||done?<button type="button" className="vintage-quick-complete" aria-pressed={done} disabled={readOnly||completionBusy||done||busy!==null||taskBusy!==null} aria-label={`${row.reminders[0].targetType==="subscription"?(english?"Paid":"已扣款"):(english?"Complete":"完成")} ${row.reminders[0].title}`} onClick={()=>void performReminderAction(row.reminders[0].id,"complete")}><span><Icon name="check"/></span></button>:<span className="vintage-due-mark" aria-hidden="true"/>}
          <strong>{task?<Link href={`/tasks?taskId=${task.id}`}>{task.title}</Link>:title}</strong>
          {done&&!readOnly&&(task||confirmed?.correction)?completionMenu(key,title):row.reminders.length>0&&!done?<button type="button" className="vintage-more" aria-label={`${english?"Actions for":"操作"} ${title}`} aria-expanded={openActions===row.key} onClick={()=>{setCompletionEditor(null);setOpenActions(openActions===row.key?null:row.key);setSnoozing(null);}}><ReiconGlyph name="more" className="icon"/></button>:row.reminders.length===0&&task?<Link className="vintage-more" href={`/tasks?taskId=${task.id}`}><ReiconGlyph name="more" className="icon"/><span className="sr-only">{english?"Task details":"任务详情"}</span></Link>:null}
        </div>
        {task&&(!hasReminders||!done&&dueDate&&(showDate||task.dueTime))&&<div className="vintage-task-meta"><span className={taskDue&&!saving?"vintage-overdue":undefined}>{taskStatus}</span>{!done&&dueDate&&(showDate||task.dueTime)&&<time dateTime={dueDate+(task.dueTime?`T${task.dueTime}`:"")}>{[showDate&&dueDate,task.dueTime].filter(Boolean).join(" ")}</time>}</div>}
        {row.reminders.map(item=><div className="vintage-reminder" key={item.id} data-completed={done||Boolean(localCompletion(item))||undefined}>
          <div className="vintage-task-meta"><span className={done||localCompletion(item)?undefined:"vintage-overdue"}>{localCompletion(item)?.saving||saving?(english?"Saving…":"保存中…"):done||localCompletion(item)?item.targetType==="tracker"?(english?"Handled":"已处理"):(english?"Completed":"已完成"):overdue(item,english)}</span>{!done&&!localCompletion(item)?<time>{reminderDate(item,english)}</time>:confirmed?.hasExplicitTime?<time>{completionTime(confirmed.completedAt)}</time>:null}{row.reminders.length>1&&<span>{item.title}</span>}</div>
          {openActions===row.key&&!localCompletion(item)&&<div className="vintage-reminder-actions"><button type="button" disabled={readOnly||busy!==null} onClick={()=>void performReminderAction(item.id,"complete")}>{item.targetType==="subscription"?(english?"Paid":"已扣款"):(english?"Complete":"完成")}</button><button type="button" disabled={readOnly||busy!==null} aria-expanded={snoozing===item.id} onClick={()=>setSnoozing(snoozing===item.id?null:item.id)}>{english?"Snooze":"稍后"}</button><button type="button" disabled={readOnly||busy!==null} onClick={()=>void performReminderAction(item.id,"skip")}>{item.targetType==="subscription"?(english?"Skip cycle":"跳过本期"):(english?"Skip":"跳过")}</button></div>}
          {snoozing===item.id&&!localCompletion(item)&&<div className="vintage-snooze"><button type="button" disabled={readOnly||busy!==null} onClick={()=>void performReminderAction(item.id,"snooze",{choice:"later_today"})}>{english?"Later today":"今天稍后"}</button><button type="button" disabled={readOnly||busy!==null} onClick={()=>void performReminderAction(item.id,"snooze",{choice:"tomorrow"})}>{english?"Tomorrow":"明天"}</button><label>{english?"Custom":"自定义"}<input type="datetime-local" disabled={readOnly||busy!==null} onChange={event=>event.target.value&&void performReminderAction(item.id,"snooze",{choice:"custom",custom:new Date(event.target.value).toISOString()})}/></label></div>}
        </div>)}
        {done&&completionForm(key,task,confirmed)}
      </li>;
    })}</ul>}
  </article>;
}
