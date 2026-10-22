import {LocalRouteContext} from "./routes";
import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from "react";
import {Cloud,CloudChange,CloudCheck} from "reicon-react";
import {FormSheet} from "@/components/form-sheet";
import {useLocale} from "@/components/locale-controller";

type DownloadStatus={module:string;capturedAt?:string;busy:boolean;error?:string;complete?:boolean;refresh:()=>void};
const Register=createContext<(status:DownloadStatus)=>()=>void>(()=>()=>{});
const Status=createContext<DownloadStatus|null>(null);
export function DownloadStatusProvider({children}:{children:ReactNode}){
 const [status,setStatus]=useState<DownloadStatus|null>(null);
 const register=useCallback((next:DownloadStatus)=>{setStatus(next);return()=>setStatus(current=>current===next?null:current);},[]);
 return <Register.Provider value={register}><Status.Provider value={status}>{children}</Status.Provider></Register.Provider>;
}
// Register facts from the existing loader; the indicator never starts a second fetch.
export function LocalDownloadStatus({module,capturedAt,busy,error,complete,refresh}:DownloadStatus){
 const register=useContext(Register),latest=useRef(refresh);
 useEffect(()=>{latest.current=refresh;});
 useEffect(()=>register({module,capturedAt,busy,error,complete,refresh:()=>latest.current()}),[register,module,capturedAt,busy,error,complete]);
 return null;
}
export function DownloadStatusButton(){
 const {navigate}=useContext(LocalRouteContext);
 const status=useContext(Status),{english}=useLocale(),[open,setOpen]=useState(false),[online,setOnline]=useState(()=>navigator.onLine);
 useEffect(()=>{const update=()=>setOnline(navigator.onLine);window.addEventListener("online",update);window.addEventListener("offline",update);return()=>{window.removeEventListener("online",update);window.removeEventListener("offline",update);};},[]);
 if(!status)return null;
 const state=!online?"offline":status.error?"attention":status.busy?"refreshing":status.capturedAt?"cached":"waiting";
 const labels=english?{offline:"Offline",attention:"Could not refresh",refreshing:"Refreshing",cached:"Downloaded",waiting:"Not downloaded"}:{offline:"离线",attention:"刷新失败",refreshing:"正在刷新",cached:"已下载",waiting:"尚未下载"};
 const Icon=state==="refreshing"?CloudChange:state==="cached"?CloudCheck:Cloud,label=labels[state];
 return <><button type="button" className="icon-button local-download-button" data-status={state} aria-label={`${status.module}: ${label}`} title={`${status.module} · ${label}`} aria-haspopup="dialog" aria-busy={state==="refreshing"} onClick={()=>setOpen(true)}><Icon size={21} weight="Outline"/>{state==="attention"&&<span aria-hidden="true">!</span>}</button>{open&&<FormSheet title={english?"Data status":"数据状态"} onClose={()=>setOpen(false)}><div className="local-download-details"><h3>{status.module}</h3><p role="status">{label}</p><p>{english?"Last download: ":"上次下载："}{status.capturedAt?new Date(status.capturedAt).toLocaleString(english?"en-US":"zh-CN"):"—"}</p>{status.complete===false&&<p>{english?"Only part of the history is downloaded. Older records may still be online.":"仅下载了部分历史，较早的记录可能仍在云端。"}</p>}<p>{english?"Downloaded records are available offline. Changes in this module save online; offline edits are not queued.":"已下载的记录可离线查看。本模块修改联网保存，离线修改不会排队上传。"}</p>{status.error&&<p role="alert">{status.error}</p>}<button type="button" className="button secondary" disabled={!online||status.busy} onClick={status.refresh}>{english?"Refresh":"刷新"}</button><button type="button" className="text-button" onClick={()=>{setOpen(false);navigate("/settings/data-sync");}}>{english?"Manage data & sync":"管理数据与同步"}</button></div></FormSheet>}</>;
}
