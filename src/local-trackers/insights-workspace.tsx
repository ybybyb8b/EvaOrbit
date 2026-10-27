import {useEffect,useState} from "react";
import {InsightsView} from "@/app/insights/insights-view";
import {LocalRouteLink,useLocalInitialPath} from "./routes";
import {registerLocalRefresh} from "./refresh";
import {onlineBusinessChanged,useOnlineBusiness} from "./online-business";

function registerRefresh(refresh:()=>Promise<unknown>){
 const stop=registerLocalRefresh(refresh),active=()=>{if(navigator.onLine)void refresh().catch(()=>undefined);};
 const events=["online","evaorbit:native-active",onlineBusinessChanged];
 events.forEach(event=>window.addEventListener(event,active));
 return()=>{stop();events.forEach(event=>window.removeEventListener(event,active));};
}
export function InsightsWorkspace(){
 const enabled=useOnlineBusiness(),path=useLocalInitialPath("/insights"),[online,setOnline]=useState(navigator.onLine);
 useEffect(()=>{const update=()=>setOnline(navigator.onLine);window.addEventListener("online",update);window.addEventListener("offline",update);return()=>{window.removeEventListener("online",update);window.removeEventListener("offline",update);};},[]);
 if(!enabled||!online)return <div className="page"><h1>洞察</h1><p>{!enabled?"请连接账户后查看日报。":"洞察需要联网检查最新记录，请恢复网络后查看。"}</p></div>;
 return <InsightsView LinkComponent={LocalRouteLink} initialSearch={new URL(path,"https://local.invalid").search} registerRefresh={registerRefresh}/>;
}
