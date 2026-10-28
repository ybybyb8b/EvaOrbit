import {nativeApiFetch} from "./native-api.ts";
import {apiResponseError} from "./response-error.ts";
import {requestFailure,requestOperation} from "./request-diagnostics.ts";
import {getEventKitSyncProgress,reportEventKitSyncProgress} from "./eventkit-sync-progress.ts";
import {appleReadFirstDay,appleReadStart,appleDateInScope,appleItemInScope,calendarPriorityWindow,calendarReadPage} from "./apple-read-scope.ts";
import {eventKitWorkState} from "./eventkit-work-state.ts";
import { eventKitRead, EventKitReadTimeout } from "./eventkit-read.ts";
import { dataChangedEvent, notifyDataChanged, type DataDomain } from "./data-changed.ts";
import type { CalendarEvent,Reminder,Task } from "./types.ts";
import { getNativeHostInfo as readNativeHostInfo, hostSupports, nativeCall as callNative, captureNativeSessionGuard } from "./native-bridge.ts";

let recoveryBatch:string|undefined;
let checkSession:(()=>void)|undefined;
const getNativeHostInfo=()=>eventKitRead(readNativeHostInfo(),"Native Host capabilities");
function nativeCall<T>(method:string,params:Record<string,unknown>={}){
  checkSession?.();const result=callNative<T>(method,method==="eventkit.recover"?{...params,recoveryBatch}:params);
  return ["eventkit.fetch","eventkit.getItem","eventkit.recover"].includes(method)
    ?eventKitRead(result,`Apple ${params.kind==="calendar"?"Calendar":"Reminders"} (${method})`):result;
}

export type EventKitSyncMode="off"|"import"|"two_way";
export type EventKitNotificationOwner="eo"|"apple";
export type EventKitReminderDomain="tasks"|"cats"|"cat_household"|"trackers"|"health"|"subscriptions";
export type EventKitReminderRoutes=Partial<Record<EventKitReminderDomain,string>>;
export type EventKitSource={identifier:string;title:string;sourceIdentifier:string;sourceTitle:string;allowsContentModifications:boolean};
export type EventKitStatus={available:boolean;installationId:string;calendarPermission:string;reminderPermission:string;calendars:EventKitSource[];reminderLists:EventKitSource[]};
export type EventKitModes=Record<string,EventKitSyncMode>;
type Item=Record<string,unknown>;
type Link={id:number;entity_type:"task"|"reminder"|"calendar_event";eo_id:number;eventkit_entity_type:"reminder"|"event";calendar_item_identifier:string;external_identifier:string|null;calendar_identifier:string;source_identifier:string;last_synced_snapshot:Item;last_synced_hash?:string;logical_link_id?:string;recovery_token?:string;binding_state?:"current"|"recovery"|"pending";identity_conflict?:boolean;eo_record_missing?:boolean;bindings?:Item[];external_identifiers?:string[]};
export type EventKitSyncResult={imported:number;exported:number;merged:number;conflicts:Array<{entityType:string;eoId:number;fields:string[]}>;skippedEvents:Array<{title:string;calendarTitle:string;startAt:string;endAt:string}>;lastSync:string;pendingRecovery?:{recent:number;history:number;discoveries:number};recoveryErrors?:string[];scopeOutcomes?:Partial<Record<"calendar"|"reminder",{state:"complete"|"partial"|"failed"|"paused";error?:string;result?:EventKitSyncResult}>>;calendarDiagnostics?:{selectedCalendars:number;readEvents:number;newImports:number;updatedEvents:number;recurringSkipped:number;from:string;to:string};reminderDiagnostics?:{selectedLists:number;readReminders:number;imported:number;exported:number;merged:number;conflicts:number;excludedReminders:number}};
export function eventKitSyncDiagnosticText(result:EventKitSyncResult){
  const calendar=result.calendarDiagnostics,missing=result.conflicts.filter(conflict=>conflict.fields.includes("eo_missing")).length,identity=result.conflicts.filter(conflict=>conflict.fields.includes("identity")).length;
  const reminder=result.reminderDiagnostics;
  const pending=result.pendingRecovery;
  const continuation=pending&&(pending.recent||pending.history||pending.discoveries)?`本轮已保存：近期待处理 ${pending.recent} 条，历史待核对 ${pending.history} 条，新内容待处理 ${pending.discoveries} 条；App 打开期间分批继续。`:"";
  const scopes=result.scopeOutcomes;
  return [scopes?Object.entries(scopes).map(([kind,outcome])=>`${kind==="calendar"?"Calendar":"Reminders"}：${({complete:"Round complete",partial:"Partial sync",failed:"Failed",paused:"Paused"} as const)[outcome.state]}${outcome.error?` · ${outcome.error}`:""}`).join("；"):"",...(result.recoveryErrors??[]),calendar?`Calendar：启用 ${calendar.selectedCalendars} 个日历，读取 ${calendar.readEvents} 条，新导入 ${calendar.newImports} 条，更新 ${calendar.updatedEvents} 条。读取范围 ${calendar.from} 至 ${calendar.to}。`:"",calendar?.selectedCalendars===0?"请将事件所在日历设为 Import only。":"",calendar?.recurringSkipped?`本轮读取中有 ${calendar.recurringSkipped} 条重复事件，当前规则不导入重复事件。`:"",reminder?`Reminders：读取 ${reminder.selectedLists} 个列表、${reminder.readReminders} 条提醒，从 Apple 同步到 EO ${reminder.imported} 条，写入 Apple ${reminder.exported} 条，双向合并 ${reminder.merged} 条，${reminder.conflicts} 个冲突需处理。`:"",reminder?.selectedLists===0?"尚未启用 Reminder 来源或设置 EO → Reminder List。":"",reminder?.excludedReminders?`读取的提醒中有 ${reminder.excludedReminders} 条标题包含“续火花”，已按规则排除。`:"",missing?`暂停 ${missing} 条旧关联：EO 原记录不存在，关联和 Apple 对象均保留。`:"",identity?`有 ${identity} 条关联无法唯一确认，相应导入或镜像创建已暂停。`:"",continuation].filter(Boolean).join(" ");
}
let activeEventKitSync:Promise<EventKitSyncResult>|null=null;
export type EventKitSyncScope="all"|"calendar"|"reminder";
let activeEventKitKey="";

export function runEventKitSyncSingleFlight(run:()=>Promise<EventKitSyncResult>,scope:EventKitSyncScope="all",key:string=scope):Promise<EventKitSyncResult>{
  if(activeEventKitSync)return activeEventKitKey===key?activeEventKitSync:activeEventKitSync.catch(()=>{}).then(()=>runEventKitSyncSingleFlight(run,scope,key));
  activeEventKitKey=key;
  const current=run();activeEventKitSync=current;
  void current.then(()=>{if(activeEventKitSync===current)activeEventKitSync=null;},()=>{if(activeEventKitSync===current)activeEventKitSync=null;});
  return current;
}

export function eventKitCanonicalSnapshot(snapshot:Item):Item{const result={...snapshot};for(const key of ["startAt","endAt","completionDate"]){const value=result[key];if(typeof value==="string"&&/^\d{4}-\d{2}-\d{2}T/.test(value)&&Number.isFinite(Date.parse(value)))result[key]=new Date(value).toISOString();}return result;}
export function mergeEventKitSnapshots(base:Item,eo:Item,apple:Item){base=eventKitCanonicalSnapshot(base);eo=eventKitCanonicalSnapshot(eo);apple=eventKitCanonicalSnapshot(apple);const merged:Item={},conflicts:string[]=[];for(const key of new Set([...Object.keys(base),...Object.keys(eo),...Object.keys(apple)])){const b=JSON.stringify(base[key]??null),e=JSON.stringify(eo[key]??null),a=JSON.stringify(apple[key]??null),ec=e!==b,ac=a!==b;if(ec&&ac&&e!==a)conflicts.push(key);else merged[key]=ac?apple[key]:eo[key];}return{merged,conflicts,eoChanged:stable(base)!==stable(eo),appleChanged:stable(base)!==stable(apple)};}
function stable(value:unknown):string{if(Array.isArray(value))return`[${value.map(stable).join(",")}]`;if(value&&typeof value==="object")return`{${Object.entries(value as Item).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;return JSON.stringify(value);}
export async function eventKitSnapshotHash(value:Item){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(stable(eventKitCanonicalSnapshot(value))));return[...new Uint8Array(bytes)].map(value=>value.toString(16).padStart(2,"0")).join("");}
function dayTime(value:string,timezone:string){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(value)),part=(kind:Intl.DateTimeFormatPartTypes)=>parts.find(item=>item.type===kind)?.value??"";return{date:`${part("year")}-${part("month")}-${part("day")}`,time:`${part("hour")}:${part("minute")}`};}
export function taskSnapshot(task:Task):Item{return eventKitCanonicalSnapshot({title:task.title,notes:task.notes,dueDate:task.dueDate,dueTime:task.dueTime,completed:task.completed,completionDate:task.completedAt});}
export function eventKitReminderDomain(reminder:Reminder):Exclude<EventKitReminderDomain,"tasks">|null{if(reminder.targetType==="cat")return"cats";if(reminder.targetType==="cat_household")return"cat_household";if(reminder.targetType==="tracker")return"trackers";if(reminder.targetType==="health")return"health";if(reminder.targetType==="subscription")return"subscriptions";return null;}
export function reminderSnapshot(reminder:Reminder):Item{const due=reminder.snoozedUntil??reminder.nextDueAt,parts=due?dayTime(due,reminder.timezone):null,completed=reminder.status==="completed";return eventKitCanonicalSnapshot({title:reminder.title,notes:reminder.sourceType==="tracker_missing"?"":reminder.note,dueDate:parts?.date??null,dueTime:parts&&reminder.dueHasExplicitTime?parts.time:null,completed,completionDate:completed?reminder.lastCompletedAt:null,eoLastCompletedAt:reminder.lastCompletedAt?new Date(reminder.lastCompletedAt).toISOString():null});}
export function eventKitReminderCompletedSince(reminder:Reminder,base:Item){
  if(!eventKitHasNextOccurrence(reminder)||base.completed||!reminder.lastCompletedAt)return false;
  const completedAt=new Date(reminder.lastCompletedAt).toISOString();
  if(Object.hasOwn(base,"eoLastCompletedAt"))return completedAt!==base.eoLastCompletedAt;
  // Legacy baselines lack a completion watermark. Only infer a late completion
  // when the old Due has passed and EO has already moved to another occurrence.
  const completed=dayTime(completedAt,reminder.timezone),next=reminderSnapshot(reminder);
  return Boolean(base.dueDate)&&(next.dueDate!==base.dueDate||next.dueTime!==base.dueTime)&&`${completed.date}T${completed.time}`>=`${base.dueDate}T${base.dueTime??"00:00"}`;
}
export function appleReminderSnapshot(item:Item):Item{return eventKitCanonicalSnapshot({title:String(item.title??""),notes:String(item.notes??""),dueDate:item.dueDate??null,dueTime:item.dueTime??null,completed:Boolean(item.completed),completionDate:item.completionDate??null});}
export function eventKitReminderMatches(item:Item,snapshots:Item[]){const normalized=stable(appleReminderSnapshot(item));return snapshots.some(snapshot=>stable(appleReminderSnapshot(snapshot))===normalized);}
export function eventKitHasNextOccurrence(reminder:Pick<Reminder,"isActive"|"nextDueAt"|"status">){return reminder.isActive&&Boolean(reminder.nextDueAt)&&reminder.status!=="completed";}
function eventSnapshot(event:CalendarEvent|Item):Item{return eventKitCanonicalSnapshot({title:String(event.title??""),notes:String(event.notes??""),startAt:String("startAt" in event?event.startAt:event.start_at),endAt:String("endAt" in event?event.endAt:event.end_at),isAllDay:Boolean("isAllDay" in event?event.isAllDay:event.is_all_day),timezone:(event.timezone as string|null)??null,location:String(event.location??""),status:String(event.status??"confirmed")});}
function appleEventSnapshot(item:Item):Item{return eventKitCanonicalSnapshot({title:String(item.title??""),notes:String(item.notes??""),startAt:String(item.startAt),endAt:String(item.endAt),isAllDay:Boolean(item.isAllDay),timezone:item.timezone??null,location:String(item.location??""),status:String(item.status??"confirmed")});}
export function eventKitEventRangeValid(snapshot:Item){const start=String(snapshot.startAt??""),end=String(snapshot.endAt??"");if(snapshot.isAllDay)return/^\d{4}-\d{2}-\d{2}$/.test(start)&&/^\d{4}-\d{2}-\d{2}$/.test(end)&&end>start;const startTime=Date.parse(start),endTime=Date.parse(end);return Number.isFinite(startTime)&&Number.isFinite(endTime)&&endTime>startTime;}
export function eventKitRecoveryURL(token:string){if(!/^[0-9a-f-]{36}$/i.test(token))throw new Error("Invalid EventKit recovery token");return`evaorbit://eventkit/${token.toLowerCase()}`;}
export function appleReminderPayload(snapshot:Item,calendarIdentifier:string,identifier?:string,existing?:Item,timezone?:string){const existingAlarms=Array.isArray(existing?.alarms)?existing.alarms:[];return{calendarItemIdentifier:identifier,calendarIdentifier,title:snapshot.title,notes:snapshot.notes,dueDate:snapshot.dueDate,dueTime:snapshot.dueTime,timezone:timezone??(typeof existing?.timezone==="string"?existing.timezone:Intl.DateTimeFormat().resolvedOptions().timeZone),priority:Number(existing?.priority??0),completed:snapshot.completed,completionDate:snapshot.completionDate,alarms:existingAlarms.length?existingAlarms:snapshot.dueTime?[{relativeOffset:0}]:[]};}
class EventKitRequestError extends Error{readonly code:string|undefined;readonly status:number;constructor(message:string,code:string|undefined,status:number){super(message);this.code=code;this.status=status;}}
async function json(url:string,init?:RequestInit,allowMissing=false){
  checkSession?.();
  const request=(async()=>{
    const headers=new Headers(init?.headers);
    if(init?.method&&init.method!=="GET")headers.set("x-evaorbit-refresh-owner","eventkit");
    const response=await nativeApiFetch(url,{cache:"no-store",...init,headers});
    if(allowMissing&&response.status===404)return null;
    if(!response.ok){const body=await response.json().catch(()=>({}));throw new EventKitRequestError(apiResponseError(body,response.status,"Sync request failed",requestOperation(url,init?.method)),typeof body?.code==="string"?body.code:undefined,response.status);}
    if(response.status===204)return null;
    try{return await response.json();}catch(error){throw requestFailure(error,`${requestOperation(url,init?.method)} · response`);}
  })();
  return (init?.method??"GET")==="GET"?eventKitRead(request,`EO ${url.split("?")[0]}`):request;
}
export async function eventKitCalendarRecords(from:Date,to?:Date){const records:CalendarEvent[]=[];let afterId=0;for(;;){const page=await json(`/api/calendar-events?from=${encodeURIComponent(from.toISOString())}${to?`&to=${encodeURIComponent(to.toISOString())}`:""}&limit=500&afterId=${afterId}`) as CalendarEvent[];if(!page.length)return records;const next=page[page.length-1].id;if(next<=afterId)throw new Error("Calendar pagination did not advance");records.push(...page);afterId=next;}}
export async function eventKitEORecords(kind:"task"|"reminder"){
 const records:Item[]=[];let after=0;
 for(;;){const page=await json(`/api/eventkit/records?kind=${kind}&afterId=${after}&limit=500`) as Item[];if(!Array.isArray(page))throw new Error("Invalid EventKit record page");if(!page.length)return records;const next=Number(page.at(-1)?.id);if(!Number.isSafeInteger(next)||next<=after||page.some(row=>Number(row.id)<=after))throw new Error("EventKit record pagination did not advance");records.push(...page);after=next;}
}
async function importCalendarEvent(status:EventKitStatus,apple:Item,snapshot:Item){return json("/api/eventkit/calendar-import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({installationId:status.installationId,apple,snapshot})}) as Promise<{id:number}>;}
export function eventKitNotificationOwner(item:Item):EventKitNotificationOwner{return Array.isArray(item.alarms)&&item.alarms.length>0?"apple":"eo";}
export function eventKitSourceEnabled(calendarIdentifier:string,modes:EventKitModes){return Boolean(modes[calendarIdentifier]&&modes[calendarIdentifier]!=="off");}
export function eventKitCalendarReadModes(calendars:Pick<EventKitSource,"identifier">[],modes:EventKitModes){const next={...modes};for(const calendar of calendars)if(next[calendar.identifier]==="two_way")next[calendar.identifier]="import";return next;}
export function eventKitCalendarSyncRange(_now=new Date()){void _now;return{from:appleReadStart(),to:undefined};}
export function eventKitTaskNeedsAppleMirror(task:Pick<Task,"completed">){return !task.completed;}
export function eventKitReminderExcluded(...items:Array<{title?:unknown}|null|undefined>){return items.some(item=>String(item?.title??"").includes("续火花"));}
export function eventKitLinkScope<T extends{entity_type:string;calendar_identifier:string}>(links:T[],entityType:string,modes:EventKitModes){const all=links.filter(link=>link.entity_type===entityType);return{all,active:all.filter(link=>eventKitSourceEnabled(link.calendar_identifier,modes))};}
export function eventKitImportsUnlinked(kind:"reminder"|"event",mode:EventKitSyncMode){return kind==="event"||mode==="import";}
export function eventKitMissingAppleAction(kind:"reminder"|"event",mode:EventKitSyncMode){return kind==="reminder"&&mode==="two_way"?"recreate":"delete_eo";}
function taskNotificationOwnerMatches(task:Task,apple:Item){const channel=eventKitNotificationOwner(apple)==="apple"?"apple_reminders":"pwa";return(task.reminders??[]).every(rule=>rule.deliveryChannel===channel);}
function reminderNeedsDueAlarm(snapshot:Item,apple:Item){return Boolean(snapshot.dueTime)&&eventKitNotificationOwner(apple)==="eo";}
async function saveLink(status:EventKitStatus,entityType:Link["entity_type"],eoId:number,kind:Link["eventkit_entity_type"],apple:Item,snapshot:Item){snapshot=eventKitCanonicalSnapshot(snapshot);return await json("/api/eventkit/links",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({installationId:status.installationId,entityType,eoId,eventkitEntityType:kind,calendarItemIdentifier:apple.calendarItemIdentifier,externalIdentifier:apple.externalIdentifier,calendarIdentifier:apple.calendarIdentifier,sourceIdentifier:apple.sourceIdentifier,lastSyncedHash:await eventKitSnapshotHash(snapshot),lastSyncedSnapshot:snapshot,appleLastModifiedAt:apple.lastModifiedAt,...(kind==="reminder"?{notificationOwner:eventKitNotificationOwner(apple)}:{})})});}
async function reserveReminderLink(entityType:"task"|"reminder",eoId:number,snapshot:Item,nextOccurrence=false){return json("/api/eventkit/links",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({entityType,eoId,eventkitEntityType:"reminder",lastSyncedSnapshot:snapshot,lastSyncedHash:await eventKitSnapshotHash(snapshot),nextOccurrence})}) as Promise<{recovery_token:string;initial_snapshot:Item}>;}
async function createReminderLink(status:EventKitStatus,entityType:"task"|"reminder",eoId:number,snapshot:Item,calendarIdentifier:string,timezone?:string,nextOccurrence=false){
  if(!hostSupports(await getNativeHostInfo(),"eventkit.recover"))throw new Error("请安装支持关联恢复的 Host 后创建 Reminder 镜像");
  const logical=await reserveReminderLink(entityType,eoId,snapshot,nextOccurrence),recovery=await nativeCall<{status:string;item?:Item}>("eventkit.recover",{kind:"reminder",calendarIdentifiers:[calendarIdentifier],bindings:[],recoveryToken:logical.recovery_token});
  if(!["found","missing"].includes(recovery.status))throw new Error("Reminder 关联无法唯一确认，已暂停创建");
  const saved=recovery.item??(await nativeCall<{item:Item}>("eventkit.save",{kind:"reminder",item:{...appleReminderPayload(snapshot,calendarIdentifier,undefined,undefined,timezone),recoveryToken:logical.recovery_token}})).item;
  // Keep the reserved logical link and Apple marker if the response/binding write fails.
  await saveLink(status,entityType,eoId,"reminder",saved,recovery.item?logical.initial_snapshot:snapshot);return saved;
}
async function adoptReminderLink(status:EventKitStatus,entityType:"task"|"reminder",eoId:number,snapshot:Item,apple:Item,timezone?:string){const saved=reminderNeedsDueAlarm(snapshot,apple)||stable(appleReminderSnapshot(apple))!==stable(appleReminderSnapshot(snapshot))?await nativeCall<{item:Item}>("eventkit.save",{kind:"reminder",item:appleReminderPayload(snapshot,String(apple.calendarIdentifier),String(apple.calendarItemIdentifier),apple,timezone)}).then(value=>value.item):apple;await saveLink(status,entityType,eoId,"reminder",saved,snapshot);return saved;}

const eventKitJSON=json;
async function notifyCommittedChanges(domains:DataDomain[]){
  await eventKitRead(notifyDataChanged(domains,"eventkit"),"sync completion notification").catch(()=>{
    if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent(dataChangedEvent,{detail:{domains,source:"eventkit"}}));
  });
}
export function synchronizeEventKit(status:EventKitStatus,modes:EventKitModes,routes:EventKitReminderRoutes={},scope:EventKitSyncScope="all",maintenance=false):Promise<EventKitSyncResult>{
  if(scope==="all")return synchronizeEventKitScopes(status,modes,routes,maintenance);
  const guardSession=captureNativeSessionGuard();
  return runEventKitSyncSingleFlight(async()=>{
    guardSession();checkSession=guardSession;recoveryBatch=crypto.randomUUID();const changed=new Set<DataDomain>();
    reportEventKitSyncProgress({scope,phase:"reading",completed:0,total:0});let failed=true,recentPending=0,historyPending=0,discoveriesPending=0;
    const sources=scope==="calendar"?status.calendars:status.reminderLists;
    const scopedModes=Object.fromEntries(sources.map(source=>[source.identifier,modes[source.identifier]??"off"]));
    try{
      const result=await performEventKitSync(status,scopedModes,scope==="calendar"?{}:routes,changed,scope,maintenance);
      recentPending=result.pendingRecovery?.recent??0;historyPending=result.pendingRecovery?.history??0;discoveriesPending=result.pendingRecovery?.discoveries??0;
      failed=false;
      return {...result,calendarDiagnostics:scope==="reminder"?undefined:result.calendarDiagnostics,reminderDiagnostics:scope==="calendar"?undefined:result.reminderDiagnostics};
    }finally{try{guardSession();if(changed.size)await notifyCommittedChanges([...changed]);}catch(error){failed=true;throw error;}finally{checkSession=undefined;recoveryBatch=undefined;const previous=getEventKitSyncProgress();reportEventKitSyncProgress({scope,phase:failed?"failed":"complete",completed:previous?.completed??0,total:previous?.total??0,recentPending,historyPending,discoveriesPending});}}
  },scope,stable({scope,maintenance,modes,routes,installationId:status.installationId,calendarPermission:status.calendarPermission,reminderPermission:status.reminderPermission}));
}
export function eventKitSafetyFailure(error:unknown){
 const value=error as {status?:number;code?:string;message?:string};
 return value?.status===401||value?.status===403||["session_expired","account_changed","native_account_not_allowed"].includes(value?.code??"")||/Account changed|账户已切换|登录已失效/.test(value?.message??"");
}
export function eventKitRoundComplete(result:EventKitSyncResult){return Object.values(result.scopeOutcomes??{}).every(outcome=>outcome.state==="complete")&&!result.conflicts.length&&!result.recoveryErrors?.length&&!Object.values(result.pendingRecovery??{}).some(Boolean);}
export async function synchronizeEventKitScopes(status:EventKitStatus,modes:EventKitModes,routes:EventKitReminderRoutes={},maintenance=false,scope:EventKitSyncScope="all",onResult?:(kind:"calendar"|"reminder",outcome:NonNullable<EventKitSyncResult["scopeOutcomes"]>["calendar"])=>void,onStart?:(kind:"calendar"|"reminder")=>void){
 const guardSession=captureNativeSessionGuard(),scopeOutcomes:NonNullable<EventKitSyncResult["scopeOutcomes"]>={};
 const aggregate:EventKitSyncResult={imported:0,exported:0,merged:0,conflicts:[],skippedEvents:[],lastSync:new Date().toISOString(),scopeOutcomes,pendingRecovery:{recent:0,history:0,discoveries:0}};
 for(const kind of scope==="all"?["calendar","reminder"] as const:[scope]){
  guardSession();
  const enabled=kind==="calendar"?status.calendars.some(source=>eventKitSourceEnabled(source.identifier,modes)):status.reminderLists.some(source=>eventKitSourceEnabled(source.identifier,modes))||Object.values(routes).some(Boolean);
  if(!enabled){
   if(scope==="all"){if(kind==="calendar")aggregate.calendarDiagnostics={selectedCalendars:0,readEvents:0,newImports:0,updatedEvents:0,recurringSkipped:0,from:appleReadFirstDay,to:"无固定截止日期（分段读取）"};else aggregate.reminderDiagnostics={selectedLists:0,readReminders:0,imported:0,exported:0,merged:0,conflicts:0,excludedReminders:0};}
   continue;
  }
  const permission=kind==="calendar"?status.calendarPermission:status.reminderPermission;
  if(!["authorized","full_access"].includes(permission)){scopeOutcomes[kind]={state:"paused",error:"Access unavailable; existing records were preserved."};onResult?.(kind,scopeOutcomes[kind]);continue;}
  onStart?.(kind);
  try{
   const result=await synchronizeEventKit(status,modes,routes,kind,maintenance);
   guardSession();scopeOutcomes[kind]={state:eventKitRoundComplete(result)?"complete":"partial",result};
   for(const key of ["imported","exported","merged"] as const)aggregate[key]+=result[key];
   aggregate.recoveryErrors=[...(aggregate.recoveryErrors??[]),...(result.recoveryErrors??[])];
   aggregate.conflicts.push(...result.conflicts);aggregate.skippedEvents.push(...result.skippedEvents);
   if(result.calendarDiagnostics)aggregate.calendarDiagnostics=result.calendarDiagnostics;
   if(result.reminderDiagnostics)aggregate.reminderDiagnostics=result.reminderDiagnostics;
   for(const key of ["recent","history","discoveries"] as const)aggregate.pendingRecovery![key]+=result.pendingRecovery?.[key]??0;
  }catch(error){guardSession();if(eventKitSafetyFailure(error))throw error;scopeOutcomes[kind]={state:"failed",error:error instanceof Error?error.message:"Sync failed"};}
  onResult?.(kind,scopeOutcomes[kind]);
 }
 aggregate.lastSync=new Date().toISOString();return aggregate;
}
async function performEventKitSync(status:EventKitStatus,modes:EventKitModes,routes:EventKitReminderRoutes={},changed=new Set<DataDomain>(),scope:EventKitSyncScope="all",maintenance=false):Promise<EventKitSyncResult>{
  // Track committed EO mutations only; reads and mapping-only writes never request a refresh.
  async function json(url:string,init?:RequestInit,allowMissing=false){const result=await eventKitJSON(url,init,allowMissing);if(init?.method&&init.method!=="GET"){if(url.startsWith("/api/calendar-events"))changed.add("calendar");else if(url.startsWith("/api/tasks")){changed.add("tasks");changed.add("reminders");}else if(url.startsWith("/api/reminders"))changed.add("reminders");}return result;}
  const effectiveModes={...modes};for(const identifier of Object.values(routes))if(identifier)effectiveModes[identifier]="two_way";
  const calendarModes = eventKitCalendarReadModes(status.calendars, effectiveModes);
  const calendarIDs = scope==="reminder"?[]:status.calendars.filter(source => eventKitSourceEnabled(source.identifier, calendarModes)).map(source => source.identifier);
  const syncCalendar = calendarIDs.length > 0;
  const syncReminders = scope!=="calendar"&&(status.reminderLists.some(source => eventKitSourceEnabled(source.identifier, effectiveModes)) || Object.values(routes).some(Boolean));
  const kind = syncCalendar && syncReminders ? "" : syncCalendar ? "&kind=event" : "&kind=reminder";
  const allLinks = syncCalendar || syncReminders ? await json(`/api/eventkit/links?protocol=2&installationId=${encodeURIComponent(status.installationId)}${kind}`) as Link[] : [];
  // Old servers ignore kind. Keep the same safety boundary on the client as well.
  const links = allLinks.filter(link => link.eventkit_entity_type === "event" ? syncCalendar : syncReminders);
  const claimedReminderIDs = new Set(links.filter(link => link.eventkit_entity_type === "reminder").map(link => link.calendar_item_identifier));
  const linkedReminderIDs = Object.keys(routes).length ? links.filter(link => link.eventkit_entity_type === "reminder").map(link => link.calendar_identifier) : [];
  const reminderIDs = [...new Set([...status.reminderLists.filter(source => eventKitSourceEnabled(source.identifier, effectiveModes)).map(source => source.identifier), ...linkedReminderIDs])].filter(identifier => status.reminderLists.some(source => source.identifier === identifier));
  const { from, to } = eventKitCalendarSyncRange();
  const work=eventKitWorkState(status.installationId,scope,[...calendarIDs,...reminderIDs]);
  const configuration=stable({effectiveModes,routes});
  if(work.state.configuration!==configuration){work.state.checked=[];work.state.excluded=[];work.state.retries={};work.state.pending=0;work.state.foregroundDone=false;work.state.cursor=appleReadFirstDay;work.state.configuration=configuration;}
  if(maintenance&&work.state.pending===0&&Date.now()>work.state.retryAt){work.state.checked=[];work.state.cursor=appleReadFirstDay;work.state.foregroundDone=false;work.state.retryAt=Date.now()+6*3600_000;}
  const readingPage=maintenance;
  const priorityWindow=calendarPriorityWindow(),window=calendarReadPage(new Date(`${work.state.cursor}T00:00:00`));
  async function fetchCalendar(){const ranges=readingPage?[priorityWindow,window]:[priorityWindow];const items=await Promise.all(ranges.map(range=>nativeCall<{items:Item[]}>("eventkit.fetch",{kind:"calendar",calendarIdentifiers:calendarIDs,from:range.from.toISOString(),to:range.to.toISOString()})));return [...new Map(items.flatMap(value=>value.items).filter(item=>appleItemInScope("calendar",item)).map(item=>[item.calendarItemIdentifier,item])).values()];}
  const [appleEvents, appleReminders, tasks, reminders, events] = await Promise.all([
    syncCalendar ? fetchCalendar() : [] as Item[],
    reminderIDs.length ? nativeCall<{items: Item[]}>("eventkit.fetch", {kind: "reminder", calendarIdentifiers: reminderIDs, completedSince: from.toISOString()}).then(value => value.items.filter(item=>appleItemInScope("reminder",item))) : [] as Item[],
    syncReminders ? eventKitEORecords("task") as unknown as Promise<Task[]> : [],
    syncReminders ? eventKitEORecords("reminder") as unknown as Promise<Reminder[]> : [],
    syncCalendar ? eventKitCalendarRecords(from, to) : [],
  ]);
  // Reuse this run's batch results. A missing batch entry is never proof of deletion.
  const eoRecords:Record<"calendar_event"|"task",Map<number,CalendarEvent|Task|null>>={calendar_event:new Map(events.map(item=>[item.id,item])),task:new Map(tasks.map(item=>[item.id,item]))};
  async function readEO(entityType:"calendar_event"|"task",id:number){
    const records=eoRecords[entityType];
    if(records.has(id))return records.get(id)!;
    const record=await json(entityType==="calendar_event"?`/api/calendar-events/${id}`:`/api/tasks/${id}`,undefined,true) as CalendarEvent|Task|null;
    records.set(id,record);return record;
  }
  const calendarDiagnostics={selectedCalendars:calendarIDs.length,readEvents:appleEvents.length,newImports:0,updatedEvents:0,recurringSkipped:appleEvents.filter(item=>item.isRecurring).length,from:appleReadFirstDay,to:"无固定截止日期（分段读取）"};
  let lookupCapability:Promise<boolean>|undefined;
  async function lookupApple(link:Link):Promise<{status:"found";item:Item}|{status:"missing"|"unavailable"|"out_of_scope"}>{
    const sources=link.eventkit_entity_type==="event"?status.calendars:status.reminderLists,permission=link.eventkit_entity_type==="event"?status.calendarPermission:status.reminderPermission,syncModes=link.eventkit_entity_type==="event"?calendarModes:effectiveModes;
    if(!["authorized","full_access"].includes(permission)||!eventKitSourceEnabled(link.calendar_identifier,syncModes)||!sources.some(source=>source.identifier===link.calendar_identifier&&source.sourceIdentifier===link.source_identifier))return{status:"unavailable"};
    if(link.logical_link_id){
      recoveryCapability??=getNativeHostInfo().then(info=>hostSupports(info,"eventkit.recover"));
      if(!await recoveryCapability)return{status:"unavailable"};
      const result=await nativeCall<{status:string;item?:Item}>("eventkit.recover",{kind:link.eventkit_entity_type==="event"?"calendar":"reminder",calendarIdentifiers:sources.filter(source=>eventKitSourceEnabled(source.identifier,syncModes)).map(source=>source.identifier),bindings:link.bindings??[link],externalIdentifiers:link.external_identifiers??[],recoveryToken:link.recovery_token});
      if(result.status==="found"&&result.item&&!appleItemInScope(link.eventkit_entity_type==="event"?"calendar":"reminder",result.item))return{status:"out_of_scope"};
      return result.status==="found"&&result.item?{status:"found",item:result.item}:{status:result.status==="missing"?"missing":result.status==="out_of_scope"?"out_of_scope":"unavailable"};
    }
    lookupCapability??=getNativeHostInfo().then(info=>hostSupports(info,"eventkit.getItem"));
    if(!await lookupCapability)return{status:"unavailable"};
    const result=await nativeCall<{status:string;item?:Item}>("eventkit.getItem",{kind:link.eventkit_entity_type==="event"?"calendar":"reminder",calendarItemIdentifier:link.calendar_item_identifier,externalIdentifier:link.external_identifier,calendarIdentifier:link.calendar_identifier,sourceIdentifier:link.source_identifier});
    if(result.status==="found"&&result.item&&!appleItemInScope(link.eventkit_entity_type==="event"?"calendar":"reminder",result.item))return{status:"out_of_scope"};
    if(result.status==="found"&&result.item)return{status:"found",item:result.item};
    return{status:result.status==="missing"?"missing":result.status==="out_of_scope"?"out_of_scope":"unavailable"};
  }
  let imported=0,exported=0,merged=0;const conflicts:Array<{entityType:string;eoId:number;fields:string[]}>=[],skippedEvents:EventKitSyncResult["skippedEvents"]=[],paused=new Set<Link>(),outOfScope=new Set<Link>(),resolved=new Set<Link>(),deferred=new Set<Link>(),recoveryErrors:string[]=[],blockedKinds=new Set<string>();
  function pause(link:Link){resolved.delete(link);paused.add(link);blockedKinds.add(link.eventkit_entity_type);conflicts.push({entityType:link.entity_type,eoId:link.eo_id,fields:["identity"]});}
  function pauseMissingEO(link:Link){
    paused.add(link);conflicts.push({entityType:link.entity_type,eoId:link.eo_id,fields:["eo_missing"]});
    // Without a durable Apple identity, a changed local ID may still be this old object.
    if(link.identity_conflict||(!link.external_identifier&&!link.external_identifiers?.length&&(link.eventkit_entity_type==="event"||!link.recovery_token)))blockedKinds.add(link.eventkit_entity_type);
  }
  function matchesLink(apple:Item,link:Link){return apple.calendarItemIdentifier===link.calendar_item_identifier||Boolean(apple.externalIdentifier&&(apple.externalIdentifier===link.external_identifier||link.external_identifiers?.includes(String(apple.externalIdentifier))))||Boolean(link.recovery_token&&apple.url===eventKitRecoveryURL(link.recovery_token))||Boolean(link.bindings?.some(binding=>binding.calendar_item_identifier===apple.calendarItemIdentifier||(apple.externalIdentifier&&binding.external_identifier===apple.externalIdentifier)));}
  let recoveryCapability:Promise<boolean>|undefined;
  // Recovery is a barrier before any new import/export. A missed old link is never an unlinked object.
  async function recoverLink(link:Link){
    if(link.eo_record_missing){pauseMissingEO(link);return;}
    // Older servers omit the existence flag; recovery must still verify EO before binding.
    if(link.eo_record_missing===undefined&&link.binding_state&&link.binding_state!=="current"){
      const eo=link.entity_type==="reminder"?reminders.find(item=>item.id===link.eo_id):await readEO(link.entity_type,link.eo_id);
      if(!eo){pauseMissingEO(link);outOfScope.add(link);return;}
    }
    if(link.eventkit_entity_type==="reminder"&&eventKitReminderExcluded(link.last_synced_snapshot,link.entity_type==="task"?tasks.find(item=>item.id===link.eo_id):reminders.find(item=>item.id===link.eo_id))){paused.add(link);blockedKinds.add("reminder");return;}
    if(link.identity_conflict){pause(link);return;}
    if(!link.binding_state)return;
    if(link.binding_state==="current"){
      const sources=link.eventkit_entity_type==="event"?status.calendars:status.reminderLists;
      if(!sources.some(source=>source.identifier===link.calendar_identifier&&source.sourceIdentifier===link.source_identifier))pause(link);
      return;
    }
    const ids=link.eventkit_entity_type==="event"?calendarIDs:reminderIDs,permission=link.eventkit_entity_type==="event"?status.calendarPermission:status.reminderPermission;
    if(!ids.length||!["authorized","full_access"].includes(permission)){pause(link);return;}
    recoveryCapability??=getNativeHostInfo().then(info=>hostSupports(info,"eventkit.recover"));
    if(!await recoveryCapability){pause(link);return;}
    const recovered=await nativeCall<{status:string;item?:Item}>("eventkit.recover",{kind:link.eventkit_entity_type==="event"?"calendar":"reminder",calendarIdentifiers:ids,bindings:link.bindings??[],externalIdentifiers:link.external_identifiers??[],recoveryToken:link.recovery_token});
    if(recovered.status==="out_of_scope"){paused.add(link);outOfScope.add(link);return;}
    if(recovered.status!=="found"||!recovered.item){
      if(link.binding_state==="recovery"&&recovered.status==="missing")return;
      // Pending reservations have no old Apple identity; a complete marker scan can safely retry creation.
      if(link.binding_state==="pending"&&recovered.status==="missing"&&link.eventkit_entity_type==="reminder"){
        const eo=link.entity_type==="task"?tasks.find(item=>item.id===link.eo_id):reminders.find(item=>item.id===link.eo_id),domain=link.entity_type==="task"?"tasks":eo?eventKitReminderDomain(eo as Reminder):null,destination=domain?routes[domain]:null;
        if(eo&&(link.entity_type==="task"?!eventKitTaskNeedsAppleMirror(eo as Task):!eventKitHasNextOccurrence(eo as Reminder))){paused.add(link);return;}
        if(eo&&destination&&(link.entity_type==="task"?eventKitTaskNeedsAppleMirror(eo as Task):eventKitHasNextOccurrence(eo as Reminder))){const snapshot=link.entity_type==="task"?taskSnapshot(eo as Task):reminderSnapshot(eo as Reminder),apple=await createReminderLink(status,link.entity_type as "task"|"reminder",link.eo_id,snapshot,destination);appleReminders.push(apple);link.calendar_item_identifier=String(apple.calendarItemIdentifier);link.calendar_identifier=String(apple.calendarIdentifier);link.source_identifier=String(apple.sourceIdentifier);link.external_identifier=String(apple.externalIdentifier??"")||null;link.last_synced_snapshot=snapshot;link.binding_state="current";exported++;return;}
      }
      pause(link);return;
    }
    const apple=recovered.item;
    if(!appleItemInScope(link.eventkit_entity_type==="event"?"calendar":"reminder",apple)){paused.add(link);outOfScope.add(link);return;}
    if(link.eventkit_entity_type==="reminder"&&eventKitReminderExcluded(apple)){paused.add(link);blockedKinds.add("reminder");return;}
    let binding;try{binding=await saveLink(status,link.entity_type,link.eo_id,link.eventkit_entity_type,apple,link.last_synced_snapshot);}catch(error){if(error instanceof EventKitRequestError&&error.code==="eventkit_eo_missing"){pauseMissingEO(link);return;}throw error;}
    Object.assign(link,{id:Number(binding?.id??link.id),calendar_item_identifier:String(apple.calendarItemIdentifier),calendar_identifier:String(apple.calendarIdentifier),source_identifier:String(apple.sourceIdentifier),external_identifier:apple.externalIdentifier??null,binding_state:"current"});
    const items=link.eventkit_entity_type==="event"?appleEvents:appleReminders;if(!items.some(item=>item.calendarItemIdentifier===apple.calendarItemIdentifier))items.push(apple);
    if(link.eventkit_entity_type==="reminder")claimedReminderIDs.add(String(apple.calendarItemIdentifier));
  }
  const priority=calendarPriorityWindow(),processed=new Set<Link>(),checked=new Set(work.state.checked),excluded=new Set(work.state.excluded);
  const appleIndex=new Map<string,Item>();
  for(const [kind,items] of [["event",appleEvents],["reminder",appleReminders]] as const)for(const item of items){
    appleIndex.set(`${kind}:local:${item.calendarItemIdentifier}`,item);
    if(item.externalIdentifier)appleIndex.set(`${kind}:external:${item.externalIdentifier}`,item);
    if(typeof item.url==="string")appleIndex.set(`${kind}:url:${item.url}`,item);
  }
  // This index only prioritizes work; native recovery still checks every candidate for ambiguity.
  function matchedApple(link:Link){
    const kind=link.eventkit_entity_type;
    for(const value of [link.calendar_item_identifier,...(link.bindings??[]).map(binding=>binding.calendar_item_identifier)]){const item=appleIndex.get(`${kind}:local:${value}`);if(item)return item;}
    for(const value of [link.external_identifier,...(link.external_identifiers??[])]){const item=appleIndex.get(`${kind}:external:${value}`);if(item)return item;}
    return link.recovery_token?appleIndex.get(`${kind}:url:${eventKitRecoveryURL(link.recovery_token)}`):undefined;
  }
  const linkKeys=new Map<Link,string>();
  await Promise.all(links.map(async link=>{
    const eo=link.entity_type==="calendar_event"?eoRecords.calendar_event.get(link.eo_id):link.entity_type==="task"?eoRecords.task.get(link.eo_id):reminders.find(item=>item.id===link.eo_id);
    const apple=matchedApple(link);
    linkKeys.set(link,await eventKitSnapshotHash({identity:link.logical_link_id??`${link.entity_type}:${link.eo_id}`,binding:link.calendar_item_identifier,baseline:eventKitCanonicalSnapshot(link.last_synced_snapshot),apple:eventKitCanonicalSnapshot(link.eventkit_entity_type==="event"?appleEventSnapshot(apple??link.last_synced_snapshot):appleReminderSnapshot(apple??link.last_synced_snapshot)),eo:eo?eventKitCanonicalSnapshot({...eo}):null}));
  }));
  const linkKey=(link:Link)=>linkKeys.get(link)!;
  function urgent(link:Link){
    const apple=matchedApple(link),snapshot=apple??link.last_synced_snapshot;
    if(link.eventkit_entity_type==="reminder"&&!snapshot.completed)return true;
    const date=snapshot.startAt??snapshot.dueDate??snapshot.completionDate;
    const timestamp=typeof date==="string"?Date.parse(date):NaN;
    return timestamp>=priority.from.getTime()&&timestamp<priority.to.getTime()||Boolean(apple&&!maintenance);
  }
  const retryDue=(link:Link)=>!maintenance||(work.state.retries[linkKey(link)]?.after??0)<=Date.now();
  const available=links.filter(link=>!link.eo_record_missing&&!excluded.has(linkKey(link))),recent=available.filter(link=>urgent(link)&&(!checked.has(linkKey(link))||link.binding_state==="recovery"||link.binding_state==="pending")&&retryDue(link)).sort((a,b)=>Number(a.binding_state==="current")-Number(b.binding_state==="current")||Number(checked.has(linkKey(a)))-Number(checked.has(linkKey(b)))),history=available.filter(link=>!urgent(link)&&(!checked.has(linkKey(link))||link.binding_state==="recovery"||link.binding_state==="pending")&&retryDue(link)).sort((a,b)=>Number(a.binding_state==="current")-Number(b.binding_state==="current"));
  const selected=[...recent.slice(0,32),...history.slice(0,maintenance?16:8)],selectedSet=new Set(selected);
  for(const link of links){
    if(link.eo_record_missing){pauseMissingEO(link);continue;}
    if(!selectedSet.has(link))paused.add(link);
  }
  let checkedLinks=0;
  reportEventKitSyncProgress({scope,phase:"recovering",completed:0,total:selected.length});
  async function checkLink(link:Link){try{await recoverLink(link);}catch(error){checkSession?.();if(eventKitSafetyFailure(error))throw error;pause(link);recoveryErrors.push(`${link.entity_type} #${link.eo_id}：${error instanceof Error?error.message:"关联核对失败"}`);}processed.add(link);reportEventKitSyncProgress({scope,phase:"recovering",completed:++checkedLinks,total:selected.length});}
  let batch:Link[]=[];
  async function finishBatch(){
    const results=await Promise.allSettled(batch.map(checkLink));batch=[];
    const failure=results.find(result=>result.status==="rejected");
    if(failure?.status==="rejected")throw failure.reason;
  }
  // Each group gets its own cooperative budget, so unresolved recent work cannot starve history.
  for(const group of [selected.filter(urgent),selected.filter(link=>!urgent(link))]){
    const deadline=Date.now()+4000;
    for(const link of group){
      if(checkedLinks&&Date.now()>=deadline)break;
      if(link.eventkit_entity_type==="event"&&link.binding_state==="recovery"){batch.push(link);if(batch.length===4)await finishBatch();}
      else{await finishBatch();await checkLink(link);}
    }
    await finishBatch();
  }
  for(const link of available)if(!processed.has(link)){
    paused.add(link);
    // Retain the complete identity index. Unknown old objects are never "new".
    if(link.binding_state==="recovery"||link.binding_state==="pending"||link.identity_conflict)blockedKinds.add(link.eventkit_entity_type);
  }
  reportEventKitSyncProgress({scope,phase:"reconciling",completed:0,total:0});
  let discoveryBudget=maintenance?16:32,discoveriesPending=0,discoveriesStarted=0;
  let discoveryDeadline=0;
  function claimDiscovery(kind:"event"|"reminder"){
    if(blockedKinds.has(kind)||discoveryBudget<=0||discoveriesStarted>0&&Date.now()>=discoveryDeadline){discoveriesPending++;return false;}
    if(!discoveriesStarted)discoveryDeadline=Date.now()+4000;discoveryBudget--;discoveriesStarted++;return true;
  }
  async function reconcile(kind:"reminder"|"event",entityType:"task"|"calendar_event",appleItems:Item[],eoItems:Array<Task|CalendarEvent>){
    const exportItems=kind==="reminder"?eoItems.filter(item=>!eventKitReminderExcluded(item)):eoItems;
    const syncModes=kind==="event"?calendarModes:effectiveModes,scope=eventKitLinkScope(links,entityType,syncModes),routed=kind==="reminder"?routes.tasks:null,destination=kind==="reminder"?status.reminderLists.find(source=>source.allowsContentModifications&&(routed?source.identifier===routed:syncModes[source.identifier]==="two_way")):undefined,active=entityType==="task"&&routed?scope.all:scope.active,linkedEO=new Set(scope.all.map(link=>link.eo_id)),linkedApple=new Set(scope.all.map(link=>link.calendar_item_identifier));
    function invalidEvent(apple:Item){if(kind!=="event")return false;const snapshot=appleEventSnapshot(apple);if(eventKitEventRangeValid(snapshot))return false;skippedEvents.push({title:String(snapshot.title||"Untitled event"),calendarTitle:status.calendars.find(source=>source.identifier===apple.calendarIdentifier)?.title??"Unknown calendar",startAt:String(snapshot.startAt),endAt:String(snapshot.endAt)});return true;}
    for(const group of [active.filter(urgent),active.filter(link=>!urgent(link))]){
     const deadline=Date.now()+4000;let attempted=0;
     for(const link of group){
      if(paused.has(link))continue;
      if(attempted&&Date.now()>=deadline){paused.add(link);deferred.add(link);continue;}attempted++;resolved.add(link);
      if(kind==="reminder"&&eventKitReminderExcluded(eoItems.find(item=>item.id===link.eo_id),link.last_synced_snapshot))continue;
      const mode=entityType==="task"&&routed?"two_way":syncModes[link.calendar_identifier],eo=await readEO(entityType,link.eo_id);
      if(!eo){pauseMissingEO(link);outOfScope.add(link);continue;}
      const candidates=appleItems.filter(item=>item.calendarItemIdentifier===link.calendar_item_identifier||(item.externalIdentifier&&item.externalIdentifier===link.external_identifier));
      if(candidates.length>1){pause(link);continue;}
      let apple=candidates[0];
      if(kind==="reminder"&&eventKitReminderExcluded(eo,apple,link.last_synced_snapshot))continue;
      if(!apple){const lookup=await lookupApple(link);if(lookup.status==="out_of_scope"){paused.add(link);outOfScope.add(link);continue;}if(lookup.status==="unavailable"){pause(link);continue;}if(lookup.status==="found")apple=lookup.item;}
      if(apple){linkedApple.add(String(apple.calendarItemIdentifier));if(kind==="reminder")claimedReminderIDs.add(String(apple.calendarItemIdentifier));}
      if(kind==="reminder"&&eventKitReminderExcluded(eo,apple,link.last_synced_snapshot))continue;
      if(kind==="event"&&apple?.isRecurring)continue;
      if(apple&&invalidEvent(apple))continue;
      if(kind==="event"&&apple&&!eventKitSourceEnabled(String(apple.calendarIdentifier),syncModes))continue;
      if(eo&&!apple){
        const previousDate=kind==="event"?link.last_synced_snapshot.startAt:link.last_synced_snapshot.dueDate;
        if(previousDate&&!appleDateInScope(previousDate,link.last_synced_snapshot.timezone)){paused.add(link);outOfScope.add(link);continue;}
        if(entityType==="task"&&!eventKitTaskNeedsAppleMirror(eo as Task))continue;
        if(eventKitMissingAppleAction(kind,mode)==="recreate"){const snapshot=taskSnapshot(eo as Task);await createReminderLink(status,"task",eo.id,snapshot,destination?.identifier??link.calendar_identifier);exported++;continue;}
        await json(entityType==="task"?`/api/tasks/${eo.id}`:`/api/calendar-events/${eo.id}`,{method:"DELETE"});await json("/api/eventkit/links",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:link.id})});imported++;continue;
      }
      if(!eo||!apple)continue;
      if(kind==="reminder"&&link.recovery_token&&!apple.url&&status.reminderLists.some(source=>source.identifier===apple?.calendarIdentifier&&source.allowsContentModifications)&&hostSupports(await getNativeHostInfo(),"eventkit.recover")){
        apple=(await nativeCall<{item:Item}>("eventkit.save",{kind:"reminder",item:{...appleReminderPayload(appleReminderSnapshot(apple),String(apple.calendarIdentifier),String(apple.calendarItemIdentifier),apple),recoveryToken:link.recovery_token}})).item;
      }
      const storedBase=link.last_synced_snapshot,base=entityType==="task"?appleReminderSnapshot(storedBase):eventKitCanonicalSnapshot(storedBase),baselineChanged=stable(base)!==stable(storedBase),eoSnap=entityType==="task"?taskSnapshot(eo as Task):eventSnapshot(eo as CalendarEvent),appleSnap=kind==="reminder"?appleReminderSnapshot(apple):appleEventSnapshot(apple),result=mergeEventKitSnapshots(base,eoSnap,appleSnap);
      const relocate=entityType==="task"&&destination&&apple.calendarIdentifier!==destination.identifier;
      if(result.conflicts.length){resolved.delete(link);conflicts.push({entityType,eoId:eo.id,fields:result.conflicts});continue;}
      if(mode!=="two_way"&&result.eoChanged){resolved.delete(link);conflicts.push({entityType,eoId:eo.id,fields:Object.keys(eoSnap).filter(key=>JSON.stringify(eoSnap[key]??null)!==JSON.stringify(base[key]??null))});continue;}
      if(!result.eoChanged&&!result.appleChanged){if(kind==="reminder"&&mode==="two_way"&&(reminderNeedsDueAlarm(eoSnap,apple)||relocate)){const saved=await nativeCall<{item:Item}>("eventkit.save",{kind:"reminder",item:appleReminderPayload(eoSnap,destination?.identifier??String(apple.calendarIdentifier),String(apple.calendarItemIdentifier),apple)});await saveLink(status,entityType,eo.id,kind,saved.item,eoSnap);exported++;continue;}if(baselineChanged||apple.calendarItemIdentifier!==link.calendar_item_identifier||(entityType==="task"&&!taskNotificationOwnerMatches(eo as Task,apple)))await saveLink(status,entityType,eo.id,kind,apple,base);continue;}
      if(result.appleChanged){if(entityType==="task")await json(`/api/tasks/${eo.id}/eventkit`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({task:{title:result.merged.title,notes:result.merged.notes,dueDate:result.merged.dueDate,dueTime:result.merged.dueTime,completed:result.merged.completed,completionDate:result.merged.completionDate}})});else await json(`/api/calendar-events/${eo.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(result.merged)});if(kind==="event")calendarDiagnostics.updatedEvents++;imported++;}
      if(kind==="reminder"&&(result.eoChanged||relocate)&&mode==="two_way"){const saved=await nativeCall<{item:Item}>("eventkit.save",{kind:"reminder",item:appleReminderPayload(result.merged,destination?.identifier??String(apple.calendarIdentifier),String(apple.calendarItemIdentifier),apple)});apple=saved.item;exported++;}
      if(result.appleChanged&&result.eoChanged)merged++;
      await saveLink(status,entityType,eo.id,kind,apple,result.merged);
    }
    }
    for(const apple of appleItems){
      if(kind==="reminder"&&eventKitReminderExcluded(apple))continue;
      if(kind==="event"&&apple.isRecurring)continue;
      if(linkedApple.has(String(apple.calendarItemIdentifier)))continue;
      if(!eventKitImportsUnlinked(kind,syncModes[String(apple.calendarIdentifier)]??"off"))continue;
      if(invalidEvent(apple))continue;
      if(scope.all.some(link=>matchesLink(apple,link)))continue;
      if(!claimDiscovery(kind))continue;
      if(kind==="event"){
        if(!apple.externalIdentifier&&scope.all.some(link=>!eventKitSourceEnabled(link.calendar_identifier,syncModes))){conflicts.push({entityType,eoId:0,fields:["identity"]});continue;}
        if(apple.externalIdentifier){
          recoveryCapability??=getNativeHostInfo().then(info=>hostSupports(info,"eventkit.recover"));
          if(!await recoveryCapability){conflicts.push({entityType,eoId:0,fields:["identity"]});continue;}
          const identity=await nativeCall<{status:string;item?:Item}>("eventkit.recover",{kind:"calendar",calendarIdentifiers:calendarIDs,bindings:[],externalIdentifiers:[String(apple.externalIdentifier)]});
          if(identity.status!=="found"||identity.item?.calendarItemIdentifier!==apple.calendarItemIdentifier){conflicts.push({entityType,eoId:0,fields:["identity"]});continue;}
        }
      }
      const snapshot=kind==="reminder"?appleReminderSnapshot(apple):appleEventSnapshot(apple);
      if(entityType==="task"){await json("/api/eventkit/reminder-import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({installationId:status.installationId,apple,snapshot})});changed.add("tasks");changed.add("reminders");}else try{await importCalendarEvent(status,apple,snapshot);changed.add("calendar");}catch(error){if(error instanceof EventKitRequestError&&["eventkit_eo_missing","eventkit_identity_conflict"].includes(error.code??"")){conflicts.push({entityType,eoId:0,fields:[error.code==="eventkit_eo_missing"?"eo_missing":"identity"]});continue;}throw error;}
      linkedApple.add(String(apple.calendarItemIdentifier));if(kind==="event")calendarDiagnostics.newImports++;imported++;
    }
    if(destination)for(const eo of exportItems){if(linkedEO.has(eo.id)||!eventKitTaskNeedsAppleMirror(eo as Task))continue;if(!claimDiscovery(kind))continue;const snapshot=taskSnapshot(eo as Task),candidates=appleItems.filter(item=>item.calendarIdentifier===destination.identifier&&!claimedReminderIDs.has(String(item.calendarItemIdentifier))&&!links.some(link=>matchesLink(item,link))&&eventKitReminderMatches(item,[snapshot]));if(candidates.length>1){conflicts.push({entityType:"task",eoId:eo.id,fields:["identity"]});continue;}const existing=candidates[0];if(existing){await adoptReminderLink(status,"task",eo.id,snapshot,existing);claimedReminderIDs.add(String(existing.calendarItemIdentifier));continue;}await createReminderLink(status,"task",eo.id,snapshot,destination.identifier);exported++;}}
  async function reconcileDomainReminders(){const relevant=links.filter(link=>link.entity_type==="reminder"),linkedEO=new Set(relevant.map(link=>link.eo_id)),claimedApple=new Set(claimedReminderIDs);
    const excludedEO=new Set(reminders.filter(item=>eventKitReminderExcluded(item)).map(item=>item.id));
    for(const group of [relevant.filter(urgent),relevant.filter(link=>!urgent(link))]){
     const deadline=Date.now()+4000;let attempted=0;
     for(const link of group){if(paused.has(link))continue;if(attempted&&Date.now()>=deadline){paused.add(link);deferred.add(link);continue;}attempted++;resolved.add(link);let eo=reminders.find(item=>item.id===link.eo_id);if(!eo)continue;const domain=eventKitReminderDomain(eo),destination=domain?status.reminderLists.find(source=>source.identifier===routes[domain]&&source.allowsContentModifications):null;if(!destination){paused.add(link);outOfScope.add(link);continue;}let apple=appleReminders.find(item=>item.calendarItemIdentifier===link.calendar_item_identifier);
      if(eventKitReminderExcluded(eo,apple,link.last_synced_snapshot))continue;
      if(!apple){const lookup=await lookupApple(link);if(lookup.status==="out_of_scope"){paused.add(link);outOfScope.add(link);continue;}if(lookup.status==="unavailable"){pause(link);continue;}if(lookup.status==="found")apple=lookup.item;}
      if(eventKitReminderExcluded(eo,apple,link.last_synced_snapshot))continue;
      if(eo.status!=="completed"&&(!eo.isActive||!eo.nextDueAt)){await nativeCall("eventkit.delete",{kind:"reminder",calendarItemIdentifier:link.calendar_item_identifier});await json("/api/eventkit/links",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:link.id})});continue;}
      if(eventKitReminderCompletedSince(eo,link.last_synced_snapshot)){
        if(apple&&!apple.completed){
          const completed={...link.last_synced_snapshot,completed:true,completionDate:eo.lastCompletedAt};
          await nativeCall("eventkit.save",{kind:"reminder",item:appleReminderPayload(completed,String(apple.calendarIdentifier),String(apple.calendarItemIdentifier),apple,eo.timezone)});
          exported++;
        }
        await createReminderLink(status,"reminder",eo.id,reminderSnapshot(eo),destination.identifier,eo.timezone,true);exported++;continue;
      }
      let snapshot=eventKitCanonicalSnapshot(eo.status==="completed"?{...link.last_synced_snapshot,completed:true,completionDate:eo.lastCompletedAt}:reminderSnapshot(eo));if(!apple&&eo.status==="completed")continue;if(apple&&Boolean(apple.completed)&&!Boolean(link.last_synced_snapshot.completed)&&!Boolean(snapshot.completed)){eo=await json(`/api/reminders/${eo.id}/complete`,{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}) as Reminder;snapshot=eventKitCanonicalSnapshot(eo.status==="completed"?{...link.last_synced_snapshot,completed:true,completionDate:eo.lastCompletedAt}:reminderSnapshot(eo));imported++;if(eventKitHasNextOccurrence(eo)){await createReminderLink(status,"reminder",eo.id,snapshot,destination.identifier,eo.timezone,true);exported++;continue;}}
      if(!apple)await createReminderLink(status,"reminder",eo.id,snapshot,destination.identifier,eo.timezone);else if(link.calendar_item_identifier!==apple.calendarItemIdentifier||link.calendar_identifier!==destination.identifier||stable(snapshot)!==stable(link.last_synced_snapshot)||stable(appleReminderSnapshot(apple))!==stable(appleReminderSnapshot(snapshot))||reminderNeedsDueAlarm(snapshot,apple)||(link.recovery_token&&!apple.url)){const saved=await nativeCall<{item:Item}>("eventkit.save",{kind:"reminder",item:{...appleReminderPayload(snapshot,destination.identifier,String(apple.calendarItemIdentifier),apple,eo.timezone),recoveryToken:link.recovery_token}});await saveLink(status,"reminder",eo.id,"reminder",saved.item,snapshot);}else continue;exported++;
    }
    }
    for(const eo of reminders){if(excludedEO.has(eo.id)||linkedEO.has(eo.id)||!eo.isActive||!eo.nextDueAt)continue;const domain=eventKitReminderDomain(eo),destination=domain?status.reminderLists.find(source=>source.identifier===routes[domain]&&source.allowsContentModifications):null;if(!destination)continue;if(!claimDiscovery("reminder"))continue;const snapshot=reminderSnapshot(eo),legacy=eo.note===snapshot.notes?snapshot:{...snapshot,notes:eo.note},candidates=appleReminders.filter(item=>item.calendarIdentifier===destination.identifier&&!claimedApple.has(String(item.calendarItemIdentifier))&&!links.some(link=>matchesLink(item,link))&&eventKitReminderMatches(item,[snapshot,legacy]));if(candidates.length>1){conflicts.push({entityType:"reminder",eoId:eo.id,fields:["identity"]});continue;}const existing=candidates[0];if(existing){await adoptReminderLink(status,"reminder",eo.id,snapshot,existing,eo.timezone);claimedApple.add(String(existing.calendarItemIdentifier));continue;}await createReminderLink(status,"reminder",eo.id,snapshot,destination.identifier,eo.timezone);exported++;}}
  // Publish committed Calendar changes before processing Reminder mirrors.
  let failed=false,firstError:unknown;
  try{if(syncCalendar)await reconcile("event","calendar_event",appleEvents,events);}catch(error){if(error instanceof EventKitReadTimeout)throw error;failed=true;firstError=error;}
  finally{if(changed.has("calendar")){await notifyCommittedChanges(["calendar"]);changed.delete("calendar");}}
  const calendarCounts={imported,exported,merged};
  try{if(syncReminders){await reconcile("reminder","task",appleReminders,tasks);await reconcileDomainReminders();}}catch(error){if(!failed){failed=true;firstError=error;}}
  if(failed)throw firstError;
  const reminderDiagnostics={selectedLists:reminderIDs.length,readReminders:appleReminders.length,imported:imported-calendarCounts.imported,exported:exported-calendarCounts.exported,merged:merged-calendarCounts.merged,conflicts:conflicts.filter(conflict=>conflict.entityType!=="calendar_event").length,excludedReminders:appleReminders.filter(item=>eventKitReminderExcluded(item)).length};
  for(const link of processed){const key=linkKey(link);if(resolved.has(link)&&!paused.has(link)){checked.add(key);delete work.state.retries[key];}else if(deferred.has(link)){checked.delete(key);delete work.state.retries[key];}else if(!outOfScope.has(link)){checked.delete(key);const attempts=(work.state.retries[key]?.attempts??0)+1;work.state.retries[key]={attempts,after:Date.now()+Math.min(600_000,30_000*2**Math.min(attempts-1,5))};}}
  for(const link of outOfScope)excluded.add(linkKey(link));
  const liveKeys=new Set(links.map(linkKey));
  const remaining=available.filter(link=>!outOfScope.has(link)&&(!checked.has(linkKey(link))||paused.has(link)&&!processed.has(link)&&Boolean(work.state.retries[linkKey(link)])));
  const pendingRecovery={recent:remaining.filter(urgent).length,history:remaining.filter(link=>!urgent(link)).length,discoveries:discoveriesPending};
  work.state.pending=pendingRecovery.recent+pendingRecovery.history+pendingRecovery.discoveries;
  work.state.foregroundDone=pendingRecovery.recent===0;
  if(readingPage&&work.state.foregroundDone&&!pendingRecovery.history&&!pendingRecovery.discoveries&&syncCalendar){
    const next=window.to;
    work.state.cursor=`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,"0")}-${String(next.getDate()).padStart(2,"0")}`;
  }
  work.state.retries=Object.fromEntries(Object.entries(work.state.retries).filter(([key])=>liveKeys.has(key)));
  work.state.checked=[...checked].filter(key=>liveKeys.has(key));work.state.excluded=[...excluded].filter(key=>liveKeys.has(key));
  checkSession?.();work.save();
  return{imported,exported,merged,conflicts,skippedEvents,calendarDiagnostics,reminderDiagnostics,pendingRecovery,recoveryErrors,lastSync:new Date().toISOString()};}
