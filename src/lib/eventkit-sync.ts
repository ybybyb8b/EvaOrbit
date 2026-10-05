import type { CalendarEvent,Reminder,Task } from "./types.ts";
import { getNativeHostInfo, hostSupports, nativeCall } from "./native-bridge.ts";

export type EventKitSyncMode="off"|"import"|"two_way";
export type EventKitNotificationOwner="eo"|"apple";
export type EventKitReminderDomain="tasks"|"cats"|"cat_household"|"trackers"|"health"|"subscriptions";
export type EventKitReminderRoutes=Partial<Record<EventKitReminderDomain,string>>;
export type EventKitSource={identifier:string;title:string;sourceIdentifier:string;sourceTitle:string;allowsContentModifications:boolean};
export type EventKitStatus={available:boolean;installationId:string;calendarPermission:string;reminderPermission:string;calendars:EventKitSource[];reminderLists:EventKitSource[]};
export type EventKitModes=Record<string,EventKitSyncMode>;
type Item=Record<string,unknown>;
type Link={id:number;entity_type:"task"|"reminder"|"calendar_event";eo_id:number;eventkit_entity_type:"reminder"|"event";calendar_item_identifier:string;external_identifier:string|null;calendar_identifier:string;source_identifier:string;last_synced_snapshot:Item;logical_link_id?:string;recovery_token?:string;binding_state?:"current"|"recovery"|"pending";identity_conflict?:boolean;eo_record_missing?:boolean;bindings?:Item[];external_identifiers?:string[]};
export type EventKitSyncResult={imported:number;exported:number;merged:number;conflicts:Array<{entityType:string;eoId:number;fields:string[]}>;skippedEvents:Array<{title:string;calendarTitle:string;startAt:string;endAt:string}>;lastSync:string;calendarDiagnostics?:{selectedCalendars:number;readEvents:number;newImports:number;updatedEvents:number;recurringSkipped:number;from:string;to:string}};
export function eventKitSyncDiagnosticText(result:EventKitSyncResult){
  const calendar=result.calendarDiagnostics,missing=result.conflicts.filter(conflict=>conflict.fields.includes("eo_missing")).length,identity=result.conflicts.filter(conflict=>conflict.fields.includes("identity")).length;
  return [calendar?`Calendar：启用 ${calendar.selectedCalendars} 个日历，读取 ${calendar.readEvents} 条，新导入 ${calendar.newImports} 条，更新 ${calendar.updatedEvents} 条。读取范围 ${calendar.from} 至 ${calendar.to}。`:"",calendar?.selectedCalendars===0?"请将事件所在日历设为 Import only。":"",calendar?.recurringSkipped?`本轮读取中有 ${calendar.recurringSkipped} 条重复事件，当前规则不导入重复事件。`:"",missing?`暂停 ${missing} 条旧关联：EO 原记录不存在，关联和 Apple 对象均保留。`:"",identity?`有 ${identity} 条关联无法唯一确认，相应导入或镜像创建已暂停。`:""].filter(Boolean).join(" ");
}
let activeEventKitSync:Promise<EventKitSyncResult>|null=null;

export function runEventKitSyncSingleFlight(run:()=>Promise<EventKitSyncResult>){
  if(activeEventKitSync)return activeEventKitSync;
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
export function reminderSnapshot(reminder:Reminder):Item{const due=reminder.snoozedUntil??reminder.nextDueAt,parts=due?dayTime(due,reminder.timezone):null,completed=reminder.status==="completed";return eventKitCanonicalSnapshot({title:reminder.title,notes:reminder.sourceType==="tracker_missing"?"":reminder.note,dueDate:parts?.date??null,dueTime:parts&&reminder.dueHasExplicitTime?parts.time:null,completed,completionDate:completed?reminder.lastCompletedAt:null});}
export function appleReminderSnapshot(item:Item):Item{return eventKitCanonicalSnapshot({title:String(item.title??""),notes:String(item.notes??""),dueDate:item.dueDate??null,dueTime:item.dueTime??null,completed:Boolean(item.completed),completionDate:item.completionDate??null});}
export function eventKitReminderMatches(item:Item,snapshots:Item[]){const normalized=stable(appleReminderSnapshot(item));return snapshots.some(snapshot=>stable(snapshot)===normalized);}
export function eventKitHasNextOccurrence(reminder:Pick<Reminder,"isActive"|"nextDueAt"|"status">){return reminder.isActive&&Boolean(reminder.nextDueAt)&&reminder.status!=="completed";}
function eventSnapshot(event:CalendarEvent|Item):Item{return eventKitCanonicalSnapshot({title:String(event.title??""),notes:String(event.notes??""),startAt:String("startAt" in event?event.startAt:event.start_at),endAt:String("endAt" in event?event.endAt:event.end_at),isAllDay:Boolean("isAllDay" in event?event.isAllDay:event.is_all_day),timezone:(event.timezone as string|null)??null,location:String(event.location??""),status:String(event.status??"confirmed")});}
function appleEventSnapshot(item:Item):Item{return eventKitCanonicalSnapshot({title:String(item.title??""),notes:String(item.notes??""),startAt:String(item.startAt),endAt:String(item.endAt),isAllDay:Boolean(item.isAllDay),timezone:item.timezone??null,location:String(item.location??""),status:String(item.status??"confirmed")});}
export function eventKitEventRangeValid(snapshot:Item){const start=String(snapshot.startAt??""),end=String(snapshot.endAt??"");if(snapshot.isAllDay)return/^\d{4}-\d{2}-\d{2}$/.test(start)&&/^\d{4}-\d{2}-\d{2}$/.test(end)&&end>start;const startTime=Date.parse(start),endTime=Date.parse(end);return Number.isFinite(startTime)&&Number.isFinite(endTime)&&endTime>startTime;}
export function eventKitRecoveryURL(token:string){if(!/^[0-9a-f-]{36}$/i.test(token))throw new Error("Invalid EventKit recovery token");return`evaorbit://eventkit/${token.toLowerCase()}`;}
export function appleReminderPayload(snapshot:Item,calendarIdentifier:string,identifier?:string,existing?:Item,timezone?:string){const existingAlarms=Array.isArray(existing?.alarms)?existing.alarms:[];return{calendarItemIdentifier:identifier,calendarIdentifier,title:snapshot.title,notes:snapshot.notes,dueDate:snapshot.dueDate,dueTime:snapshot.dueTime,timezone:timezone??(typeof existing?.timezone==="string"?existing.timezone:Intl.DateTimeFormat().resolvedOptions().timeZone),priority:Number(existing?.priority??0),completed:snapshot.completed,completionDate:snapshot.completionDate,alarms:existingAlarms.length?existingAlarms:snapshot.dueTime?[{relativeOffset:0}]:[]};}
class EventKitRequestError extends Error{readonly code:string|undefined;constructor(message:string,code:string|undefined){super(message);this.code=code;}}
async function json(url:string,init?:RequestInit,allowMissing=false){const response=await fetch(url,{cache:"no-store",...init});if(allowMissing&&response.status===404)return null;if(!response.ok){const body=await response.json().catch(()=>({}));throw new EventKitRequestError(`${body.error??"Sync request failed"} (${init?.method??"GET"} ${url.split("?")[0]}, HTTP ${response.status})`,body.code);}return response.status===204?null:response.json();}
export async function eventKitCalendarRecords(from:Date,to:Date){const records:CalendarEvent[]=[];let afterId=0;for(;;){const page=await json(`/api/calendar-events?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}&limit=500&afterId=${afterId}`) as CalendarEvent[];if(!page.length)return records;const next=page[page.length-1].id;if(next<=afterId)throw new Error("Calendar pagination did not advance");records.push(...page);afterId=next;}}
async function importCalendarEvent(status:EventKitStatus,apple:Item,snapshot:Item){return json("/api/eventkit/calendar-import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({installationId:status.installationId,apple,snapshot})}) as Promise<{id:number}>;}
export function eventKitNotificationOwner(item:Item):EventKitNotificationOwner{return Array.isArray(item.alarms)&&item.alarms.length>0?"apple":"eo";}
export function eventKitSourceEnabled(calendarIdentifier:string,modes:EventKitModes){return Boolean(modes[calendarIdentifier]&&modes[calendarIdentifier]!=="off");}
export function eventKitCalendarReadModes(calendars:Pick<EventKitSource,"identifier">[],modes:EventKitModes){const next={...modes};for(const calendar of calendars)if(next[calendar.identifier]==="two_way")next[calendar.identifier]="import";return next;}
export function eventKitCalendarSyncRange(now=new Date()){const from=new Date(2026,9,1),to=new Date(now);to.setDate(to.getDate()+365);return{from,to};}
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
async function adoptReminderLink(status:EventKitStatus,entityType:"task"|"reminder",eoId:number,snapshot:Item,apple:Item,timezone?:string){const saved=reminderNeedsDueAlarm(snapshot,apple)||stable(appleReminderSnapshot(apple))!==stable(snapshot)?await nativeCall<{item:Item}>("eventkit.save",{kind:"reminder",item:appleReminderPayload(snapshot,String(apple.calendarIdentifier),String(apple.calendarItemIdentifier),apple,timezone)}).then(value=>value.item):apple;await saveLink(status,entityType,eoId,"reminder",saved,snapshot);return saved;}

export function synchronizeEventKit(status:EventKitStatus,modes:EventKitModes,routes:EventKitReminderRoutes={}){return runEventKitSyncSingleFlight(()=>performEventKitSync(status,modes,routes));}
async function performEventKitSync(status:EventKitStatus,modes:EventKitModes,routes:EventKitReminderRoutes={}):Promise<EventKitSyncResult>{
  const effectiveModes={...modes};for(const identifier of Object.values(routes))if(identifier)effectiveModes[identifier]="two_way";
  const calendarModes=eventKitCalendarReadModes(status.calendars,effectiveModes),links=await json(`/api/eventkit/links?protocol=2&installationId=${encodeURIComponent(status.installationId)}`) as Link[],claimedReminderIDs=new Set(links.filter(link=>link.eventkit_entity_type==="reminder").map(link=>link.calendar_item_identifier)),calendarIDs=status.calendars.filter(source=>eventKitSourceEnabled(source.identifier,calendarModes)).map(source=>source.identifier),linkedReminderIDs=Object.keys(routes).length?links.filter(link=>link.eventkit_entity_type==="reminder").map(link=>link.calendar_identifier):[],reminderIDs=[...new Set([...status.reminderLists.filter(source=>eventKitSourceEnabled(source.identifier,effectiveModes)).map(source=>source.identifier),...linkedReminderIDs])].filter(identifier=>status.reminderLists.some(source=>source.identifier===identifier)),{from,to}=eventKitCalendarSyncRange();
  const [appleEvents,appleReminders,tasks,reminders,events]=await Promise.all([calendarIDs.length?nativeCall<{items:Item[]}>("eventkit.fetch",{kind:"calendar",calendarIdentifiers:calendarIDs,from:from.toISOString(),to:to.toISOString()}).then(value=>value.items):[] as Item[],reminderIDs.length?nativeCall<{items:Item[]}>("eventkit.fetch",{kind:"reminder",calendarIdentifiers:reminderIDs,completedSince:new Date(Date.now()-30*86400000).toISOString()}).then(value=>value.items):[] as Item[],json("/api/tasks?status=all") as Promise<Task[]>,json("/api/reminders") as Promise<Reminder[]>,eventKitCalendarRecords(from,to)]);
  const calendarDiagnostics={selectedCalendars:calendarIDs.length,readEvents:appleEvents.length,newImports:0,updatedEvents:0,recurringSkipped:appleEvents.filter(item=>item.isRecurring).length,from:`${from.getFullYear()}-${String(from.getMonth()+1).padStart(2,"0")}-${String(from.getDate()).padStart(2,"0")}`,to:`${to.getFullYear()}-${String(to.getMonth()+1).padStart(2,"0")}-${String(to.getDate()).padStart(2,"0")}`};
  let lookupCapability:Promise<boolean>|undefined;
  async function lookupApple(link:Link):Promise<{status:"found";item:Item}|{status:"missing"|"unavailable"}>{
    const sources=link.eventkit_entity_type==="event"?status.calendars:status.reminderLists,permission=link.eventkit_entity_type==="event"?status.calendarPermission:status.reminderPermission,syncModes=link.eventkit_entity_type==="event"?calendarModes:effectiveModes;
    if(!["authorized","full_access"].includes(permission)||!eventKitSourceEnabled(link.calendar_identifier,syncModes)||!sources.some(source=>source.identifier===link.calendar_identifier&&source.sourceIdentifier===link.source_identifier))return{status:"unavailable"};
    if(link.logical_link_id){
      recoveryCapability??=getNativeHostInfo().then(info=>hostSupports(info,"eventkit.recover"));
      if(!await recoveryCapability)return{status:"unavailable"};
      const result=await nativeCall<{status:string;item?:Item}>("eventkit.recover",{kind:link.eventkit_entity_type==="event"?"calendar":"reminder",calendarIdentifiers:sources.filter(source=>eventKitSourceEnabled(source.identifier,syncModes)).map(source=>source.identifier),bindings:link.bindings??[link],externalIdentifiers:link.external_identifiers??[],recoveryToken:link.recovery_token});
      return result.status==="found"&&result.item?{status:"found",item:result.item}:{status:result.status==="missing"?"missing":"unavailable"};
    }
    lookupCapability??=getNativeHostInfo().then(info=>hostSupports(info,"eventkit.getItem"));
    if(!await lookupCapability)return{status:"unavailable"};
    const result=await nativeCall<{status:string;item?:Item}>("eventkit.getItem",{kind:link.eventkit_entity_type==="event"?"calendar":"reminder",calendarItemIdentifier:link.calendar_item_identifier,externalIdentifier:link.external_identifier,calendarIdentifier:link.calendar_identifier,sourceIdentifier:link.source_identifier});
    if(result.status==="found"&&result.item)return{status:"found",item:result.item};
    return{status:result.status==="missing"?"missing":"unavailable"};
  }
  let imported=0,exported=0,merged=0;const conflicts:Array<{entityType:string;eoId:number;fields:string[]}>=[],skippedEvents:EventKitSyncResult["skippedEvents"]=[],paused=new Set<Link>(),blockedKinds=new Set<string>();
  function pause(link:Link){paused.add(link);blockedKinds.add(link.eventkit_entity_type);conflicts.push({entityType:link.entity_type,eoId:link.eo_id,fields:["identity"]});}
  function pauseMissingEO(link:Link){
    paused.add(link);conflicts.push({entityType:link.entity_type,eoId:link.eo_id,fields:["eo_missing"]});
    // Without a durable Apple identity, a changed local ID may still be this old object.
    if(link.identity_conflict||(!link.external_identifier&&!link.external_identifiers?.length&&(link.eventkit_entity_type==="event"||!link.recovery_token)))blockedKinds.add(link.eventkit_entity_type);
  }
  function matchesLink(apple:Item,link:Link){return apple.calendarItemIdentifier===link.calendar_item_identifier||Boolean(apple.externalIdentifier&&(apple.externalIdentifier===link.external_identifier||link.external_identifiers?.includes(String(apple.externalIdentifier))))||Boolean(link.recovery_token&&apple.url===eventKitRecoveryURL(link.recovery_token))||Boolean(link.bindings?.some(binding=>binding.calendar_item_identifier===apple.calendarItemIdentifier||(apple.externalIdentifier&&binding.external_identifier===apple.externalIdentifier)));}
  let recoveryCapability:Promise<boolean>|undefined;
  // Recovery is a barrier before any new import/export. A missed old link is never an unlinked object.
  for(const link of links){
    if(link.eo_record_missing){pauseMissingEO(link);continue;}
    // Older servers omit the existence flag; recovery must still verify EO before binding.
    if(link.eo_record_missing===undefined&&link.binding_state&&link.binding_state!=="current"){
      const eo=link.entity_type==="calendar_event"?await json(`/api/calendar-events/${link.eo_id}`,undefined,true):link.entity_type==="task"?tasks.find(item=>item.id===link.eo_id):reminders.find(item=>item.id===link.eo_id);
      if(!eo){pauseMissingEO(link);continue;}
    }
    if(link.eventkit_entity_type==="reminder"&&eventKitReminderExcluded(link.last_synced_snapshot,link.entity_type==="task"?tasks.find(item=>item.id===link.eo_id):reminders.find(item=>item.id===link.eo_id))){paused.add(link);blockedKinds.add("reminder");continue;}
    if(link.identity_conflict){pause(link);continue;}
    if(!link.binding_state)continue;
    if(link.binding_state==="current"){
      const sources=link.eventkit_entity_type==="event"?status.calendars:status.reminderLists;
      if(!sources.some(source=>source.identifier===link.calendar_identifier&&source.sourceIdentifier===link.source_identifier))pause(link);
      continue;
    }
    const ids=link.eventkit_entity_type==="event"?calendarIDs:reminderIDs,permission=link.eventkit_entity_type==="event"?status.calendarPermission:status.reminderPermission;
    if(!ids.length||!["authorized","full_access"].includes(permission)){pause(link);continue;}
    recoveryCapability??=getNativeHostInfo().then(info=>hostSupports(info,"eventkit.recover"));
    if(!await recoveryCapability){pause(link);continue;}
    const recovered=await nativeCall<{status:string;item?:Item}>("eventkit.recover",{kind:link.eventkit_entity_type==="event"?"calendar":"reminder",calendarIdentifiers:ids,bindings:link.bindings??[],externalIdentifiers:link.external_identifiers??[],recoveryToken:link.recovery_token});
    if(recovered.status!=="found"||!recovered.item){
      if(link.binding_state==="recovery"&&recovered.status==="missing")continue;
      // Pending reservations have no old Apple identity; a complete marker scan can safely retry creation.
      if(link.binding_state==="pending"&&recovered.status==="missing"&&link.eventkit_entity_type==="reminder"){
        const eo=link.entity_type==="task"?tasks.find(item=>item.id===link.eo_id):reminders.find(item=>item.id===link.eo_id),domain=link.entity_type==="task"?"tasks":eo?eventKitReminderDomain(eo as Reminder):null,destination=domain?routes[domain]:null;
        if(eo&&(link.entity_type==="task"?!eventKitTaskNeedsAppleMirror(eo as Task):!eventKitHasNextOccurrence(eo as Reminder))){paused.add(link);continue;}
        if(eo&&destination&&(link.entity_type==="task"?eventKitTaskNeedsAppleMirror(eo as Task):eventKitHasNextOccurrence(eo as Reminder))){const snapshot=link.entity_type==="task"?taskSnapshot(eo as Task):reminderSnapshot(eo as Reminder),apple=await createReminderLink(status,link.entity_type as "task"|"reminder",link.eo_id,snapshot,destination);appleReminders.push(apple);link.calendar_item_identifier=String(apple.calendarItemIdentifier);link.calendar_identifier=String(apple.calendarIdentifier);link.source_identifier=String(apple.sourceIdentifier);link.external_identifier=String(apple.externalIdentifier??"")||null;link.last_synced_snapshot=snapshot;link.binding_state="current";exported++;continue;}
      }
      pause(link);continue;
    }
    const apple=recovered.item;
    if(link.eventkit_entity_type==="reminder"&&eventKitReminderExcluded(apple)){paused.add(link);blockedKinds.add("reminder");continue;}
    let binding;try{binding=await saveLink(status,link.entity_type,link.eo_id,link.eventkit_entity_type,apple,link.last_synced_snapshot);}catch(error){if(error instanceof EventKitRequestError&&error.code==="eventkit_eo_missing"){pauseMissingEO(link);continue;}throw error;}
    Object.assign(link,{id:Number(binding?.id??link.id),calendar_item_identifier:String(apple.calendarItemIdentifier),calendar_identifier:String(apple.calendarIdentifier),source_identifier:String(apple.sourceIdentifier),external_identifier:apple.externalIdentifier??null,binding_state:"current"});
    const items=link.eventkit_entity_type==="event"?appleEvents:appleReminders;if(!items.some(item=>item.calendarItemIdentifier===apple.calendarItemIdentifier))items.push(apple);
    if(link.eventkit_entity_type==="reminder")claimedReminderIDs.add(String(apple.calendarItemIdentifier));
  }
  async function reconcile(kind:"reminder"|"event",entityType:"task"|"calendar_event",appleItems:Item[],eoItems:Array<Task|CalendarEvent>){
    const exportItems=kind==="reminder"?eoItems.filter(item=>!eventKitReminderExcluded(item)):eoItems;
    const syncModes=kind==="event"?calendarModes:effectiveModes,scope=eventKitLinkScope(links,entityType,syncModes),routed=kind==="reminder"?routes.tasks:null,destination=kind==="reminder"?status.reminderLists.find(source=>source.allowsContentModifications&&(routed?source.identifier===routed:syncModes[source.identifier]==="two_way")):undefined,active=entityType==="task"&&routed?scope.all:scope.active,linkedEO=new Set(scope.all.map(link=>link.eo_id)),linkedApple=new Set(scope.all.map(link=>link.calendar_item_identifier));
    function invalidEvent(apple:Item){if(kind!=="event")return false;const snapshot=appleEventSnapshot(apple);if(eventKitEventRangeValid(snapshot))return false;skippedEvents.push({title:String(snapshot.title||"Untitled event"),calendarTitle:status.calendars.find(source=>source.identifier===apple.calendarIdentifier)?.title??"Unknown calendar",startAt:String(snapshot.startAt),endAt:String(snapshot.endAt)});return true;}
    for(const link of active){
      if(paused.has(link))continue;
      if(kind==="reminder"&&eventKitReminderExcluded(eoItems.find(item=>item.id===link.eo_id),link.last_synced_snapshot))continue;
      const mode=entityType==="task"&&routed?"two_way":syncModes[link.calendar_identifier],eo=await json(entityType==="calendar_event"?`/api/calendar-events/${link.eo_id}`:`/api/tasks/${link.eo_id}`,undefined,true) as CalendarEvent|Task|null;
      if(!eo){pauseMissingEO(link);continue;}
      const candidates=appleItems.filter(item=>item.calendarItemIdentifier===link.calendar_item_identifier||(item.externalIdentifier&&item.externalIdentifier===link.external_identifier));
      if(candidates.length>1){pause(link);continue;}
      let apple=candidates[0];
      if(kind==="reminder"&&eventKitReminderExcluded(eo,apple,link.last_synced_snapshot))continue;
      if(!apple){const lookup=await lookupApple(link);if(lookup.status==="unavailable"){pause(link);continue;}if(lookup.status==="found")apple=lookup.item;}
      if(apple){linkedApple.add(String(apple.calendarItemIdentifier));if(kind==="reminder")claimedReminderIDs.add(String(apple.calendarItemIdentifier));}
      if(kind==="reminder"&&eventKitReminderExcluded(eo,apple,link.last_synced_snapshot))continue;
      if(kind==="event"&&apple?.isRecurring)continue;
      if(apple&&invalidEvent(apple))continue;
      if(kind==="event"&&apple&&!eventKitSourceEnabled(String(apple.calendarIdentifier),syncModes))continue;
      if(eo&&!apple){
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
      if(result.conflicts.length){conflicts.push({entityType,eoId:eo.id,fields:result.conflicts});continue;}
      if(mode!=="two_way"&&result.eoChanged){conflicts.push({entityType,eoId:eo.id,fields:Object.keys(eoSnap).filter(key=>JSON.stringify(eoSnap[key]??null)!==JSON.stringify(base[key]??null))});continue;}
      if(!result.eoChanged&&!result.appleChanged){if(kind==="reminder"&&mode==="two_way"&&(reminderNeedsDueAlarm(eoSnap,apple)||relocate)){const saved=await nativeCall<{item:Item}>("eventkit.save",{kind:"reminder",item:appleReminderPayload(eoSnap,destination?.identifier??String(apple.calendarIdentifier),String(apple.calendarItemIdentifier),apple)});await saveLink(status,entityType,eo.id,kind,saved.item,eoSnap);exported++;continue;}if(baselineChanged||apple.calendarItemIdentifier!==link.calendar_item_identifier||(entityType==="task"&&!taskNotificationOwnerMatches(eo as Task,apple)))await saveLink(status,entityType,eo.id,kind,apple,base);continue;}
      if(result.appleChanged){if(entityType==="task")await json(`/api/tasks/${eo.id}/eventkit`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({task:{title:result.merged.title,notes:result.merged.notes,dueDate:result.merged.dueDate,dueTime:result.merged.dueTime,completed:result.merged.completed,completionDate:result.merged.completionDate}})});else await json(`/api/calendar-events/${eo.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(result.merged)});if(kind==="event")calendarDiagnostics.updatedEvents++;imported++;}
      if(kind==="reminder"&&(result.eoChanged||relocate)&&mode==="two_way"){const saved=await nativeCall<{item:Item}>("eventkit.save",{kind:"reminder",item:appleReminderPayload(result.merged,destination?.identifier??String(apple.calendarIdentifier),String(apple.calendarItemIdentifier),apple)});apple=saved.item;exported++;}
      if(result.appleChanged&&result.eoChanged)merged++;
      await saveLink(status,entityType,eo.id,kind,apple,result.merged);
    }
    for(const apple of appleItems){
      if(blockedKinds.has(kind))continue;
      if(kind==="reminder"&&eventKitReminderExcluded(apple))continue;
      if(kind==="event"&&apple.isRecurring)continue;
      if(linkedApple.has(String(apple.calendarItemIdentifier)))continue;
      if(!eventKitImportsUnlinked(kind,syncModes[String(apple.calendarIdentifier)]??"off"))continue;
      if(invalidEvent(apple))continue;
      if(scope.all.some(link=>matchesLink(apple,link)))continue;
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
      if(entityType==="task"){const base=await json("/api/tasks",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...snapshot,reminderMode:"none",tags:[]})}),created=await json(`/api/tasks/${base.id}/eventkit`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({task:{title:snapshot.title,notes:snapshot.notes,dueDate:snapshot.dueDate,dueTime:snapshot.dueTime,completed:snapshot.completed,completionDate:snapshot.completionDate}})});await saveLink(status,entityType,created.id,kind,apple,snapshot);}else try{await importCalendarEvent(status,apple,snapshot);}catch(error){if(error instanceof EventKitRequestError&&["eventkit_eo_missing","eventkit_identity_conflict"].includes(error.code??"")){conflicts.push({entityType,eoId:0,fields:[error.code==="eventkit_eo_missing"?"eo_missing":"identity"]});continue;}throw error;}
      linkedApple.add(String(apple.calendarItemIdentifier));if(kind==="event")calendarDiagnostics.newImports++;imported++;
    }
    if(destination&&!blockedKinds.has(kind))for(const eo of exportItems){if(linkedEO.has(eo.id)||!eventKitTaskNeedsAppleMirror(eo as Task))continue;const snapshot=taskSnapshot(eo as Task),candidates=appleItems.filter(item=>item.calendarIdentifier===destination.identifier&&!claimedReminderIDs.has(String(item.calendarItemIdentifier))&&!links.some(link=>matchesLink(item,link))&&eventKitReminderMatches(item,[snapshot]));if(candidates.length>1){conflicts.push({entityType:"task",eoId:eo.id,fields:["identity"]});continue;}const existing=candidates[0];if(existing){await adoptReminderLink(status,"task",eo.id,snapshot,existing);claimedReminderIDs.add(String(existing.calendarItemIdentifier));continue;}await createReminderLink(status,"task",eo.id,snapshot,destination.identifier);exported++;}}
  async function reconcileDomainReminders(){const relevant=links.filter(link=>link.entity_type==="reminder"),linkedEO=new Set(relevant.map(link=>link.eo_id)),claimedApple=new Set(claimedReminderIDs);
    const excludedEO=new Set(reminders.filter(item=>eventKitReminderExcluded(item)).map(item=>item.id));
    for(const link of relevant){if(paused.has(link))continue;let eo=reminders.find(item=>item.id===link.eo_id);if(!eo)continue;const domain=eventKitReminderDomain(eo),destination=domain?status.reminderLists.find(source=>source.identifier===routes[domain]&&source.allowsContentModifications):null;if(!destination)continue;let apple=appleReminders.find(item=>item.calendarItemIdentifier===link.calendar_item_identifier);
      if(eventKitReminderExcluded(eo,apple,link.last_synced_snapshot))continue;
      if(!apple){const lookup=await lookupApple(link);if(lookup.status==="unavailable"){pause(link);continue;}if(lookup.status==="found")apple=lookup.item;}
      if(eventKitReminderExcluded(eo,apple,link.last_synced_snapshot))continue;
      if(eo.status!=="completed"&&(!eo.isActive||!eo.nextDueAt)){await nativeCall("eventkit.delete",{kind:"reminder",calendarItemIdentifier:link.calendar_item_identifier});await json("/api/eventkit/links",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:link.id})});continue;}
      let snapshot=eventKitCanonicalSnapshot(eo.status==="completed"?{...link.last_synced_snapshot,completed:true,completionDate:eo.lastCompletedAt}:reminderSnapshot(eo));if(!apple&&eo.status==="completed")continue;if(apple&&Boolean(apple.completed)&&!Boolean(link.last_synced_snapshot.completed)&&!Boolean(snapshot.completed)){eo=await json(`/api/reminders/${eo.id}/complete`,{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}) as Reminder;snapshot=eventKitCanonicalSnapshot(eo.status==="completed"?{...link.last_synced_snapshot,completed:true,completionDate:eo.lastCompletedAt}:reminderSnapshot(eo));imported++;if(eventKitHasNextOccurrence(eo)){await createReminderLink(status,"reminder",eo.id,snapshot,destination.identifier,eo.timezone,true);exported++;continue;}}
      if(!apple)await createReminderLink(status,"reminder",eo.id,snapshot,destination.identifier,eo.timezone);else if(link.calendar_item_identifier!==apple.calendarItemIdentifier||link.calendar_identifier!==destination.identifier||stable(snapshot)!==stable(link.last_synced_snapshot)||stable(appleReminderSnapshot(apple))!==stable(snapshot)||reminderNeedsDueAlarm(snapshot,apple)||(link.recovery_token&&!apple.url)){const saved=await nativeCall<{item:Item}>("eventkit.save",{kind:"reminder",item:{...appleReminderPayload(snapshot,destination.identifier,String(apple.calendarItemIdentifier),apple,eo.timezone),recoveryToken:link.recovery_token}});await saveLink(status,"reminder",eo.id,"reminder",saved.item,snapshot);}else continue;exported++;
    }
    for(const eo of reminders){if(blockedKinds.has("reminder"))continue;if(excludedEO.has(eo.id)||linkedEO.has(eo.id)||!eo.isActive||!eo.nextDueAt)continue;const domain=eventKitReminderDomain(eo),destination=domain?status.reminderLists.find(source=>source.identifier===routes[domain]&&source.allowsContentModifications):null;if(!destination)continue;const snapshot=reminderSnapshot(eo),legacy=eo.note===snapshot.notes?snapshot:{...snapshot,notes:eo.note},candidates=appleReminders.filter(item=>item.calendarIdentifier===destination.identifier&&!claimedApple.has(String(item.calendarItemIdentifier))&&!links.some(link=>matchesLink(item,link))&&eventKitReminderMatches(item,[snapshot,legacy]));if(candidates.length>1){conflicts.push({entityType:"reminder",eoId:eo.id,fields:["identity"]});continue;}const existing=candidates[0];if(existing){await adoptReminderLink(status,"reminder",eo.id,snapshot,existing,eo.timezone);claimedApple.add(String(existing.calendarItemIdentifier));continue;}await createReminderLink(status,"reminder",eo.id,snapshot,destination.identifier,eo.timezone);exported++;}}
  await reconcile("reminder","task",appleReminders,tasks);await reconcileDomainReminders();await reconcile("event","calendar_event",appleEvents,events);return{imported,exported,merged,conflicts,skippedEvents,calendarDiagnostics,lastSync:new Date().toISOString()};}
