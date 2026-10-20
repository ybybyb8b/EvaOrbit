import {DirectoryItem} from "@/app/settings/settings-directory";
import {useCallback,useState} from "react";
import {AppearanceSettings} from "@/components/appearance-settings";
import {AiProvidersSettings} from "@/app/settings/ai-providers-settings";
import {LocalBackAction} from "./navigation-header";
import {Cpu} from "reicon-react";
import {DevelopmentDetails} from "@/components/development-details";
import {ErrorNotice} from "@/components/error-notice";
import {PageHeading} from "@/components/page-heading";
import {useLocale} from "@/components/locale-controller";
import {nativeCall} from "@/lib/native-bridge";
import {browserTrackerExport} from "./platform";
import type {LocalAccount,TrackerPlatform} from "./platform";

export function SettingsWorkspace({account,platform,onSignIn,onSignOut}:{account:LocalAccount;platform:TrackerPlatform;onSignIn:()=>void;onSignOut:()=>void}){
  const [ai,setAi]=useState(false);
  const request=useCallback((path:string,init?:RequestInit)=>platform.aiConfiguration(account,path,init),[platform,account]);
  const {english}=useLocale(),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  async function perform(action:()=>Promise<void>){if(busy)return;setBusy(true);setError("");try{await action();}catch(reason){setError(reason instanceof Error?reason.message:String(reason));}finally{setBusy(false);}}
  async function exportLocal(){
    if(platform.native){await nativeCall("trackers.exportState");return;}
    const state=await browserTrackerExport(account);
    const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:"application/json"}));
    const link=document.createElement("a");link.href=url;link.download="evaorbit-trackers-local.json";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  if(ai)return <div className="page local-settings"><LocalBackAction onBack={()=>setAi(false)}/><PageHeading eyebrow="" title={english?"AI & Connection":"AI 与连接"}/><AiProvidersSettings request={request} onlineOnly/></div>;
  return <div className="page local-settings"><PageHeading eyebrow="" title={english?"Settings":"设置"}/>
    {error&&<ErrorNotice>{error}</ErrorNotice>}
    <section className="editor-card"><h2>{english?"Account":"账户"}</h2><p className="user-content">{account.email}</p><div className="long-term-actions">
      <button className="button secondary" disabled={busy} onClick={onSignIn}>{english?"Connect account":"连接账户"}</button>
      <button className="text-button" disabled={busy} onClick={()=>void perform(async()=>{await platform.signOut();onSignOut();})}>{english?"Sign out":"退出账户"}</button>
    </div></section>
    <AppearanceSettings localOnly/>
    <section className="editor-card"><h2>Tracker</h2><button className="button secondary" onClick={()=>{localStorage.setItem("evaorbit.trackerMode",platform.readOnly(account)?"editing":"readonly");window.location.reload();}}>{english?platform.readOnly(account)?"Enable Tracker editing":"Pause Tracker editing":platform.readOnly(account)?"开启 Tracker 编辑":"暂停 Tracker 编辑"}</button></section>
    <nav className="settings-directory" aria-label="Connections"><DirectoryItem href="/settings/ai-connection" onClick={()=>setAi(true)} icon={Cpu} title={english?"AI & Connection":"AI 与连接"} meta={english?"Manage providers and models online":"在线管理服务商、密钥与模型"}/></nav>
    <DevelopmentDetails><button className="text-button" disabled={busy} onClick={()=>void perform(exportLocal)}>{english?"Export local Tracker records":"导出本地记录"}</button><p><a className="text-button" href="https://eva-orbit.vercel.app/trackers" target="_blank" rel="noreferrer">{english?"Open Web version":"打开网页版"}</a></p></DevelopmentDetails>
  </div>;
}
