import {useEffect,useState} from "react";
import {getNativeHostInfo,hostSupports,nativeCall} from "@/lib/native-bridge";
import {useLocale} from "@/components/locale-controller";
import {ErrorNotice} from "@/components/error-notice";
import type {LocalAccount} from "./platform";

export function NativeIntegrationAccess({account,path}:{account:LocalAccount;path:"/settings/health-native"|"/settings/apple-integration"|"/settings/notifications"}){
 const {english}=useLocale(),[available,setAvailable]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{let alive=true;void getNativeHostInfo().then(info=>{if(alive)setAvailable(hostSupports(info,"navigation.openNativeSettings"));});return()=>{alive=false;};},[]);
 async function open(){if(busy)return;setBusy(true);setError("");try{await nativeCall("navigation.openNativeSettings",{accountId:account.accountId,path});}catch(reason){setError(reason instanceof Error?reason.message:String(reason));}finally{setBusy(false);}}
 return <section className="provider-card"><h2>{english?"Native connection":"原生连接"}</h2><p>{english?"Manage the existing Apple Health, Calendar, Reminders and notification settings inside this app. Requires an explicitly enabled primary account; test accounts remain read-only.":"在 App 内管理现有健康、日历、提醒事项与通知设置。需要已启用的主账号，测试账号保持只读。"}</p><button type="button" className="button secondary" disabled={!available||busy} onClick={()=>void open()}>{english?available?"Manage on this iPhone":"Update app to manage":available?"在此 iPhone 上管理":"更新 App 后管理"}</button>{error&&<ErrorNotice inline>{error}</ErrorNotice>}</section>;
}
