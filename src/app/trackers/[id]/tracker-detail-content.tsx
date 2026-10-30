"use client";
import { ErrorNotice } from "@/components/error-notice";
import { PageLoading } from "@/components/page-loading";
import { useRememberedState } from "@/components/use-remembered-state";
import { useServerDataState, useDataRefresh } from "@/components/use-data-refresh";
import { PageLogAction } from "@/components/bottom-log-core";
import { ChoiceSelect } from "@/components/choice-select";
import { entryMatchesPeriod, entryMatchesField, type TimelinePeriod, matchesTrackerSearch } from "@/lib/tracker-timeline";
import { SuggestedInput } from "@/components/suggested-input";
import { ToastNotice, showActionToast } from "@/components/action-toast";
import { useSectionSwipe } from "@/components/use-section-swipe";

import type {ComponentType,ReactNode} from "react";
import type {BusinessRequest} from "@/lib/business-request";
import { TrackerSettingsView, fieldTypeLabel, periodLabel } from "../tracker-settings-view";
import { TrackerTimelineToolbar } from "../tracker-timeline-toolbar";
import { TrackerActivityInsights } from "../tracker-activity-insights";
import { TrackerTimelineRecords } from "../tracker-timeline-records";
import { FormEvent, useCallback, useEffect, useEffectEvent, useRef, useState } from "react";

import { Icon } from "@/components/icons";
import { FormSheet } from "@/components/form-sheet";
import { useLocale } from "@/components/locale-controller";
import { PageHeading as PageHeader } from "@/components/page-heading";
import {TrackerPicture} from "@/components/tracker-picture";
import { invalidateCachedJson } from "@/lib/client-json-cache";
import { reconcileNativeNotifications } from "@/lib/native-bridge";
import { playNativeHaptic } from "@/lib/native-haptics";
import { trackerDistributionEntries, trackerInsightEntries, type TrackerInsightPeriod } from "@/lib/tracker-insights";
import { TrackerEntryEditor } from "../tracker-entry-editor";
import { TrackerCaptureToggle } from "../tracker-capture-toggle";
import type { ApiError, Tracker, TrackerEntry, TrackerField, TrackerFieldType, TrackerGoal, TrackerGoalOperator, TrackerInsights, TrackerPeriodType, TrackerReminder, TrackerReminderMode, TrackerStats } from "@/lib/types";

export type TrackerDetailData = { groupNames?: string[]; tracker: Tracker; fields: TrackerField[]; entries: TrackerEntry[]; goals: TrackerGoal[]; reminders: TrackerReminder[]; stats: TrackerStats; insights: TrackerInsights };
type Tab = "insights" | "timeline" | "settings";
const trackerTabs = ["timeline", "insights", "settings"] as const;
const fieldTypes: Array<[TrackerFieldType,string]> = [["time_range","Time range"],["number","Number"],["single_select","Single select"],["multi_select","Multi select"],["text","Text"],["boolean","Switch"],["rating","Rating"]];
const emptyField = { name:"", type:"text" as TrackerFieldType, options:"", required:false, showAfterQuickCapture:false, includeInStats:false, unit:"", precision:"0" };
const emptyGoal = { operator:"<=" as TrackerGoalOperator, targetValue:"", periodType:"monthly" as TrackerPeriodType, customPeriod:"" };
type SettingsConfirmation = { title: string; message: string; label: string; destructive: boolean; action: () => Promise<unknown> };
const emptyReminder = { reminderMode:"missing" as TrackerReminderMode, periodDays:"1", configuredTime:"20:00", anchorDate:new Date().toLocaleDateString("en-CA") };

type DetailProps={initial:TrackerDetailData;trackerId:number;initialEntry?:TrackerEntry;openDetailedRecord?:boolean;settingsOnly?:boolean;navigation:{push:(path:string)=>void;refresh:()=>void};transport?:BusinessRequest;LinkComponent:ComponentType<{href:string;className?:string;children:ReactNode}>;Picture?:ComponentType<{tracker:Tracker;size?:number}>;reconcileNotifications?:boolean};
const webRequest:BusinessRequest=(path,init)=>fetch(path,init);
function PlainPicture({tracker,size}:{tracker:Tracker;size?:number}){return <TrackerPicture icon={tracker.icon} size={size}/>;}
export function TrackerDetailContent({initial,trackerId,initialEntry,openDetailedRecord=false,settingsOnly=false,navigation:router,transport=webRequest,LinkComponent:Link,Picture:TrackerIcon=PlainPicture,reconcileNotifications=true}:DetailProps) {
  const {english}=useLocale();
  const swipeRootRef=useRef<HTMLDivElement>(null),swipeTabsRef=useRef<HTMLElement>(null);
  const [detail,setDetail]=useServerDataState<TrackerDetailData|null>(initial),[loading,setLoading]=useState(false),[working,setWorking]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState(""),[query,setQuery]=useRememberedState("TrackerDetailView:query", ""),[tab,setTab]=useRememberedState<Tab>("TrackerDetailView:tab", "timeline");
  const [showEntry,setShowEntry]=useState(openDetailedRecord || Boolean(initialEntry)),[showField,setShowField]=useState(false),[rulePanel,setRulePanel]=useState<"goal"|"reminder"|null>(null);
  const [showRename,setShowRename]=useState(false),[trackerName,setTrackerName]=useState("");
  const [trackerGroup,setTrackerGroup]=useState(""),[trackerQuick,setTrackerQuick]=useState(true),[editingFieldId,setEditingFieldId]=useState<number|null>(null);
  const [periodFilter,setPeriodFilter]=useState<TimelinePeriod>("all"),[fieldFilter,setFieldFilter]=useRememberedState("TrackerDetailView:fieldFilter", ""),[fieldValueFilter,setFieldValueFilter]=useState("");
  const [fieldDraft,setFieldDraft]=useState(emptyField),[goalDraft,setGoalDraft]=useState(emptyGoal),[reminderDraft,setReminderDraft]=useState(emptyReminder);
  const [editingReminderId,setEditingReminderId]=useState<number|null>(null);
  const [confirmation,setConfirmation]=useState<SettingsConfirmation|null>(null);
  const [insightPeriod,setInsightPeriod]=useState<TrackerInsightPeriod>("month");
  const [chartFilter,setChartFilter]=useState<{kind:"monthly"|"weekdays"|"dayParts";key:string;label:string}|null>(null);
  const [editingEntry,setEditingEntry]=useState<TrackerEntry|undefined>(initialEntry);
  const [pendingDeletion,setPendingDeletion]=useState<TrackerEntry|null>(null);
  useSectionSwipe({active:tab,sections:trackerTabs,rootRef:swipeRootRef,feedbackRef:swipeTabsRef,onChange:setTab,enabled:!settingsOnly&&Boolean(detail),ignoreSelector:".tracker-bars, .tracker-heatmap-calendar, .tracker-entry-actions, .tracker-sort-grip"});
  const commitDeletion=useEffectEvent(async()=>{
    if(!pendingDeletion)return;
    await request(`/api/trackers/${trackerId}/entries?entryId=${pendingDeletion.id}`,{method:"DELETE"},english?"Record deleted.":"记录已删除。");
    setPendingDeletion(null);
  });
  useEffect(()=>{
    if(!pendingDeletion||working)return;
    const timer=window.setTimeout(()=>void commitDeletion(),5000);
    return()=>window.clearTimeout(timer);
  },[pendingDeletion,working]);
  const load=useCallback(async()=>{setLoading(true);try{const response=await transport(`/api/trackers/${trackerId}`,{cache:"no-store"});if(response.ok)setDetail(await response.json());else setError(((await response.json())as ApiError).error);}catch{setError(english?"Could not refresh records. Reload the page to try again.":"刷新记录失败，请重新加载页面。");}finally{setLoading(false);}},[trackerId, setDetail, english,transport]);
  useDataRefresh("/trackers", () => load());
  async function request(url:string,options:RequestInit,success?:string){if(working)return false;setWorking(true);setError("");setMessage("");try{const response=await transport(url,options);if(!response.ok){setError(((await response.json())as ApiError).error);return false;}invalidateCachedJson("/api/trackers/quick-log");await load();try{if(reconcileNotifications)await reconcileNativeNotifications();}catch{/* Web Push remains the fallback. */}if(success)setMessage(success);return true;}catch(reason){setError(reason instanceof Error?reason.message:(english?"Could not save this change. Please try again.":"保存失败，请重试。"));return false;}finally{setWorking(false);}}
  async function quick(){if(await request(`/api/trackers/${trackerId}/entries`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({occurredAt:new Date().toISOString(),values:{},note:""})},english?"Record saved":"记录已保存")){playNativeHaptic("light");setShowEntry(false);}}
  function openEntryForm(){setEditingEntry(undefined);setTab("timeline");setShowEntry(true);}
  function capture(){if(detail?.tracker.quickCaptureEnabled)void quick();else openEntryForm();}
  async function addField(event:FormEvent){event.preventDefault();if(working)return;const activeCount=detail?.fields.filter((field)=>!field.archivedAt).length??0;const editing=editingFieldId!==null;const ok=await request(`/api/trackers/${trackerId}/fields${editing?`?fieldId=${editingFieldId}`:""}`,{method:editing?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(editing?{name:fieldDraft.name,required:fieldDraft.required,includeInStats:fieldDraft.includeInStats}:{...fieldDraft,showAfterQuickCapture:false,precision:Number(fieldDraft.precision),options:fieldDraft.options.split(/[，,]/).map(item=>item.trim()).filter(Boolean),defaultValue:null,sortOrder:activeCount})});if(ok){setFieldDraft(emptyField);setEditingFieldId(null);setShowField(false);setMessage(english?"Property saved.":"属性已保存。");}}
  async function addGoal(event:FormEvent){event.preventDefault();const ok=await request(`/api/trackers/${trackerId}/goals`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...goalDraft,targetValue:Number(goalDraft.targetValue),enabled:true})});if(ok){setGoalDraft(emptyGoal);setRulePanel(null);setMessage(english?"Goal saved.":"目标已保存。");}}
  function trackerReminderPayload(reminder:typeof reminderDraft,enabled=true){return{...reminder,periodDays:Number(reminder.periodDays),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,enabled};}
  async function addReminder(event:FormEvent){event.preventDefault();const editing=editingReminderId!==null;const ok=await request(`/api/trackers/${trackerId}/reminders${editingReminderId?`?reminderId=${editingReminderId}`:""}`,{method:editingReminderId?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(trackerReminderPayload(reminderDraft))});if(ok){setReminderDraft({...emptyReminder,anchorDate:new Date().toLocaleDateString("en-CA")});setEditingReminderId(null);setRulePanel(null);setMessage(english?(editing?"Reminder updated.":"Reminder added."):(editing?"提醒已更新。":"提醒已添加。"));}}
  async function toggleTrackerReminder(reminder:TrackerReminder){await request(`/api/trackers/${trackerId}/reminders?reminderId=${reminder.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({reminderMode:reminder.reminderMode,periodDays:reminder.periodDays,configuredTime:reminder.configuredTime,anchorDate:reminder.anchorDate,timezone:reminder.timezone,enabled:!reminder.enabled})});}
  async function renameTracker(event:FormEvent){event.preventDefault();if(await request(`/api/trackers/${trackerId}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:trackerName,groupName:trackerGroup,quickCaptureEnabled:trackerQuick})})){setShowRename(false);setMessage(english?"Tracker updated.":"基本信息已保存。");}}
  function editTrackerReminder(reminder:TrackerReminder){setReminderDraft({reminderMode:reminder.reminderMode,periodDays:String(reminder.periodDays),configuredTime:reminder.configuredTime,anchorDate:reminder.anchorDate});setEditingReminderId(reminder.id);setRulePanel("reminder");}
  function closeReminderSheet(){setRulePanel(null);setEditingReminderId(null);setReminderDraft({...emptyReminder,anchorDate:new Date().toLocaleDateString("en-CA")});}
  async function uploadIcon(file:File|undefined){
    if(!file||working)return;
    if(file.size>4*1024*1024){setError(english?"The image must be smaller than 4 MB.":"图片不能超过 4 MB。");return;}
    if(!["image/jpeg","image/png","image/webp"].includes(file.type)){setError(english?"Use a JPG, PNG or WebP image.":"请选择 JPG、PNG 或 WebP 图片。");return;}
    const body=new FormData();body.set("file",file);
    await request(`/api/trackers/${trackerId}/icon`,{method:"POST",body},english?"Image updated.":"图片已更新。");
  }
  async function removeTracker(){
    if(working)return false;
    setWorking(true);setError("");
    try{const response=await transport(`/api/trackers/${trackerId}`,{method:"DELETE"});if(!response.ok){setError(((await response.json())as ApiError ).error);return false;}
      invalidateCachedJson("/api/trackers/quick-log");try{if(reconcileNotifications)await reconcileNativeNotifications();}catch{/* Web Push remains the fallback. */}
      showActionToast(english?"Tracker deleted":"Tracker 已删除","deleted");router.push("/trackers");router.refresh();return true;
    }catch{setError(english?"Could not delete the Tracker. Please try again.":"删除失败，请重试。");return false;}finally{setWorking(false);}
  }
  function openField(field?:TrackerField){setError("");setEditingFieldId(field?.id??null);setFieldDraft(field?{name:field.name,type:field.type,options:field.options.join(", "),required:field.required,showAfterQuickCapture:false,includeInStats:field.includeInStats,unit:field.unit,precision:String(field.precision)}:emptyField);setShowField(true);}
  async function setFieldArchived(field:TrackerField,archived:boolean){await request(`/api/trackers/${trackerId}/fields?fieldId=${field.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({archived})},english?(archived?"Property archived; historical values are kept.":"Property restored."):(archived?"属性已归档，历史值已保留。":"属性已恢复。"));}
  function removeField(field:TrackerField){
    setError("");setConfirmation({title:english?"Permanently delete property":"永久删除属性",message:english?`Delete “${field.name}” and its values in ALL historical records? Other properties, dates and notes stay. This cannot be undone.`:`删除属性「${field.name}」及全部历史记录中该属性的值？其他属性、时间和备注会保留。删除后无法恢复。`,label:english?"Delete permanently":"确认永久删除",destructive:true,action:()=>request(`/api/trackers/${trackerId}/fields?fieldId=${field.id}&permanent=true`,{method:"DELETE"},english?"Property and historical values deleted.":"属性及其历史值已删除。")});
  }
  async function setTrackerArchived(archived:boolean){
    const save=()=>request(`/api/trackers/${trackerId}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({archived})},english?(archived?"Tracker archived.":"Tracker restored; enable reminders separately."):(archived?"Tracker 已归档。":"Tracker 已恢复，请按需重新开启提醒。"));
    if(archived){setError("");setConfirmation({title:english?"Archive Tracker":"归档 Tracker",message:english?"History is kept. New recording and all reminders stop. You can restore this Tracker later; reminders must be enabled separately.":"历史数据会保留，暂停新增记录并关闭所有提醒。之后可以恢复 Tracker，提醒需按需重新开启。",label:english?"Archive":"确认归档",destructive:false,action:save});}
    else await save();
  }
  if(loading&&!detail)return <PageLoading title="观测" englishTitle="Tracker" />;
  if(!detail)return <div className="page"><PageHeader eyebrow="" title={english?"Tracker not found":"找不到 Tracker"} description={error}/><Link className="button secondary" href="/trackers">{english?"Back to Trackers":"返回 Trackers"}</Link></div>;
  const {tracker,stats}=detail;
  const periodEntries=trackerInsightEntries(detail.entries,insightPeriod);
  const periodLabelText=english?{month:"This month","90d":"Last 90 days",year:"Last 365 days"}[insightPeriod]:{month:"本月","90d":"最近 90 天",year:"最近一年"}[insightPeriod];
  const selectedFilterField=detail.fields.find((field)=>field.key===fieldFilter);
  const chartEntryIds=chartFilter?new Set(trackerDistributionEntries(periodEntries,chartFilter.kind,chartFilter.key).map(entry=>entry.id)):null;
  const timelineEntries=detail.entries.filter((entry)=>entry.id!==pendingDeletion?.id&&(!chartEntryIds||chartEntryIds.has(entry.id))&&matchesTrackerSearch(entry,query)&&entryMatchesPeriod(entry,periodFilter)&&entryMatchesField(entry,selectedFilterField,fieldValueFilter));
  const filtersActive=Boolean(query.trim()||periodFilter!=="all"||fieldFilter||chartFilter);
  function openChartRecords(kind:"monthly"|"weekdays"|"dayParts",key:string,label:string){setQuery("");setPeriodFilter("all");setFieldFilter("");setFieldValueFilter("");setChartFilter({kind,key,label});setTab("timeline");}
  const activeTab=settingsOnly?"settings":tab;
  return <div ref={swipeRootRef} className={settingsOnly?"tracker-settings-embedded":"page tracker-detail-page"}>
    {!settingsOnly&&<>
    <PageHeader eyebrow="" description={tracker.groupName || undefined} title={<span className="tracker-title"><TrackerIcon tracker={tracker} size={44}/><span>{tracker.name}</span></span>} action={tracker.archivedAt?<span className="tracker-archived-label">{english?"Archived":"已归档"}</span>:<PageLogAction label={tracker.quickCaptureEnabled?(english?"Record now":"立即记录"):(english?"Add record":"新增记录")} disabled={working} onClick={capture}><Icon name="plus"/>{tracker.quickCaptureEnabled?(english?"Record now":"立即记录"):(english?"Add record":"新增记录")}</PageLogAction>}/>
    <nav ref={swipeTabsRef} className="tracker-tabs" role="tablist" aria-label={english?"Tracker views":"Tracker 视图"}>{trackerTabs.map((value,index,values)=><button type="button" role="tab" id={`tracker-tab-${value}`} aria-controls={`tracker-panel-${value}`} aria-selected={tab===value} tabIndex={tab===value?0:-1} className={tab===value?"active":""} onClick={()=>setTab(value)} onKeyDown={event=>{const next=event.key==="ArrowRight"?values[(index+1)%values.length]:event.key==="ArrowLeft"?values[(index+values.length-1)%values.length]:event.key==="Home"?values[0]:event.key==="End"?values.at(-1):undefined;if(next){event.preventDefault();setTab(next);document.getElementById(`tracker-tab-${next}`)?.focus();}}} key={value}>{english?{timeline:"Timeline",insights:"Insights",settings:"Settings"}[value]:{timeline:"时间线",insights:"洞察",settings:"设置"}[value]}</button>)}</nav>
    </>}
    <div role="tabpanel" id={`tracker-panel-${activeTab}`} aria-label={settingsOnly?(english?"Tracker settings":"Tracker 设置"):undefined} aria-labelledby={settingsOnly?undefined:`tracker-tab-${tab}`} tabIndex={0}>
    {error&&<ErrorNotice>{error}</ErrorNotice>}
    {tracker.archivedAt&&<p className="tracker-archive-note">{english?"History is preserved. Restore this Tracker in Settings to record again; reminders remain off until you enable them.":"历史数据已保留。可在设置中恢复 Tracker，恢复后请按需重新开启提醒。"}</p>}
    {message&&<ToastNotice message={message} onShown={() => setMessage("")} />}
    {pendingDeletion&&<div className="tracker-delete-undo" role="status"><span>{english?"Deleting in 5 seconds. Leaving this page cancels deletion.":"5 秒后删除，离开页面将取消删除。"}</span><button className="text-button" disabled={working} onClick={()=>setPendingDeletion(null)}>{english?"Undo":"撤销"}</button></div>}


    {activeTab==="insights"&&<TrackerActivityInsights entries={detail.entries} fields={detail.fields} historyInsights={detail.insights} total={stats.total} lastOccurredAt={stats.lastOccurredAt} archived={Boolean(tracker.archivedAt)} working={working} insightPeriod={insightPeriod} onPeriodChange={setInsightPeriod} onCapture={capture} onSelectChart={openChartRecords}>
      {detail.goals.filter(goal=>goal.enabled&&goal.periodType!=="custom").map(goal=>{const count={daily:stats.today,weekly:stats.week,monthly:stats.month,yearly:stats.year,custom:0}[goal.periodType];return <p className="tracker-goal-progress" key={goal.id}>{periodLabel(goal.periodType,english)} · {english?"Goal":"目标"} {goal.operator==="<="?(english?"at most":"最多"):goal.operator===">="?(english?"at least":"至少"):(english?"exactly":"恰好")} {goal.targetValue} {english?"records":"条"}<strong>{english?`Recorded ${count}`:`已记录 ${count} 条`}</strong></p>;})}
      {stats.reminderDue&&<div className="tracker-reminder-alert"><Icon name="history"/><span>{english?"A reminder is due for this Tracker.":"这个 Tracker 有待处理的提醒。"}</span><button className="text-button" onClick={()=>{setTab("settings");requestAnimationFrame(()=>{document.querySelectorAll<HTMLDetailsElement>(".tracker-settings-disclosure").forEach(item=>item.open=true);});}}>{english?"View reminders":"查看提醒"}</button></div>}
    </TrackerActivityInsights>}

    {activeTab==="timeline"&&<>
      {showEntry&&<TrackerEntryEditor key={editingEntry?.id??"new"} trackerId={trackerId} fields={detail.fields} entry={editingEntry} onClose={()=>{setShowEntry(false);setEditingEntry(undefined);}} onSaved={async()=>{invalidateCachedJson("/api/trackers/quick-log");await load();setMessage(english?"Record saved.":"记录已保存。");}}/>}
      {chartFilter&&<p className="tracker-chart-caption">{periodLabelText} · {chartFilter.label} · {english?"Filtered from chart":"来自图表的筛选"}</p>}
      <section className="tracker-detail-section tracker-timeline-section"><div className="section-heading tracker-timeline-heading"><div><h2>{english?"Every record":"全部记录"}</h2><p>{filtersActive?(english?`${timelineEntries.length} of ${stats.total} records`:`显示 ${timelineEntries.length} / ${stats.total} 条记录`):(english?`${stats.total} record${stats.total===1?"":"s"}`:`${stats.total} 条记录`)}</p></div></div>
        <TrackerTimelineToolbar query={query} setQuery={setQuery} fields={detail.fields} periodFilter={periodFilter} setPeriodFilter={setPeriodFilter} fieldFilter={fieldFilter} setFieldFilter={setFieldFilter} fieldValueFilter={fieldValueFilter} setFieldValueFilter={setFieldValueFilter} filtersActive={filtersActive} onClear={()=>{setQuery("");setPeriodFilter("all");setFieldFilter("");setFieldValueFilter("");setChartFilter(null);}} />
        {timelineEntries.length?<TrackerTimelineRecords entries={timelineEntries} fields={detail.fields} working={working} deleteDisabled={Boolean(pendingDeletion)} onEdit={entry=>{setEditingEntry(entry);setShowEntry(true);}} onDelete={entry=>{setError('');setConfirmation({title:english?'Delete record':'删除记录',message:english?'Permanently delete this record and its property values and note? This cannot be undone.':'永久删除这条记录及其属性值和备注？删除后无法恢复。',label:english?'Delete permanently':'确认永久删除',destructive:true,action:async()=>{setPendingDeletion(entry);return true;}});}}/>:<div className="empty-state compact-empty"><h2>{filtersActive?(english?"No matching records":"没有匹配的记录"):(english?"No records yet":"暂无记录")}</h2><p>{filtersActive?(english?"Try a wider time range or clear one of the filters.":"尝试扩大时间范围或清除部分筛选条件。"):(english?"Use Record now when this happens.":"发生时立即记录即可。")}</p></div>}
      </section>
    </>}

    {activeTab==="settings"&&<TrackerSettingsView detail={detail} total={stats.total} picture={<TrackerIcon tracker={tracker} size={64}/>} busy={working} actions={{editBasics: ()=>{setError("");setTrackerName(tracker.name);setTrackerGroup(tracker.groupName);setTrackerQuick(tracker.quickCaptureEnabled);setShowRename(true);},
chooseImage: event=>{void uploadIcon(event.target.files?.[0]);event.target.value="";},
resetImage: ()=>void request(`/api/trackers/${trackerId}/icon`,{method:"DELETE"},english?"Default icon restored.":"已恢复默认图标。"),
addField: ()=>openField(),
editField: field => ()=>openField(field),
archiveField: field => ()=>void setFieldArchived(field,true),
deleteField: field => ()=>void removeField(field),
restoreField: field => ()=>void setFieldArchived(field,false),
deleteArchivedField: field => ()=>void removeField(field),
addGoal: ()=>{setError("");setGoalDraft(emptyGoal);setRulePanel("goal");},
deleteGoal: goal => ()=>{setError("");setConfirmation({title:english?"Delete goal":"删除目标",message:english?"Delete this goal? All records are kept.":"删除此目标？全部记录会保留。",label:english?"Delete":"确认删除",destructive:true,action:()=>request(`/api/trackers/${trackerId}/goals?goalId=${goal.id}`,{method:"DELETE"},english?"Goal deleted.":"目标已删除。")});},
addReminder: ()=>{setError("");closeReminderSheet();setRulePanel("reminder");},
toggleReminder: reminder => ()=>void toggleTrackerReminder(reminder),
editReminder: reminder => ()=>{setError("");editTrackerReminder(reminder);},
deleteReminder: reminder => ()=>{setError("");setConfirmation({title:english?"Delete reminder":"删除提醒",message:english?"Delete this reminder? All records are kept.":"删除此提醒？全部记录会保留。",label:english?"Delete":"确认删除",destructive:true,action:()=>request(`/api/trackers/${trackerId}/reminders?reminderId=${reminder.id}`,{method:"DELETE"},english?"Reminder deleted.":"提醒已删除。")});},
toggleArchived: ()=>void setTrackerArchived(!tracker.archivedAt),
deleteTracker: ()=>{setError("");setConfirmation({title:english?"Permanently delete Tracker":"永久删除 Tracker",message:english?`Delete “${tracker.name}” and all ${stats.total} records, properties, goals and reminders? This cannot be undone.`:`删除「${tracker.name}」及全部 ${stats.total} 条记录、属性、目标和提醒？删除后无法恢复。`,label:english?"Delete permanently":"确认永久删除",destructive:true,action:removeTracker});}}} basicsEditor={showRename&&<FormSheet title={english?"Edit Tracker":"编辑 Tracker"} onClose={()=>setShowRename(false)} formId="tracker-basics-form" submitLabel={english?"Save changes":"保存修改"} busy={working}><form id="tracker-basics-form" className="editor-card compact-editor" onSubmit={renameTracker}>
          <label className="field"><span>{english?"Name":"名称"}</span><input required maxLength={80} value={trackerName} onChange={event=>setTrackerName(event.target.value)}/></label>
          <div className="field"><span>{english?"Group":"分组"}</span><SuggestedInput recommendationStyle="search" suggestionLabel={english?"Group":"分组"} suggestions={detail.groupNames??[tracker.groupName]} maxLength={60} value={trackerGroup} onValueChange={setTrackerGroup}/></div>
          <TrackerCaptureToggle enabled={trackerQuick} onChange={setTrackerQuick}/>
          {error&&<ErrorNotice>{error}</ErrorNotice>}
        </form></FormSheet>}
fieldEditor={showField&&<FormSheet title={editingFieldId?(english?"Edit property":"编辑属性"):(english?"Add property":"新增属性")} onClose={()=>{setShowField(false);setEditingFieldId(null);setFieldDraft(emptyField);}} formId="tracker-field-form" submitLabel={english?"Save property":"保存属性"} busy={working}><form id="tracker-field-form" className="editor-card tracker-rule-form" onSubmit={addField}>
          <div className="form-grid"><label className="field"><span>{english?"Property name":"属性名称"}</span><input required maxLength={60} value={fieldDraft.name} onChange={event=>setFieldDraft({...fieldDraft,name:event.target.value})}/></label><label className="field"><span>{english?"Type":"类型"}</span><ChoiceSelect disabled={editingFieldId!==null} value={fieldDraft.type} onChange={event=>{const type=event.target.value as TrackerFieldType;setFieldDraft({...fieldDraft,type,includeInStats:type!=="text"});}}>{fieldTypes.map(([value])=><option key={value} value={value}>{fieldTypeLabel(value,english)}</option>)}</ChoiceSelect></label>
          {!editingFieldId&&["single_select","multi_select"].includes(fieldDraft.type)&&<label className="field wide"><span>{english?"Options, separated by commas":"选项，用逗号分隔"}</span><input required value={fieldDraft.options} onChange={event=>setFieldDraft({...fieldDraft,options:event.target.value})}/></label>}
          {!editingFieldId&&fieldDraft.type==="number"&&<><label className="field"><span>{english?"Unit":"单位"}</span><input maxLength={20} value={fieldDraft.unit} onChange={event=>setFieldDraft({...fieldDraft,unit:event.target.value})} placeholder="ml, kg, ¥…"/></label><label className="field"><span>{english?"Decimal places":"小数位数"}</span><input type="number" min="0" max="6" value={fieldDraft.precision} onChange={event=>setFieldDraft({...fieldDraft,precision:event.target.value})}/></label></>}</div>
          {editingFieldId&&<p className="tracker-settings-help">{english?"The type stays unchanged to preserve the meaning of historical values.":"为保留历史值的含义，已有属性的类型不可更改。"}</p>}
          <div className="tracker-inline-checks"><label><input role="switch" className="toggle-switch" type="checkbox" checked={fieldDraft.required} onChange={event=>setFieldDraft({...fieldDraft,required:event.target.checked})}/>{english?"Required in detailed records":"详细记录时必填"}</label>{fieldDraft.type!=="text"&&<label><input role="switch" className="toggle-switch" type="checkbox" checked={fieldDraft.includeInStats} onChange={event=>setFieldDraft({...fieldDraft,includeInStats:event.target.checked})}/>{english?"Include in Insights":"参与统计"}</label>}</div>
          {fieldDraft.type==="time_range"&&<p className="tracker-settings-help">{english?"Enter start and end dates and times; duration is calculated in minutes.":"填写开始与结束日期时间，自动计算分钟数，支持跨午夜。"}</p>}
          {error&&<ErrorNotice>{error}</ErrorNotice>}
        </form></FormSheet>}
goalEditor={rulePanel==="goal"&&<FormSheet title={english?"Add goal":"新增目标"} onClose={()=>setRulePanel(null)} formId="tracker-goal-form" submitLabel={english?"Save goal":"保存目标"} busy={working}><form id="tracker-goal-form" className="editor-card tracker-rule-form" onSubmit={addGoal}><div className="form-grid"><label className="field"><span>{english?"Rule":"数量要求"}</span><ChoiceSelect value={goalDraft.operator} onChange={event=>setGoalDraft({...goalDraft,operator:event.target.value as TrackerGoalOperator})}><option value="<=">{english?"At most":"最多"}</option><option value=">=">{english?"At least":"至少"}</option><option value="=">{english?"Exactly":"恰好"}</option></ChoiceSelect></label><label className="field"><span>{english?"Records":"记录条数"}</span><input required type="number" min="1" step="1" value={goalDraft.targetValue} onChange={event=>setGoalDraft({...goalDraft,targetValue:event.target.value})}/></label><label className="field"><span>{english?"Period":"周期"}</span><ChoiceSelect value={goalDraft.periodType} onChange={event=>setGoalDraft({...goalDraft,periodType:event.target.value as TrackerPeriodType})}>{(["daily","weekly","monthly","yearly","custom"]as TrackerPeriodType[]).map(period=><option key={period} value={period}>{periodLabel(period,english)}</option>)}</ChoiceSelect></label>{goalDraft.periodType==="custom"&&<label className="field"><span>{english?"Custom period description":"自定义周期说明"}</span><input maxLength={200} value={goalDraft.customPeriod} onChange={event=>setGoalDraft({...goalDraft,customPeriod:event.target.value})}/></label>}</div>{error&&<ErrorNotice>{error}</ErrorNotice>}</form></FormSheet>}
reminderEditor={rulePanel==="reminder"&&<FormSheet title={editingReminderId?(english?"Edit reminder":"编辑提醒"):(english?"Add reminder":"新增提醒")} onClose={closeReminderSheet} formId="tracker-reminder-form" submitLabel={english?"Save reminder":"保存提醒"} busy={working}><form id="tracker-reminder-form" className="editor-card tracker-rule-form" onSubmit={addReminder}><label className="field"><span>{english?"Type":"提醒方式"}</span><ChoiceSelect value={reminderDraft.reminderMode} onChange={event=>setReminderDraft({...reminderDraft,reminderMode:event.target.value as TrackerReminderMode})}><option value="standard">{english?"Regular reminder":"固定周期提醒"}</option><option value="missing">{english?"Remind only if missing":"未记录时提醒"}</option></ChoiceSelect></label><div className="form-grid"><label className="field"><span>{reminderDraft.reminderMode==="missing"?(english?"Observation period (days)":"观察周期（天）"):(english?"Repeat every (days)":"间隔天数")}</span><input required type="number" min="1" max="999" step="1" value={reminderDraft.periodDays} onChange={event=>setReminderDraft({...reminderDraft,periodDays:event.target.value})}/></label><label className="field"><span>{english?"Reminder time":"提醒时间"}</span><input required type="time" value={reminderDraft.configuredTime} onChange={event=>setReminderDraft({...reminderDraft,configuredTime:event.target.value})}/></label><label className="field"><span>{english?"Period starts":"周期起点"}</span><input required type="date" value={reminderDraft.anchorDate} onChange={event=>setReminderDraft({...reminderDraft,anchorDate:event.target.value})}/></label></div><p className="tracker-settings-help">{reminderDraft.reminderMode==="missing"?(english?"A record in the observation period suppresses this reminder.":"观察周期内已有记录时，不发送提醒。"):(english?"This reminder is sent regardless of existing records.":"无论是否已有记录，都按周期发送提醒。")}</p>{error&&<ErrorNotice>{error}</ErrorNotice>}</form></FormSheet>} />}

    </div>
    {confirmation&&<FormSheet title={confirmation.title} onClose={()=>setConfirmation(null)} formId="tracker-confirmation-form" submitLabel={confirmation.label} busy={working} dirty={false}><form id="tracker-confirmation-form" className={confirmation.destructive?"tracker-settings-confirm destructive":"tracker-settings-confirm"} onSubmit={async event=>{event.preventDefault();if(working)return;const result=await confirmation.action();if(result!==false)setConfirmation(null);}}><p>{confirmation.message}</p>{error&&<ErrorNotice>{error}</ErrorNotice>}</form></FormSheet>}
  </div>;
}
