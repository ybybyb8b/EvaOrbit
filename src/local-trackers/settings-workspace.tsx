import {useState} from "react";
import {AppearanceSettings} from "@/components/appearance-settings";
import {DevelopmentDetails} from "@/components/development-details";
import {ErrorNotice} from "@/components/error-notice";
import {PageHeading} from "@/components/page-heading";
import {useLocale} from "@/components/locale-controller";
import {nativeCall} from "@/lib/native-bridge";
import {LocalTrackerStore} from "@/lib/tracker-local-store";
import type {LocalAccount,TrackerPlatform} from "./platform";

export function SettingsWorkspace({account,platform,onSignIn,onSignOut}:{account:LocalAccount;platform:TrackerPlatform;onSignIn:()=>void;onSignOut:()=>void}){
  const {english}=useLocale(),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  async function perform(action:()=>Promise<void>){if(busy)return;setBusy(true);setError("");try{await action();}catch(reason){setError(reason instanceof Error?reason.message:String(reason));}finally{setBusy(false);}}
  async function exportLocal(){
    if(platform.native){await nativeCall("trackers.exportState");return;}
    const store=new LocalTrackerStore(account.accountId,platform.storage(account));await store.initialize();
    const url=URL.createObjectURL(new Blob([JSON.stringify(store.getSnapshot(),null,2)],{type:"application/json"}));
    const link=document.createElement("a");link.href=url;link.download="evaorbit-trackers-local.json";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <div className="page local-settings"><PageHeading eyebrow="" title={english?"Settings":"设置"}/>
    {error&&<ErrorNotice>{error}</ErrorNotice>}
    <section className="editor-card"><h2>{english?"Account":"账户"}</h2><p className="user-content">{account.email}</p><div className="long-term-actions">
      <button className="button secondary" disabled={busy} onClick={onSignIn}>{english?"Connect account":"连接账户"}</button>
      <button className="text-button" disabled={busy} onClick={()=>void perform(async()=>{await platform.signOut();onSignOut();})}>{english?"Sign out":"退出账户"}</button>
    </div></section>
    <AppearanceSettings localOnly/>
    <DevelopmentDetails><button className="text-button" disabled={busy} onClick={()=>void perform(exportLocal)}>{english?"Export local Tracker records":"导出本地记录"}</button><p><a className="text-button" href="https://eva-orbit.vercel.app/trackers" target="_blank" rel="noreferrer">{english?"Open Web version":"打开网页版"}</a></p></DevelopmentDetails>
  </div>;
}
