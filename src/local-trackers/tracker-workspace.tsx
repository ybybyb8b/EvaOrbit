import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { ErrorNotice } from "@/components/error-notice";
import { showActionToast } from "@/components/action-toast";
import { PageHeading } from "@/components/page-heading";
import { FormSheet } from "@/components/form-sheet";
import { SuggestedInput } from "@/components/suggested-input";
import { Icon } from "@/components/icons";
import { TrackerPicture } from "@/components/tracker-picture";
import { TrackerCardContent } from "@/components/tracker-card-content";
import { TrackerEntryEditor } from "@/app/trackers/tracker-entry-editor";
import { TrackerCreateSheet } from "@/app/trackers/tracker-create-sheet";
import { TrackerCaptureToggle } from "@/app/trackers/tracker-capture-toggle";
import { TrackerTimelineRecords } from "@/app/trackers/tracker-timeline-records";
import { TrackerActivityInsights } from "@/app/trackers/tracker-activity-insights";
import { LocalTrackerStore, newTrackerLocalId, type LocalTrackerRecord } from "@/lib/tracker-local-store";
import { matchesTrackerSearch, entryMatchesPeriod, entryMatchesField, type TimelinePeriod } from "@/lib/tracker-timeline";
import { TrackerTimelineToolbar } from "@/app/trackers/tracker-timeline-toolbar";
import { trackerDistributionEntries, trackerInsightEntries, type TrackerInsightPeriod } from "@/lib/tracker-insights";
import { validatedTrackerValues } from "@/lib/tracker-values";
import { parseNewTracker, parseNewTrackerEntry, parseNewTrackerField } from "@/lib/validation";
import type { TrackerField } from "@/lib/types";
import { nativeCall } from "@/lib/native-bridge";
import { applyAppearance, storedAppearance, COLOR_THEME_STORAGE_KEY } from "@/lib/theme-runtime";
import { normalizeColorTheme } from "@/lib/theme";
import { isPreviewAccount, type LocalAccount, type TrackerPlatform } from "./platform";
function localAppearance() { try { return storedAppearance(); } catch { return { appearanceMode: "system" as const, colorTheme: "editorial" as const }; } }
function asField(row: LocalTrackerRecord): TrackerField {
  return { id: row.serverId ?? 0, trackerId: Number(row.payload.trackerId ?? 0), key: String(row.payload.key), name: String(row.payload.name), type: row.payload.type as TrackerField["type"], required: Boolean(row.payload.required), defaultValue: row.payload.defaultValue ?? null, options: row.payload.options as string[] ?? [], showAfterQuickCapture: Boolean(row.payload.showAfterQuickCapture), includeInStats: Boolean(row.payload.includeInStats), sortOrder: Number(row.payload.sortOrder ?? 0), unit: String(row.payload.unit ?? ""), precision: Number(row.payload.precision ?? 0), config: {}, archivedAt: row.payload.archivedAt as string | null ?? null, createdAt: String(row.payload.createdAt ?? ""), updatedAt: String(row.payload.updatedAt ?? "") };
}
function belongs(row: LocalTrackerRecord, tracker: LocalTrackerRecord) { return row.payload.trackerLocalId === tracker.id || tracker.serverId !== undefined && row.payload.trackerId === tracker.serverId; }

export function TrackerWorkspace({ account, platform, onSignIn, onSignOut }: { account: LocalAccount; platform: TrackerPlatform; onSignIn: () => void; onSignOut: () => void }) {
  const readOnly = platform.readOnly(account);
  const [inspection, setInspection] = useState<{pending:number;frozen:number;backupFile?:string}|null>(null);
  const refreshing = useRef<Promise<void>|null>(null);
  const store = useMemo(() => new LocalTrackerStore(account.accountId, platform.storage(account)), [account, platform]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [ready, setReady] = useState(false), [error, setError] = useState(""), [syncing, setSyncing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null), [create, setCreate] = useState(false), [capture, setCapture] = useState(false);
  const [editing, setEditing] = useState<LocalTrackerRecord | undefined>(), [deleting, setDeleting] = useState<LocalTrackerRecord | null>(null);
  const [discarding, setDiscarding] = useState<LocalTrackerRecord | null>(null);
  const [query, setQuery] = useState(""), [theme, setTheme] = useState(() => localAppearance().colorTheme);
  const [tab, setTab] = useState<"timeline" | "insights" | "settings">("timeline");
  const [periodFilter, setPeriodFilter] = useState<TimelinePeriod>("all"), [fieldFilter, setFieldFilter] = useState(""), [fieldValueFilter, setFieldValueFilter] = useState("");
  const [insightPeriod, setInsightPeriod] = useState<TrackerInsightPeriod>("month");
  const [chartFilter, setChartFilter] = useState<{kind:"monthly"|"weekdays"|"dayParts";key:string;label:string}|null>(null);
  const [showBasics, setShowBasics] = useState(false), [working, setWorking] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  async function sync() {
    if (isPreviewAccount(account) && !readOnly) return;
    if (refreshing.current) return refreshing.current;
    const job = (async () => {
      setSyncing(true);
      try {
        if (readOnly) { setInspection(await platform.inspection(account)); await platform.refreshReadonly(account); await store.initialize(); }
        else await store.synchronize(platform.sync);
        setError(""); setSyncedAt(new Date().toISOString());
      } catch (reason) { setError(reason instanceof TypeError ? "离线或暂时无法读取云端，只读快照已保留。" : reason instanceof Error ? reason.message : "暂时无法读取云端记录，上次只读快照已保留"); }
      finally { setSyncing(false); }
    })();
    refreshing.current = job;
    try { await job; } finally { if (refreshing.current === job) refreshing.current = null; }
  }
  useEffect(() => {
    let alive = true;
    store.initialize().then(() => { if (alive) { setReady(true); if(readOnly)void platform.inspection(account).then(setInspection).catch(reason=>setError(String(reason))); void sync(); } }).catch(reason => { if (alive) setError(String(reason)); });
    const refresh = () => { if (alive && document.visibilityState !== "hidden") void sync(); };
    window.addEventListener("online", refresh); window.addEventListener("evaorbit:native-active", refresh); document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 60000);
    return () => { alive = false; clearInterval(timer); window.removeEventListener("online", refresh); window.removeEventListener("evaorbit:native-active", refresh); document.removeEventListener("visibilitychange", refresh); };
    // The store and account are the lifecycle; edits do not restart the scheduler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);
  useEffect(() => {
    const apply = () => applyAppearance(localAppearance().appearanceMode, theme, false);
    apply();
    try { localStorage.setItem(COLOR_THEME_STORAGE_KEY, theme); } catch { /* Native records remain in SQLite. */ }
    const media = matchMedia("(prefers-color-scheme: dark)"); media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  const selected = state.records.find(row => row.id === selectedId && row.resourceType === "tracker");
  const trackers = state.records.filter(row => row.resourceType === "tracker" && !row.payload.archivedAt);
  const hidden = new Set(state.outbox.filter(item => item.operation === "delete").map(item => item.localId));
  const entries = state.records.filter(row => row.resourceType === "tracker_entry" && selected && belongs(row, selected) && !hidden.has(row.id)).sort((a, b) => String(b.payload.occurredAt).localeCompare(String(a.payload.occurredAt)));
  const fields = state.records.filter(row => row.resourceType === "tracker_field" && selected && belongs(row, selected)).map(asField).sort((a, b) => a.sortOrder - b.sortOrder);
  const timelineEntries = entries.map(row => ({ id: row.id, occurredAt: String(row.payload.occurredAt), note: String(row.payload.note ?? ""), values: row.payload.values as Record<string, unknown> ?? {}, row }));
  const chartRows = chartFilter ? new Set(trackerDistributionEntries(trackerInsightEntries(timelineEntries, insightPeriod), chartFilter.kind, chartFilter.key).map(entry => entry.id)) : null;
  const filtersActive = Boolean(query.trim() || chartFilter || periodFilter !== "all" || fieldFilter);
  const filtered = timelineEntries.filter(entry => matchesTrackerSearch(entry, query) && (!chartRows || chartRows.has(entry.id)) && entryMatchesPeriod(entry, periodFilter) && entryMatchesField(entry, fields.find(field=>field.key===fieldFilter), fieldValueFilter));
  const issues = state.records.filter(row => row.status);
  async function perform(action: () => Promise<unknown>) { if (working) return; setWorking(true); try { if(readOnly)throw new Error("只读验收模式禁止修改记录"); await action(); setError(""); void sync(); } catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败，请重试"); } finally { setWorking(false); } }
  async function signOut() { try { await platform.signOut(); onSignOut(); } catch (reason) { setError(String(reason)); } }
  function status(row: LocalTrackerRecord) { if(readOnly)return "只读快照"; return row.status ? "需要处理" : state.outbox.some(item => item.localId === row.id) ? "待同步" : "已保存"; }
  function exportLocal() {
    if (platform.native) { void nativeCall("trackers.exportState").catch(reason => setError(String(reason))); return; }
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "evaorbit-trackers-local.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function openTracker(row: LocalTrackerRecord, detailed=false) { setSelectedId(row.id); setQuery(""); setPeriodFilter("all"); setFieldFilter(""); setFieldValueFilter(""); setChartFilter(null); setTab("timeline"); if (detailed) { setEditing(undefined); setCapture(true); } }
  async function recordNow(row: LocalTrackerRecord) {
    if (readOnly || row.status || row.payload.archivedAt || !ready) return;
    if (!row.payload.quickCaptureEnabled) { openTracker(row, true); return; }
    await perform(async () => {
      const recordFields = state.records.filter(field => field.resourceType === "tracker_field" && belongs(field, row)).map(asField);
      await store.save("tracker_entry", undefined, { ...parseNewTrackerEntry({}, row.serverId ?? 1), trackerId: row.serverId, trackerLocalId: row.id, values: validatedTrackerValues(recordFields, {}, true, false) });
      showActionToast("已保存到本机");
    });
  }
  const action = <button className="button primary" disabled={!ready || working || Boolean(selected?.status) || Boolean(selected?.payload.archivedAt)} onClick={() => selected ? void recordNow(selected) : setCreate(true)}><Icon name="plus" />{selected ? selected.payload.quickCaptureEnabled ? "立即记录" : "新增记录" : "新增观测"}</button>;
  return <main className={selected ? "page tracker-detail-page local-trackers" : "page tracker-page local-trackers"}>
    <div className="local-tracker-toolbar">{selectedId ? <button className="back-link text-button" onClick={() => { setSelectedId(null); setQuery(""); setChartFilter(null); }}>返回 Trackers</button> : <span className="local-brand"><span className="brand-mark" aria-hidden="true"><span /></span>EvaOrbit</span>}
      <details className="local-account-menu"><summary aria-label="账户与同步"><Icon name="settings" /></summary><div>
        <strong className="user-content">{account.email}</strong>
        <label className="field"><span>颜色主题</span><select aria-label="颜色主题" value={theme} onChange={event => setTheme(normalizeColorTheme(event.target.value))}>{["editorial", "rosewood", "powderblue", "mistviolet"].map(value => <option key={value}>{value}</option>)}</select></label>
        <button className="text-button" onClick={onSignIn}>连接账户</button><button className="text-button" onClick={exportLocal}>导出本地记录</button><a className="text-button" href="https://eva-orbit.vercel.app/trackers" target="_blank" rel="noreferrer">打开网页版</a><button className="text-button" onClick={() => void signOut()}>退出账户</button>
      </div></details>
    </div>
    <PageHeading eyebrow={selected ? "" : "生活"} title={selected ? <span className="tracker-title"><TrackerPicture icon={String(selected.payload.icon ?? "")} size={44} /><span className="user-content">{String(selected.payload.name)}</span></span> : "Trackers"} description={selected ? String(selected.payload.groupName ?? "") : undefined} action={readOnly ? <span className="tracker-archived-label">只读验收</span> : selected?.payload.archivedAt ? <span className="tracker-archived-label">已归档</span> : action} />
    <div className="local-sync-status" role="status"><span>{readOnly ? (syncing ? "正在读取云端数据 · 上传已停用" : "只读快照 · 原有数据与队列已隔离") : isPreviewAccount(account) ? "本机预览 · 数据不会上传" : syncing ? "正在同步" : state.outbox.length ? state.outbox.length+" 项待同步 · 已保存在本机" : syncedAt ? "已同步 · 本机可离线使用" : "本机记录"}</span><button className="text-button" disabled={syncing || !ready || isPreviewAccount(account) && !readOnly} onClick={() => void sync()}>{readOnly ? "刷新只读数据" : "同步"}</button></div>
    {readOnly && inspection && <p className="tracker-settings-help" role="status">原队列 {inspection.pending} 项，其中 {inspection.frozen} 项已冻结；未上传。{inspection.backupFile ? "SQLite 备份已校验。" : "原有队列保持不变。"}</p>}
    {error && <ErrorNotice>{error}</ErrorNotice>}
    {issues.length > 0 && <section className="local-sync-issues" aria-label="同步问题">{issues.map(row => <article key={row.id}>
      <strong>{String(row.payload.name ?? row.payload.note ?? "记录") || "记录"}</strong><p>{row.error}</p>
      <details><summary>查看保留的本地与远端内容</summary><pre>{JSON.stringify({ local: row.payload, remote: row.remote?.payload ?? null }, null, 2)}</pre></details>
      <div className="local-issue-actions"><button className="button secondary" onClick={() => void perform(() => store.resolve(row.id, "local"))}>保留本地并重试</button>
        {row.resourceType === "tracker_entry" && <button className="text-button" onClick={() => {
          const parent = trackers.find(tracker => belongs(row, tracker));
          if (!parent) { setError("所属 Tracker 已删除，可先导出本地内容"); return; }
          setSelectedId(parent.id); setEditing(row); setCapture(true);
        }}>编辑本地记录</button>}
        <button className="text-button" onClick={() => setDiscarding(row)}>{row.remote ? "采用远端" : "放弃本地更改"}</button>
      </div>
    </article>)}</section>}

    {!ready ? <p role="status">正在读取本机记录…</p> : readOnly && state.revision === 0 ? <p role="status">尚未缓存真实 Tracker 数据，请联网刷新只读数据。</p> : selected ? <>
      <nav className="tracker-tabs" role="tablist" aria-label="Tracker 视图">{(["timeline","insights","settings"] as const).map((value,index,values) => <button type="button" role="tab" id={"tracker-tab-"+value} aria-controls={"tracker-panel-"+value} aria-selected={tab===value} tabIndex={tab===value?0:-1} className={tab===value?"active":""} onClick={()=>setTab(value)} onKeyDown={event=>{const next=event.key==="ArrowRight"?values[(index+1)%values.length]:event.key==="ArrowLeft"?values[(index+values.length-1)%values.length]:event.key==="Home"?values[0]:event.key==="End"?values.at(-1):undefined;if(next){event.preventDefault();setTab(next);document.getElementById("tracker-tab-"+next)?.focus();}}} key={value}>{{timeline:"时间线",insights:"洞察",settings:"设置"}[value]}</button>)}</nav>
      <div role="tabpanel" id={"tracker-panel-"+tab} aria-labelledby={"tracker-tab-"+tab} tabIndex={0}>
        {selected.payload.archivedAt ? <p className="tracker-archive-note">历史数据已保留。请在网页版恢复 Tracker 后继续记录。</p> : null}
        {tab==="timeline" && <section className="tracker-detail-section tracker-timeline-section"><div className="section-heading tracker-timeline-heading"><div><h2>全部记录</h2><p>{filtersActive ? "显示 "+filtered.length+" / "+entries.length+" 条记录" : entries.length+" 条记录"}</p></div></div>
          {chartFilter && <p className="tracker-chart-caption">{chartFilter.label} · 来自图表的筛选</p>}
          <TrackerTimelineToolbar query={query} setQuery={setQuery} fields={fields} periodFilter={periodFilter} setPeriodFilter={setPeriodFilter} fieldFilter={fieldFilter} setFieldFilter={setFieldFilter} fieldValueFilter={fieldValueFilter} setFieldValueFilter={setFieldValueFilter} filtersActive={filtersActive} onClear={()=>{setQuery("");setPeriodFilter("all");setFieldFilter("");setFieldValueFilter("");setChartFilter(null);}} />
          {filtered.length ? <TrackerTimelineRecords readOnly={readOnly} entries={filtered} fields={fields} working={working} disabled={entry=>Boolean(entry.row.status)} status={entry=>status(entry.row)} onEdit={entry=>{setEditing(entry.row);setCapture(true);}} onDelete={entry=>setDeleting(entry.row)} /> : <div className="empty-state compact-empty"><h2>{filtersActive ? "没有匹配的记录" : "暂无记录"}</h2><p>{filtersActive ? "尝试扩大时间范围或清除部分筛选条件。" : "发生时立即记录即可。"}</p></div>}
        </section>}
        {tab==="insights" && <TrackerActivityInsights entries={timelineEntries} fields={fields} lastOccurredAt={timelineEntries[0]?.occurredAt ?? null} archived={readOnly || Boolean(selected.payload.archivedAt)} working={working} insightPeriod={insightPeriod} onPeriodChange={setInsightPeriod} onCapture={()=>void recordNow(selected)} onSelectChart={(kind,key,label)=>{setQuery("");setPeriodFilter("all");setFieldFilter("");setFieldValueFilter("");setChartFilter({kind,key,label});setTab("timeline");}} />}
        {tab==="settings" && <div className="tracker-settings"><p className="tracker-settings-overview">{fields.filter(field=>!field.archivedAt).length} 个属性</p><section className="tracker-settings-section">
          <div className="section-heading"><h2>基本信息</h2><button className="text-button" disabled={readOnly || working || Boolean(selected.status)} onClick={()=>setShowBasics(true)}>编辑</button></div>
          <dl className="tracker-settings-summary"><div><dt>名称</dt><dd className="user-content">{String(selected.payload.name)}</dd></div><div><dt>分组</dt><dd className="user-content">{String(selected.payload.groupName)}</dd></div><div><dt>默认记录方式</dt><dd>{selected.payload.quickCaptureEnabled?"立即记录":"打开详细表单"}</dd></div></dl>
        </section><details className="tracker-settings-section tracker-settings-disclosure"><summary>记录属性<span>查看</span><Icon name="arrow" /></summary><div className="tracker-setting-list">{fields.map(field=><article key={field.key}><div><strong className="user-content">{field.name}</strong><small>{({time_range:"时间段",number:"数字",single_select:"单选",multi_select:"多选",text:"文本",boolean:"是 / 否",rating:"评价"})[field.type]}{field.unit?" · "+field.unit:""}{field.required?" · 必填":""}{field.archivedAt?" · 已归档":""}</small></div></article>)}</div></details><section className="tracker-settings-section"><h2>更多设置</h2><p className="tracker-settings-help">图片、属性管理、目标和提醒可在网页版设置。</p><a className="text-button" href="https://eva-orbit.vercel.app/trackers" target="_blank" rel="noreferrer">打开网页版</a></section></div>}
      </div>
    </> : trackers.length ? [...new Set(trackers.map(row => String(row.payload.groupName)))].map(group => <section className="tracker-group" key={group}><div className="tracker-group-heading"><h2>{group}</h2><span>{trackers.filter(row=>row.payload.groupName===group).length}</span></div><div className="tracker-card-grid">{trackers.filter(row=>row.payload.groupName===group).map(row => {
      const last=state.records.filter(entry=>entry.resourceType==="tracker_entry" && belongs(entry,row) && !hidden.has(entry.id)).map(entry=>String(entry.payload.occurredAt)).sort().at(-1) ?? null;
      return <article className="tracker-card" key={row.id}><a href={"#tracker-"+row.id} onClick={event=>{event.preventDefault();openTracker(row);}}><TrackerCardContent name={String(row.payload.name)} lastOccurredAt={last} picture={<TrackerPicture icon={String(row.payload.icon??"")} />} /></a>{!readOnly && !row.payload.archivedAt && <button className="tracker-quick" disabled={working || !ready || Boolean(row.status)} onClick={()=>void recordNow(row)} aria-label={"为 "+row.payload.name+" 新增记录"}><Icon name="plus" /></button>}</article>;
    })}</div></section>) : create ? null : <div className="empty-state"><span className="empty-icon"><Icon name="tracker" /></span><h2>暂无观测</h2>{!readOnly && <button className="button primary" onClick={()=>setCreate(true)}>新增观测</button>}</div>}
    {!readOnly && create && <TrackerCreateSheet groupNames={trackers.map(row=>String(row.payload.groupName))} allowImages={false} onClose={()=>setCreate(false)} onCreate={async ({draft,fields:definitions})=>{
      const input=parseNewTracker(draft);
      const parsedFields=definitions.map((field,sortOrder)=>parseNewTrackerField({...field,key:newTrackerLocalId(),options:field.options.split(/[,，]/).map(value=>value.trim()).filter(Boolean),precision:Number(field.precision),sortOrder},1));
      const id=await store.createTracker(input,parsedFields);
      showActionToast("已保存到本机");setSelectedId(id);setTab("timeline");setQuery("");setChartFilter(null);void sync();
    }} />}
    {capture && selected && <TrackerEntryEditor readOnly={readOnly} trackerId={selected.serverId ?? 0} fields={fields} entry={editing ? { id:editing.id, occurredAt:String(editing.payload.occurredAt), values:editing.payload.values as Record<string,unknown>, note:String(editing.payload.note??"") } : undefined} onClose={()=>setCapture(false)} onSaved={()=>{showActionToast("已保存到本机");void sync();}} saveRecord={async input=>{
      if(readOnly)throw new Error("只读验收模式禁止修改记录");
      const parsed=parseNewTrackerEntry(input,selected.serverId??1);
      const payload={...parsed,trackerId:selected.serverId,trackerLocalId:selected.id,values:validatedTrackerValues(fields,parsed.values,Boolean(selected.payload.quickCaptureEnabled),Boolean(editing))};
      if(editing?.status)await store.resolve(editing.id,"local",payload);else await store.save("tracker_entry",editing?.id,payload);
    }} />}
    {!readOnly && showBasics && selected && <LocalTrackerBasics tracker={selected} groups={trackers.map(row=>String(row.payload.groupName))} onClose={()=>setShowBasics(false)} onSave={async input=>{const parsed=parseNewTracker(input);await store.save("tracker",selected.id,{...selected.payload,name:parsed.name,groupName:parsed.groupName,quickCaptureEnabled:parsed.quickCaptureEnabled});showActionToast("已保存到本机");void sync();}} />}
    {!readOnly && deleting && <FormSheet title="删除记录" onClose={()=>setDeleting(null)} formId="local-delete-record" submitLabel="确认删除" busy={working}><form id="local-delete-record" onSubmit={event=>{event.preventDefault();void perform(async()=>{await store.remove(deleting.id);showActionToast("已从本机删除","deleted");setDeleting(null);});}}><p>删除这条记录及其备注和属性值？联网后会同步删除。</p></form></FormSheet>}
    {!readOnly && discarding && <FormSheet title="放弃本地更改" onClose={()=>setDiscarding(null)}><p>本地尚未同步的更改会被远端版本替换；远端已删除的记录会从本机移除。可先导出本地记录留存。</p><button className="button danger" disabled={working} onClick={()=>void perform(async()=>{await store.resolve(discarding.id,"remote");setDiscarding(null);})}>确认放弃本地更改</button></FormSheet>}
  </main>;
}

function LocalTrackerBasics({tracker,groups,onClose,onSave}:{tracker:LocalTrackerRecord;groups:string[];onClose:()=>void;onSave:(input:{name:string;groupName:string;quickCaptureEnabled:boolean})=>Promise<void>}) {
  const [name,setName]=useState(String(tracker.payload.name)),[groupName,setGroup]=useState(String(tracker.payload.groupName)),[quick,setQuick]=useState(Boolean(tracker.payload.quickCaptureEnabled));
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  async function submit(event:FormEvent){event.preventDefault();if(busy)return;setBusy(true);setError("");try{await onSave({name,groupName,quickCaptureEnabled:quick});onClose();}catch(reason){setError(reason instanceof Error?reason.message:"保存失败，请重试。");}finally{setBusy(false);}}
  return <FormSheet title="编辑 Tracker" onClose={onClose} formId="local-tracker-basics" submitLabel="保存" busy={busy}><form id="local-tracker-basics" className="editor-card tracker-rename-form" onSubmit={submit}><label className="field"><span>名称</span><input required maxLength={80} value={name} onChange={event=>setName(event.target.value)} /></label><div className="field"><span>分组</span><SuggestedInput suggestionLabel="分组" suggestions={groups} maxLength={60} value={groupName} onValueChange={setGroup} /></div><TrackerCaptureToggle enabled={quick} onChange={setQuick} />{error && <ErrorNotice>{error}</ErrorNotice>}</form></FormSheet>;
}
