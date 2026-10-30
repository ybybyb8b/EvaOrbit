import {registerLocalRefresh} from "./refresh";
import {LocalRouteLink} from "./routes";
import {useOnlineBusiness,onlineBusinessChanged} from "./online-business";
import {BottomLogScope} from "@/components/bottom-log-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HomeCalendarTimeline, type HomeTimelineProps } from "@/components/home-calendar-timeline";
import { HomePageView } from "@/components/home-page-view";
import { DueRemindersView } from "@/components/due-reminders-view";
import { ReiconAssetContext } from "@/components/reicon-symbol";
import { ErrorNotice } from "@/components/error-notice";
import { LocalHomeLoading } from "./home-loading";
import {LocalDownloadStatus} from "./download-status";
import { useLocale } from "@/components/locale-controller";
import type { HomeDayOverview } from "@/lib/home-day";
import type { TimelineMonthSummary, DueReminder } from "@/lib/types";
import type { HomeReadonlyResource, HomeResourceKind } from "@/lib/home-readonly";
import { dateInEvaOrbit, shiftDate } from "@/lib/time";
import { type LocalAccount, type TrackerPlatform } from "./platform";

type Initial = {day:HomeReadonlyResource;month:HomeReadonlyResource;due:HomeReadonlyResource|null};
export function HomeWorkspace({account,platform}:{account:LocalAccount;platform:TrackerPlatform}) {
  const {english,language}=useLocale();
  const onlineBusiness=useOnlineBusiness();
  const [initial,setInitial]=useState<Initial|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true);
  const [assets,setAssets]=useState<Record<string,string>>({});
  const active=useRef(new Map<string,Promise<HomeReadonlyResource|null>>());
  const resources=useCallback((kind:HomeResourceKind,key:string,refresh=false)=>{
    const token=`${account.accountId}:${kind}:${key}:${refresh}`;
    const pending=active.current.get(token);
    if(pending)return pending;
    const request=platform.homeResource(account,kind,key,refresh).then(async value=>{
      let rulesSavedAt=0;
      try { rulesSavedAt=Number(localStorage.getItem(`eo:timeline-association-saved:${account.accountId}`))||0; } catch { /* Snapshot transport owns fallback. */ }
      if(!refresh&&value&&navigator.onLine&&Date.parse(value.capturedAt)<rulesSavedAt)value=await platform.homeResource(account,kind,key,true);
      if(value?.icons)setAssets(current=>Object.entries(value.icons!).every(([name,url])=>current[name]===url)?current:{...current,...value.icons});return value;
    }).finally(()=>active.current.delete(token));
    active.current.set(token,request);return request;
  },[account,platform]);
  const dataSource=useMemo<HomeTimelineProps["dataSource"]>(()=>({
    async read<T>(_scope:string,url:string,signal:AbortSignal,onCached:(data:T)=>void,force=false):Promise<T>{
      const day=/^\/api\/home-day\?date=(\d{4}-\d{2}-\d{2})$/.exec(url),month=/^\/api\/timeline\?month=(\d{4}-\d{2})$/.exec(url);
      if(!day&&!month)throw new Error("Home request refused");
      const kind=day?"day":"month",key=(day??month)![1];
      const cached=await resources(kind,key);signal.throwIfAborted();
      if(cached){onCached(cached.data as T);if(!navigator.onLine||!force&&Date.now()-Date.parse(cached.capturedAt)<60_000)return cached.data as T;}
      const fresh=await resources(kind,key,true);signal.throwIfAborted();
      if(!fresh)throw new Error("This date has not been downloaded. Connect to load it.");
      return fresh.data as T;
    },
    async save(){ /* Native/browser account-scoped transport owns persistence. */ },
  }),[resources]);
  useEffect(()=>{
    let alive=true,running=false;
    const run=async()=>{
      if(running)return;
      running=true;
      setLoading(true);
      const today=dateInEvaOrbit();
      try{
        const cachedDay=await resources("day",today)??await resources("day","latest");
        if(cachedDay){const [month,due]=await Promise.all([resources("month",cachedDay.key.slice(0,7)),resources("due","current")]);if(month&&alive)setInitial({day:cachedDay,month,due});}
        const day=await resources("day",today,true);
        if(!day)throw new Error("No Home snapshot has been downloaded yet.");
        const [month,due]=await Promise.all([resources("month",today.slice(0,7),true),resources("due","current",true)]);
        if(!month)throw new Error("Home month snapshot is not available.");
        if(!alive)return;
        setInitial({day,month,due});setError("");
        // Bounded prefetch; navigation also caches dates explicitly opened by the user.
        for(let offset=1;offset<=6&&alive;offset++){
          const date=shiftDate(today,-offset);
          const previous=await resources("day",date);
          if(!previous||Date.now()-Date.parse(previous.capturedAt)>15*60_000)await Promise.allSettled([resources("day",date,true),date.slice(0,7)!==today.slice(0,7)?resources("month",date.slice(0,7),true):Promise.resolve()]);
        }
      }catch(reason){if(alive)setError(reason instanceof TypeError?(english?"Offline or unable to reach the cloud. Downloaded Home snapshots are preserved.":"离线或暂时无法读取云端，已下载的首页快照已保留。"):reason instanceof Error?reason.message:"Could not refresh Home. Cached data is preserved.");}
      finally{running=false;if(alive)setLoading(false);}
    };
    const stopPullRefresh=registerLocalRefresh(run);
    void run();
    const refresh=()=>{if(document.visibilityState!=="hidden")void run();};
    window.addEventListener(onlineBusinessChanged,refresh);window.addEventListener("online",refresh);window.addEventListener("evaorbit:native-active",refresh);
    return()=>{stopPullRefresh();alive=false;window.removeEventListener(onlineBusinessChanged,refresh);window.removeEventListener("online",refresh);window.removeEventListener("evaorbit:native-active",refresh);};
  },[resources,english]);
  return <div className="local-home" data-no-translate="true" data-local-launch-ready={initial||error?"true":undefined}>
    <div className="page local-home-status">
    <LocalDownloadStatus module="Home" capturedAt={initial?.day.capturedAt} busy={loading} error={error} refresh={()=>window.dispatchEvent(new Event("online"))}/>
    {error&&<ErrorNotice>{error}</ErrorNotice>}
    </div>
    {initial?<ReiconAssetContext.Provider value={assets}><HomePageView language={language} due={initial.due?<DueRemindersView readOnly={!onlineBusiness} compact LinkComponent={LocalRouteLink} items={initial.due.data as DueReminder[]}/>:<p>{english?"Reminder snapshot has not been downloaded.":"尚未下载提醒快照。"}</p>}><HomeCalendarTimeline key={account.accountId+":"+initial.day.key} dueItems={initial.due?.data as DueReminder[]|undefined} initialDay={initial.day.data as HomeDayOverview} initialSummary={initial.month.data as TimelineMonthSummary} cacheScope={account.accountId} language={language} readOnly={!onlineBusiness} LogScope={BottomLogScope} LinkComponent={LocalRouteLink} dataSource={dataSource}/></HomePageView></ReiconAssetContext.Provider>:loading?<LocalHomeLoading/>:<div className="empty-state"><h2>{english?"Home is not downloaded yet":"尚未下载首页"}</h2><p>{english?"Connect to download Home for offline access.":"联网下载首页后即可离线查看。"}</p></div>}
  </div>;
}
