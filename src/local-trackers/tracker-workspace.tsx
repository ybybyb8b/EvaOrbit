import {createTrackerWithProperties} from "@/app/trackers/create-tracker";
import {TrackerOnlineSettings} from "./tracker-online-settings";
import {useLocalInitialPath} from "./routes";
import {useBusinessRequest} from "@/components/business-request-context";
import {responseError} from "@/lib/response-error";
import {PageLogAction} from "@/components/bottom-log-core";
import {canEditTrackerRecord} from "@/lib/tracker-replica";
import {LocalBackAction} from "./navigation-header";
import { useEffect, useRef, useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import { ErrorNotice } from "@/components/error-notice";
import {TrackerSyncButton} from "./tracker-sync-settings";
import { useLocale } from "@/components/locale-controller";
import { showActionToast } from "@/components/action-toast";
import { PageHeading } from "@/components/page-heading";
import { FormSheet } from "@/components/form-sheet";
import { SuggestedInput } from "@/components/suggested-input";
import { Icon } from "@/components/icons";
import { LocalTrackerPicture } from "./tracker-picture";
import { TrackerSettingsView } from "@/app/trackers/tracker-settings-view";
import { TrackerCardContent } from "@/components/tracker-card-content";
import { TrackerEntryEditor } from "@/app/trackers/tracker-entry-editor";
import { TrackerCreateSheet } from "@/app/trackers/tracker-create-sheet";
import { TrackerCaptureToggle } from "@/app/trackers/tracker-capture-toggle";
import { TrackerTimelineRecords } from "@/app/trackers/tracker-timeline-records";
import { TrackerActivityInsights } from "@/app/trackers/tracker-activity-insights";
import { newTrackerLocalId, type LocalTrackerRecord } from "@/lib/tracker-local-store";
import { matchesTrackerSearch, entryMatchesPeriod, entryMatchesField, type TimelinePeriod } from "@/lib/tracker-timeline";
import { TrackerTimelineToolbar } from "@/app/trackers/tracker-timeline-toolbar";
import { trackerDistributionEntries, trackerInsightEntries, type TrackerInsightPeriod } from "@/lib/tracker-insights";
import { parseNewTracker, parseNewTrackerField } from "@/lib/validation";
import type { Tracker } from "@/lib/types";
import { isPreviewAccount, type LocalAccount, type TrackerPlatform } from "./platform";
import {asField,belongs} from "./tracker-records";
import {trackerSession,saveLocalTrackerEntry,synchronizeTrackerSession} from "./tracker-session";

export function TrackerWorkspace({ account, platform }: { account: LocalAccount; platform: TrackerPlatform }) {
  const initialPath=useLocalInitialPath("/trackers");
  const requestedTracker=useRef(Number(initialPath.split("/")[2])||null);
  const {english}=useLocale();
  const request=useBusinessRequest();
  const [deleteTrackerOpen,setDeleteTrackerOpen]=useState(false),[showArchived,setShowArchived]=useState(false);
  const readOnly = platform.readOnly(account);
  const store = useMemo(() => trackerSession(account, platform), [account, platform]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [ready, setReady] = useState(false), [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null), [create, setCreate] = useState(false), [capture, setCapture] = useState(false);
  useEffect(()=>{if(!requestedTracker.current)return;const row=state.records.find(row=>row.resourceType==="tracker"&&row.serverId===requestedTracker.current);if(row){setSelectedId(row.id);requestedTracker.current=null;}},[state.records]);
  const [editing, setEditing] = useState<LocalTrackerRecord | undefined>(), [deleting, setDeleting] = useState<LocalTrackerRecord | null>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"timeline" | "insights" | "settings">("timeline");
  const [periodFilter, setPeriodFilter] = useState<TimelinePeriod>("all"), [fieldFilter, setFieldFilter] = useState(""), [fieldValueFilter, setFieldValueFilter] = useState("");
  const [insightPeriod, setInsightPeriod] = useState<TrackerInsightPeriod>("month");
  const [chartFilter, setChartFilter] = useState<{kind:"monthly"|"weekdays"|"dayParts";key:string;label:string}|null>(null);
  const [showBasics, setShowBasics] = useState(false), [working, setWorking] = useState(false);
  async function sync() { try { await synchronizeTrackerSession(account,platform); } catch { /* Background status belongs to the sync panel. */ } }
  useEffect(() => {
    let alive = true;
    store.initialize().then(() => { if (alive) { setReady(true); void sync(); } }).catch(reason => { if (alive) setError(String(reason)); });
    const refresh = () => { if (alive && document.visibilityState !== "hidden") void sync(); };
    window.addEventListener("online", refresh); window.addEventListener("evaorbit:native-active", refresh); document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 60000);
    return () => { alive = false; clearInterval(timer); window.removeEventListener("online", refresh); window.removeEventListener("evaorbit:native-active", refresh); document.removeEventListener("visibilitychange", refresh); };
    // The store and account are the lifecycle; edits do not restart the scheduler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);
  const selected = state.records.find(row => row.id === selectedId && row.resourceType === "tracker");
  const trackers = state.records.filter(row => row.resourceType === "tracker" && Boolean(row.payload.archivedAt)===showArchived);
  const hidden = new Set(state.outbox.filter(item => item.operation === "delete").map(item => item.localId));
  const entries = state.records.filter(row => row.resourceType === "tracker_entry" && selected && belongs(row, selected) && !hidden.has(row.id)).sort((a, b) => String(b.payload.occurredAt).localeCompare(String(a.payload.occurredAt)));
  const fields = state.records.filter(row => row.resourceType === "tracker_field" && selected && belongs(row, selected)).map(asField).sort((a, b) => a.sortOrder - b.sortOrder);
  const timelineEntries = entries.map(row => ({ id: row.id, occurredAt: String(row.payload.occurredAt), note: String(row.payload.note ?? ""), values: row.payload.values as Record<string, unknown> ?? {}, row }));
  const chartRows = chartFilter ? new Set(trackerDistributionEntries(trackerInsightEntries(timelineEntries, insightPeriod), chartFilter.kind, chartFilter.key).map(entry => entry.id)) : null;
  const filtersActive = Boolean(query.trim() || chartFilter || periodFilter !== "all" || fieldFilter);
  const filtered = timelineEntries.filter(entry => matchesTrackerSearch(entry, query) && (!chartRows || chartRows.has(entry.id)) && entryMatchesPeriod(entry, periodFilter) && entryMatchesField(entry, fields.find(field=>field.key===fieldFilter), fieldValueFilter));
  async function perform(action: () => Promise<unknown>) { if (working) return; setWorking(true); try { if(readOnly)throw new Error("只读验收模式禁止修改记录"); await action(); setError(""); void sync(); } catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败，请重试"); } finally { setWorking(false); } }
  function status(row: LocalTrackerRecord) { if(readOnly)return english?"Downloaded snapshot":"只读快照"; return row.status ? (english?"Needs attention":"需要处理") : state.outbox.some(item => item.localId === row.id) ? (english?"Pending sync":"待同步") : (english?"Saved":"已保存"); }
  function openTracker(row: LocalTrackerRecord, detailed=false) { setSelectedId(row.id); setQuery(""); setPeriodFilter("all"); setFieldFilter(""); setFieldValueFilter(""); setChartFilter(null); setTab("timeline"); if (detailed) { setEditing(undefined); setCapture(true); } }
  async function recordNow(row: LocalTrackerRecord) {
    if (readOnly || !canEditTrackerRecord(row) || row.payload.archivedAt || !ready) return;
    if (!row.payload.quickCaptureEnabled) { openTracker(row, true); return; }
    await perform(async () => {
      await saveLocalTrackerEntry(store,row,{});
      showActionToast("已保存到本机");
    });
  }
  const action = <PageLogAction label={selected?(english?"Record Tracker":"新增记录"):(english?"New Tracker":"新增观测")} className="button primary" disabled={!ready || working || Boolean(selected&&!canEditTrackerRecord(selected)) || Boolean(selected?.status) || Boolean(selected?.payload.archivedAt)} onClick={() => selected ? void recordNow(selected) : setCreate(true)}><Icon name="plus" />{selected ? selected.payload.quickCaptureEnabled ? "立即记录" : "新增记录" : "新增观测"}</PageLogAction>;
  return <main className={selected ? "page tracker-detail-page local-trackers" : "page tracker-page local-trackers"}>
    <LocalBackAction onBack={selectedId?()=>{setSelectedId(null);setQuery("");setChartFilter(null);}:undefined}/>
    <PageHeading eyebrow={selected ? "" : "生活"} title={selected ? <span className="tracker-title"><LocalTrackerPicture row={selected} state={state} size={44} /><span className="user-content">{String(selected.payload.name)}</span></span> : "Trackers"} description={selected ? String(selected.payload.groupName ?? "") : undefined} action={<span className="page-actions">{!selected&&<button type="button" className="text-button" onClick={()=>setShowArchived(value=>!value)}>{english?showArchived?"Active":"Archived":showArchived?"当前":"已归档"}</button>}<TrackerSyncButton account={account} platform={platform} onEditConflict={row=>{const parent=trackers.find(tracker=>belongs(row,tracker));if(!parent){setError("所属 Tracker 已删除，可先导出本地内容");return;}setSelectedId(parent.id);setEditing(row);setCapture(true);}}/>{readOnly?null:selected?.payload.archivedAt?<span className="tracker-archived-label">已归档</span>:action}</span>} />
    {error && <ErrorNotice>{error}</ErrorNotice>}
    {!ready ? <p role="status">正在读取本机记录…</p> : readOnly && state.revision === 0 && !state.readOnly && !state.records.length ? <p role="status">尚未缓存真实 Tracker 数据，请联网刷新只读数据。</p> : selected ? <>
      <nav className="tracker-tabs" role="tablist" aria-label="Tracker 视图">{(["timeline","insights","settings"] as const).map((value,index,values) => <button type="button" role="tab" id={"tracker-tab-"+value} aria-controls={"tracker-panel-"+value} aria-selected={tab===value} tabIndex={tab===value?0:-1} className={tab===value?"active":""} onClick={()=>setTab(value)} onKeyDown={event=>{const next=event.key==="ArrowRight"?values[(index+1)%values.length]:event.key==="ArrowLeft"?values[(index+values.length-1)%values.length]:event.key==="Home"?values[0]:event.key==="End"?values.at(-1):undefined;if(next){event.preventDefault();setTab(next);document.getElementById("tracker-tab-"+next)?.focus();}}} key={value}>{(english?{timeline:"Timeline",insights:"Insights",settings:"Settings"}:{timeline:"时间线",insights:"洞察",settings:"设置"})[value]}</button>)}</nav>
      <div role="tabpanel" id={"tracker-panel-"+tab} aria-labelledby={"tracker-tab-"+tab} tabIndex={0}>
        {selected.payload.archivedAt ? <p className="tracker-archive-note">历史数据已保留。请在网页版恢复 Tracker 后继续记录。</p> : null}
        {tab==="timeline" && <section className="tracker-detail-section tracker-timeline-section"><div className="section-heading tracker-timeline-heading"><div><h2>{english?"All records":"全部记录"}</h2><p>{english?(filtersActive?`Showing ${filtered.length} / ${entries.length} records`:`${entries.length} records`):(filtersActive ? "显示 "+filtered.length+" / "+entries.length+" 条记录" : entries.length+" 条记录")}</p></div></div>
          {chartFilter && <p className="tracker-chart-caption">{chartFilter.label} · 来自图表的筛选</p>}
          <TrackerTimelineToolbar query={query} setQuery={setQuery} fields={fields} periodFilter={periodFilter} setPeriodFilter={setPeriodFilter} fieldFilter={fieldFilter} setFieldFilter={setFieldFilter} fieldValueFilter={fieldValueFilter} setFieldValueFilter={setFieldValueFilter} filtersActive={filtersActive} onClear={()=>{setQuery("");setPeriodFilter("all");setFieldFilter("");setFieldValueFilter("");setChartFilter(null);}} />
          {filtered.length ? <TrackerTimelineRecords readOnly={readOnly} entries={filtered} fields={fields} working={working} disabled={entry=>!canEditTrackerRecord(entry.row)||Boolean(selected&&!canEditTrackerRecord(selected))} status={entry=>status(entry.row)} onEdit={entry=>{setEditing(entry.row);setCapture(true);}} onDelete={entry=>setDeleting(entry.row)} /> : <div className="empty-state compact-empty"><h2>{filtersActive ? "没有匹配的记录" : "暂无记录"}</h2><p>{filtersActive ? "尝试扩大时间范围或清除部分筛选条件。" : "发生时立即记录即可。"}</p></div>}
        </section>}
        {tab==="insights" && <TrackerActivityInsights entries={timelineEntries} fields={fields} lastOccurredAt={timelineEntries[0]?.occurredAt ?? null} archived={readOnly || !canEditTrackerRecord(selected) || Boolean(selected.payload.archivedAt)} working={working} insightPeriod={insightPeriod} onPeriodChange={setInsightPeriod} onCapture={()=>void recordNow(selected)} onSelectChart={(kind,key,label)=>{setQuery("");setPeriodFilter("all");setFieldFilter("");setFieldValueFilter("");setChartFilter({kind,key,label});setTab("timeline");}} />}
        {tab==="settings" && (selected.serverId&&!readOnly?<TrackerOnlineSettings account={account} platform={platform} trackerId={selected.serverId} onExit={()=>{setSelectedId(null);setTab("timeline");}}/>:<TrackerSettingsView detail={{tracker: selected.payload as unknown as Tracker, fields, goals: state.readOnly?.settings[String(selected.serverId)]?.goals ?? [], reminders: state.readOnly?.settings[String(selected.serverId)]?.reminders ?? []}} total={entries.length} picture={<LocalTrackerPicture row={selected} state={state} size={64}/>} readOnly={readOnly||!canEditTrackerRecord(selected)} busy={working} actions={{editBasics:()=>setShowBasics(true),deleteTracker:()=>setDeleteTrackerOpen(true)}} />)}
      </div>
    </> : trackers.length ? [...new Set(trackers.map(row => String(row.payload.groupName)))].map(group => <section className="tracker-group" key={group}><div className="tracker-group-heading"><h2>{group}</h2><span>{trackers.filter(row=>row.payload.groupName===group).length}</span></div><div className="tracker-card-grid">{trackers.filter(row=>row.payload.groupName===group).map(row => {
      const last=state.records.filter(entry=>entry.resourceType==="tracker_entry" && belongs(entry,row) && !hidden.has(entry.id)).map(entry=>String(entry.payload.occurredAt)).sort().at(-1) ?? null;
      return <article className="tracker-card" key={row.id}><a href={"#tracker-"+row.id} onClick={event=>{event.preventDefault();openTracker(row);}}><TrackerCardContent name={String(row.payload.name)} lastOccurredAt={last} picture={<LocalTrackerPicture row={row} state={state} />} /></a>{!readOnly && !row.payload.archivedAt && <button className="tracker-quick" disabled={working || !ready || !canEditTrackerRecord(row)} onClick={()=>void recordNow(row)} aria-label={"为 "+row.payload.name+" 新增记录"}><Icon name="plus" /></button>}</article>;
    })}</div></section>) : create ? null : <div className="empty-state"><span className="empty-icon"><Icon name="tracker" /></span><h2>暂无观测</h2>{!readOnly && <button className="button primary" onClick={()=>setCreate(true)}>新增观测</button>}</div>}
    {!readOnly && create && <TrackerCreateSheet groupNames={trackers.map(row=>String(row.payload.groupName))} allowImages={navigator.onLine&&!isPreviewAccount(account)} allowedFieldTypes={isPreviewAccount(account)||navigator.onLine?undefined:["number","text"]} onClose={()=>setCreate(false)} onCreate={async ({draft,iconFile,fields:definitions})=>{
      if(navigator.onLine&&!isPreviewAccount(account)){
        const {tracker,followUpErrors}=await createTrackerWithProperties(request,{draft,iconFile,fields:definitions});
        try{await synchronizeTrackerSession(account,platform);await platform.refreshReadonly(account);await store.initialize();const row=store.getSnapshot().records.find(row=>row.resourceType==="tracker"&&row.serverId===tracker.id);setSelectedId(row?.id??null);}catch{followUpErrors.push("the local copy still needs to refresh");}
        setTab("settings");setQuery("");setChartFilter(null);
        if(followUpErrors.length)setError(`Tracker created, but ${followUpErrors.join(" and ")}. Finish it in Settings; do not create it again.`);else showActionToast(english?"Tracker created.":"观测已创建。");return;
      }

      const input=parseNewTracker(draft);
      const parsedFields=definitions.map((field,sortOrder)=>parseNewTrackerField({...field,key:newTrackerLocalId(),options:field.options.split(/[,，]/).map(value=>value.trim()).filter(Boolean),precision:Number(field.precision),sortOrder},1));
      if(!isPreviewAccount(account)&&parsedFields.some(field=>!["number","text"].includes(field.type)||field.defaultValue!=null||field.showAfterQuickCapture))throw new Error("This phase supports new number/text properties without defaults. Create other property types on Web first.");
      const id=await store.createTracker(input,parsedFields);
      showActionToast("已保存到本机");setSelectedId(id);setTab("timeline");setQuery("");setChartFilter(null);void sync();
    }} />}
    {capture && selected && <TrackerEntryEditor readOnly={readOnly||!canEditTrackerRecord(selected)} trackerId={selected.serverId ?? 0} fields={fields} entry={editing ? { id:editing.id, occurredAt:String(editing.payload.occurredAt), values:editing.payload.values as Record<string,unknown>, note:String(editing.payload.note??"") } : undefined} onClose={()=>setCapture(false)} onSaved={()=>{showActionToast("已保存到本机");void sync();}} saveRecord={async input=>{
      if(readOnly||!canEditTrackerRecord(selected))throw new Error("请先联网取得 Tracker 同步版本，再编辑已有记录");
      await saveLocalTrackerEntry(store,selected,input,editing);
    }} />}
    {!readOnly && showBasics && selected && <LocalTrackerBasics tracker={selected} groups={trackers.map(row=>String(row.payload.groupName))} onClose={()=>setShowBasics(false)} onSave={async input=>{const parsed=parseNewTracker(input);await store.save("tracker",selected.id,{name:parsed.name,groupName:parsed.groupName,quickCaptureEnabled:parsed.quickCaptureEnabled});showActionToast("已保存到本机");void sync();}} />}
    {deleteTrackerOpen&&selected&&<FormSheet title={english?"Delete Tracker permanently":"永久删除 Tracker"} onClose={()=>setDeleteTrackerOpen(false)} formId="local-delete-tracker" submitLabel={english?"Delete permanently":"确认永久删除"} busy={working}><form id="local-delete-tracker" onSubmit={event=>{event.preventDefault();void perform(async()=>{
      if(!navigator.onLine)throw new Error(english?"Connect before permanently deleting a Tracker.":"请联网后永久删除 Tracker。");
      await synchronizeTrackerSession(account,platform);
      const current=store.getSnapshot();
      if(current.outbox.some(item=>{const row=current.records.find(row=>row.id===item.localId);return item.localId===selected.id||Boolean(row&&belongs(row,selected));}))throw new Error(english?"Sync or resolve pending edits before deleting this Tracker.":"请先同步或处理待提交的修改，再删除 Tracker。");
      if(!selected.serverId)throw new Error(english?"Sync this Tracker before deleting it.":"请先同步这个 Tracker。");
      const response=await request(`/api/trackers/${selected.serverId}`,{method:"DELETE"});
      if(!response.ok)throw new Error(await responseError(response,english?"Could not delete Tracker":"删除 Tracker 失败"));
      setDeleteTrackerOpen(false);setSelectedId(null);await synchronizeTrackerSession(account,platform);
      showActionToast(english?"Tracker deleted.":"Tracker 已删除","deleted");
    });}}><p>{english?"Permanently deletes this Tracker and all its records online. This cannot be undone. Pending edits must sync first.":"联网永久删除此 Tracker 及全部记录，无法撤销。待提交的修改必须先同步。"}</p></form></FormSheet>}
    {!readOnly && deleting && <FormSheet title="删除记录" onClose={()=>setDeleting(null)} formId="local-delete-record" submitLabel="确认删除" busy={working}><form id="local-delete-record" onSubmit={event=>{event.preventDefault();void perform(async()=>{await store.remove(deleting.id);showActionToast("已从本机删除","deleted");setDeleting(null);});}}><p>删除这条记录及其备注和属性值？联网后会同步删除。</p></form></FormSheet>}
  </main>;
}

function LocalTrackerBasics({tracker,groups,onClose,onSave}:{tracker:LocalTrackerRecord;groups:string[];onClose:()=>void;onSave:(input:{name:string;groupName:string;quickCaptureEnabled:boolean})=>Promise<void>}) {
  const [name,setName]=useState(String(tracker.payload.name)),[groupName,setGroup]=useState(String(tracker.payload.groupName)),[quick,setQuick]=useState(Boolean(tracker.payload.quickCaptureEnabled));
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  async function submit(event:FormEvent){event.preventDefault();if(busy)return;setBusy(true);setError("");try{await onSave({name,groupName,quickCaptureEnabled:quick});onClose();}catch(reason){setError(reason instanceof Error?reason.message:"保存失败，请重试。");}finally{setBusy(false);}}
  return <FormSheet title="编辑 Tracker" onClose={onClose} formId="local-tracker-basics" submitLabel="保存" busy={busy}><form id="local-tracker-basics" className="editor-card tracker-rename-form" onSubmit={submit}><label className="field"><span>名称</span><input required maxLength={80} value={name} onChange={event=>setName(event.target.value)} /></label><div className="field"><span>分组</span><SuggestedInput suggestionLabel="分组" suggestions={groups} maxLength={60} value={groupName} onValueChange={setGroup} /></div><TrackerCaptureToggle enabled={quick} onChange={setQuick} />{error && <ErrorNotice>{error}</ErrorNotice>}</form></FormSheet>;
}
