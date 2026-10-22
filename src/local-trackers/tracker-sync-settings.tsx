import {useEffect,useMemo,useState,useSyncExternalStore} from "react";
import {Cloud,CloudChange,CloudCheck} from "reicon-react";
import {FormSheet} from "@/components/form-sheet";
import {DevelopmentDetails} from "@/components/development-details";
import {ErrorNotice} from "@/components/error-notice";
import {useLocale} from "@/components/locale-controller";
import type {LocalTrackerRecord} from "@/lib/tracker-local-store";
import {isPreviewAccount,type LocalAccount,type TrackerPlatform} from "./platform";
import {trackerSession,trackerSyncActivity,synchronizeTrackerSession} from "./tracker-session";

type Props={account:LocalAccount;platform:TrackerPlatform;onEditConflict?:(record:LocalTrackerRecord)=>void;inSheet?:boolean};
function useSyncStatus({account,platform}:Props){
 const store=useMemo(()=>trackerSession(account,platform),[account,platform]);
 const state=useSyncExternalStore(store.subscribe,store.getSnapshot),activity=trackerSyncActivity(store);
 const progress=useSyncExternalStore(activity.subscribe,activity.getSnapshot);
 const [online,setOnline]=useState(()=>navigator.onLine),{english}=useLocale();
 useEffect(()=>{const changed=()=>setOnline(navigator.onLine);window.addEventListener("online",changed);window.addEventListener("offline",changed);return()=>{window.removeEventListener("online",changed);window.removeEventListener("offline",changed);};},[]);
 const issues=state.records.filter(row=>row.status),paused=platform.readOnly(account),preview=isPreviewAccount(account);
 const status=paused?"paused":preview?"preview":issues.length?"attention":progress.syncing?"syncing":!online?"offline":progress.error?"attention":state.outbox.length?"pending":state.remoteRevision?"current":"waiting";
 const labels=english?{paused:"Paused",preview:"Local preview",attention:"Needs attention",syncing:"Syncing",offline:"Offline · saved on device",pending:"Changes saved on device",current:"No pending changes",waiting:"Waiting for cloud connection"}:{paused:"已暂停",preview:"本机预览",attention:"需要处理",syncing:"同步中",offline:"离线 · 已保存在本机",pending:"更改已保存到本机",current:"没有待同步更改",waiting:"等待连接云端"};
 return {store,state,progress,issues,paused,preview,status,label:labels[status],english};
}
export function TrackerSyncButton(props:Props){
 const [open,setOpen]=useState(false),{status,label,english}=useSyncStatus(props);
 const SyncIcon=status==="syncing"?CloudChange:status==="current"?CloudCheck:Cloud;
 return <><button type="button" className="icon-button tracker-sync-button" data-status={status} title={label} aria-label={(english?"Tracker sync: ":"Tracker 同步：")+label} aria-haspopup="dialog" aria-busy={status==="syncing"} onClick={()=>setOpen(true)}><SyncIcon size={21} weight="Outline"/>{["attention","pending","offline"].includes(status)&&<span className="tracker-sync-mark" aria-hidden="true">{status==="attention"?"!":""}</span>}</button>{open&&<FormSheet title={english?"Tracker sync":"Tracker 同步"} onClose={()=>setOpen(false)}><TrackerSyncSettings {...props} inSheet onEditConflict={props.onEditConflict?row=>{props.onEditConflict?.(row);setOpen(false);}:undefined}/></FormSheet>}</>;
}
export function TrackerSyncSettings(props:Props){
 const {account,platform,onEditConflict}=props,{store,state,progress,issues,paused,preview,label,english}=useSyncStatus(props);
 const [inspection,setInspection]=useState<{pending:number;frozen:number;backupFile?:string}|null>(null),[error,setError]=useState(""),[working,setWorking]=useState(false),[confirmRemote,setConfirmRemote]=useState<string|null>(null);
 useEffect(()=>{let alive=true;void store.initialize().then(()=>platform.inspection(account)).then(value=>{if(alive)setInspection(value);}).catch(reason=>{if(alive)setError(String(reason));});return()=>{alive=false;};},[store,platform,account]);
 async function sync(){try{setError("");await synchronizeTrackerSession(account,platform);}catch{/* The shared activity retains the error in this panel. */}}
 async function resolve(row:LocalTrackerRecord,choice:"local"|"remote"){
  if(paused||working)return;setWorking(true);setError("");try{await store.resolve(row.id,choice);setConfirmRemote(null);void sync();}catch(reason){setError(String(reason));}finally{setWorking(false);}
 }
 return <section className="tracker-sync-settings" aria-label={english?"Tracker sync details":"Tracker 同步详情"}>
  <div className="section-heading"><div>{!props.inSheet&&<h2>{english?"Tracker sync":"Tracker 同步"}</h2>}<p role="status">{label}</p></div><button type="button" className="button secondary" disabled={progress.syncing||working||preview&&!paused} onClick={()=>void sync()}>{progress.syncing?(english?"Syncing…":"同步中…"):paused?(english?"Refresh snapshot":"刷新快照"):(english?"Sync now":"立即同步")}</button></div>
  <div className="settings-summary"><section><span>{english?"Pending changes":"待同步更改"}</span><strong>{state.outbox.length}</strong></section><section><span>{english?"Needs attention":"需要处理"}</span><strong>{issues.length}</strong></section><section><span>{english?"Last successful sync":"上次成功同步"}</span><strong>{progress.lastSyncedAt?new Date(progress.lastSyncedAt).toLocaleString(english?"en-US":"zh-CN"):"—"}</strong></section></div>
  {(error||progress.error)&&<ErrorNotice inline>{error||progress.error}</ErrorNotice>}
  {!!issues.length&&<div className="local-sync-issues">{issues.map(row=><article key={row.id}><strong className="user-content">{String(row.payload.name??row.payload.note??(english?"Record":"记录"))}</strong><p>{row.error}</p><details><summary>{english?"Compare preserved versions":"查看保留的本地与远端内容"}</summary><pre>{JSON.stringify({local:row.payload,remote:row.remote?.payload??null},null,2)}</pre></details><div className="local-issue-actions"><button className="button secondary" disabled={paused||working} onClick={()=>void resolve(row,"local")}>{english?"Keep local and retry":"保留本地并重试"}</button>{row.resourceType==="tracker_entry"&&onEditConflict&&<button className="text-button" disabled={paused||working} onClick={()=>onEditConflict(row)}>{english?"Edit local record":"编辑本地记录"}</button>}<button className="text-button" disabled={paused||working} onClick={()=>setConfirmRemote(row.id)}>{row.remote?(english?"Use remote":"采用远端"):(english?"Discard local changes":"放弃本地更改")}</button></div>{confirmRemote===row.id&&<div className="tracker-sync-confirm"><p>{english?"This replaces the unsynced local version with the remote version, or removes it if remotely deleted. Export first if you need a copy.":"这会用远端版本替换未同步的本地内容；远端已删除时会移除本地内容。需要保留副本时请先导出。"}</p><button className="button danger" disabled={paused||working} onClick={()=>void resolve(row,"remote")}>{english?"Confirm replacement":"确认替换"}</button><button className="text-button" onClick={()=>setConfirmRemote(null)}>{english?"Cancel":"取消"}</button></div>}</article>)}</div>}
  <button type="button" className="text-button" disabled={working||progress.syncing} onClick={()=>{localStorage.setItem("evaorbit.trackerMode",paused?"editing":"readonly");window.location.reload();}}>{paused?(english?"Enable Tracker editing":"开启 Tracker 编辑"):(english?"Pause Tracker editing":"暂停 Tracker 编辑")}</button>
  <DevelopmentDetails title={english?"Storage & safety":"存储与安全"}><p>{english?"Changes are saved on this device before syncing. Pausing keeps records and pending operations. Other modules save online; offline edits are not queued.":"更改先保存到本机，再同步。暂停会保留记录与待同步操作，其他模块联网保存，离线修改不会排队上传。"}</p>{!paused&&!state.remoteRevision&&<p>{english?"Existing cloud records stay read-only until a complete versioned sync succeeds.":"已有云端记录取得完整同步版本后才开放编辑。"}</p>}{inspection&&<p>{english?"Original queue (isolated): "+inspection.pending+" pending, including "+inspection.frozen+" frozen; nothing uploaded. "+(inspection.backupFile?"SQLite backup verified.":"Original queue unchanged."):"原队列 "+inspection.pending+" 项，其中 "+inspection.frozen+" 项已冻结；未上传。"+(inspection.backupFile?"SQLite 备份已校验。":"原有队列保持不变。")}</p>}</DevelopmentDetails>
 </section>;
}
