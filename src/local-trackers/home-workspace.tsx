import {useOnlineBusiness,onlineBusinessChanged} from "./online-business";
import {BottomLogScope} from "@/components/bottom-log-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HomeCalendarTimeline, type HomeTimelineProps, type HomeLinkProps } from "@/components/home-calendar-timeline";
import { HomePageView } from "@/components/home-page-view";
import { DueRemindersView } from "@/components/due-reminders-view";
import { ReiconAssetContext } from "@/components/reicon-symbol";
import { ErrorNotice } from "@/components/error-notice";
import { PageLoading } from "@/components/page-loading";
import {DevelopmentDetails} from "@/components/development-details";
import { useLocale } from "@/components/locale-controller";
import type { HomeDayOverview } from "@/lib/home-day";
import type { TimelineMonthSummary, DueReminder } from "@/lib/types";
import type { HomeReadonlyResource, HomeResourceKind } from "@/lib/home-readonly";
import { dateInEvaOrbit, shiftDate } from "@/lib/time";
import { isPreviewAccount, type LocalAccount, type TrackerPlatform } from "./platform";

type Initial = {day:HomeReadonlyResource;month:HomeReadonlyResource;due:HomeReadonlyResource|null};
function ReadOnlyHomeLink(props:HomeLinkProps) { return <a {...props} aria-disabled="true" tabIndex={-1} onClick={event=>event.preventDefault()}/>; }
export function HomeWorkspace({account,platform}:{account:LocalAccount;platform:TrackerPlatform}) {
  const {english,language}=useLocale();
  const onlineBusiness=useOnlineBusiness();
  const [initial,setInitial]=useState<Initial|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(false);
  const [assets,setAssets]=useState<Record<string,string>>({});
  const active=useRef(new Map<string,Promise<HomeReadonlyResource|null>>());
  const resources=useCallback((kind:HomeResourceKind,key:string,refresh=false)=>{
    const token=`${account.accountId}:${kind}:${key}:${refresh}`;
    const pending=active.current.get(token);
    if(pending)return pending;
    const request=platform.homeResource(account,kind,key,refresh).then(value=>{if(value?.icons)setAssets(current=>Object.entries(value.icons!).every(([name,url])=>current[name]===url)?current:{...current,...value.icons});return value;}).finally(()=>active.current.delete(token));
    active.current.set(token,request);return request;
  },[account,platform]);
  const dataSource=useMemo<HomeTimelineProps["dataSource"]>(()=>({
    async read<T>(_scope:string,url:string,signal:AbortSignal,onCached:(data:T)=>void,force=false):Promise<T>{
      const day=/^\/api\/home-day\?date=(\d{4}-\d{2}-\d{2})$/.exec(url),month=/^\/api\/timeline\?month=(\d{4}-\d{2})$/.exec(url);
      if(!day&&!month)throw new Error("Home request refused");
      const kind=day?"day":"month",key=(day??month)![1];
      const cached=await resources(kind,key);signal.throwIfAborted();
      if(cached){onCached(cached.data as T);if(!force)return cached.data as T;}
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
          await Promise.allSettled([resources("day",date,true),date.slice(0,7)!==today.slice(0,7)?resources("month",date.slice(0,7),true):Promise.resolve()]);
        }
      }catch(reason){if(alive)setError(reason instanceof TypeError?(english?"Offline or unable to reach the cloud. Downloaded Home snapshots are preserved.":"离线或暂时无法读取云端，已下载的首页快照已保留。"):reason instanceof Error?reason.message:"Could not refresh Home. Cached data is preserved.");}
      finally{running=false;if(alive)setLoading(false);}
    };
    void run();
    const refresh=()=>{if(document.visibilityState!=="hidden")void run();};
    window.addEventListener(onlineBusinessChanged,refresh);window.addEventListener("online",refresh);window.addEventListener("evaorbit:native-active",refresh);
    return()=>{alive=false;window.removeEventListener(onlineBusinessChanged,refresh);window.removeEventListener("online",refresh);window.removeEventListener("evaorbit:native-active",refresh);};
  },[resources,english]);
  return <div className="local-home" data-no-translate="true">
    <div className="page local-home-status">
    <DevelopmentDetails>
    <div className="local-sync-status" role="status"><span>{isPreviewAccount(account)&&!platform.native?(english?"Home · Synthetic local preview":"Home · 本机示例预览"):(english?"Home · Downloaded offline snapshots":"Home · 只读离线快照")}{initial?" · "+new Date(initial.day.capturedAt).toLocaleString(language):""}</span>{loading&&<span>{english?"Refreshing…":"正在刷新…"}</span>}</div>
    <p className="tracker-settings-help">{english?"Recent and previously opened dates are available offline. Saving requires a connection. Offline changes are not queued.":"最近及已打开的日期下载后可离线查看。联网可保存，离线改动不进入上传队列。"}</p>
    </DevelopmentDetails>
    {error&&<ErrorNotice>{error}</ErrorNotice>}
    </div>
    {initial?<ReiconAssetContext.Provider value={assets}><HomePageView language={language} due={initial.due?<DueRemindersView readOnly={!onlineBusiness} compact LinkComponent={ReadOnlyHomeLink} items={initial.due.data as DueReminder[]}/>:<p>{english?"Reminder snapshot has not been downloaded.":"尚未下载提醒快照。"}</p>}><HomeCalendarTimeline key={account.accountId+":"+initial.day.key} initialDay={initial.day.data as HomeDayOverview} initialSummary={initial.month.data as TimelineMonthSummary} cacheScope={account.accountId} language={language} readOnly={!onlineBusiness} LogScope={BottomLogScope} LinkComponent={ReadOnlyHomeLink} dataSource={dataSource}/></HomePageView></ReiconAssetContext.Provider>:loading?<PageLoading/>:<div className="empty-state"><h2>{english?"Home is not downloaded yet":"尚未下载首页"}</h2><p>{english?"Connect after the read-only API is available. No empty account data has been inferred.":"只读接口可用后联网下载；当前状态不表示账户没有记录。"}</p></div>}
  </div>;
}
