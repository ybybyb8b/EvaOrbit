"use client";
import {useState,type ReactNode} from "react";
import {useLocale} from "./locale-controller";
import {ErrorNotice} from "./error-notice";

export function AccountSettings({email,onSwitch,onSignOut,actions}:{email:string;onSwitch?:()=>void;onSignOut?:()=>Promise<void>;actions?:ReactNode}){
 const {english}=useLocale(),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function signOut(){setBusy(true);setError("");try{await onSignOut?.();}catch(reason){setError(reason instanceof Error?reason.message:String(reason));}finally{setBusy(false);}}
 return <section className="provider-card account-settings"><h2>{english?"Account":"账户"}</h2><p className="user-content">{email}</p><div className="long-term-actions">{actions??<>{onSwitch?<button type="button" className="button secondary" disabled={busy} onClick={onSwitch}>{english?"Switch account":"切换账户"}</button>:null}{onSignOut&&<button type="button" className="text-button" disabled={busy} onClick={()=>void signOut()}>{english?"Sign out":"退出账户"}</button>}</>}</div>{error&&<ErrorNotice inline>{error}</ErrorNotice>}</section>;
}
