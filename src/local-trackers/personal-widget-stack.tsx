import { useCallback, useMemo, useSyncExternalStore } from "react";
import { PersonalWidgetStack } from "@/components/personal-widget-stack";
import type { WidgetEnvironment } from "@/components/widgets/widget-context";
import type { BusinessRequest } from "@/lib/business-request";
import { readCatsSnapshot } from "@/lib/cats-readonly";
import { readHealthSnapshot } from "@/lib/health-readonly";
import { canEditTrackerRecord } from "@/lib/tracker-replica";
import { showActionToast } from "@/components/action-toast";
import { useLocale } from "@/components/locale-controller";
import { asField, belongs } from "./tracker-records";
import { trackerSession, saveLocalTrackerEntry, synchronizeTrackerSession } from "./tracker-session";
import { LocalRouteLink } from "./routes";
import { useOnlineBusiness, useOnlineReader } from "./online-business";
import { isPreviewAccount, type LocalAccount, type TrackerPlatform } from "./platform";

export function LocalPersonalWidgetStack({ account, platform }: { account:LocalAccount; platform:TrackerPlatform }) {
  const { english }=useLocale(), online=useOnlineBusiness();
  const store=useMemo(() => trackerSession(account,platform),[account,platform]);
  const state=useSyncExternalStore(store.subscribe,store.getSnapshot);
  const fallback=useCallback<BusinessRequest>(async (path,init) => {
    if((init?.method ?? "GET").toUpperCase() !== "GET")throw new Error("Connect and sign in to complete care.");
    if(path === "/api/cats") {const snapshot=await platform.catsSnapshot(account);if(snapshot)return readCatsSnapshot(snapshot,path,init);}
    if(path.startsWith("/api/health/training")) {const snapshot=await platform.healthSnapshot(account);if(snapshot)return readHealthSnapshot(snapshot,path,init);}
    if(path === "/api/important-dates")return platform.businessRequest(account,path,{...init,cacheOnly:true});
    throw new Error(english ? "Connect and open this module to download its data first." : "请先联网打开对应模块，下载数据后再查看组件。");
  },[account,platform,english]);
  const request=useOnlineReader(fallback);
  const environment=useMemo<WidgetEnvironment>(() => ({request,Link:LocalRouteLink,canCompleteCare:online,
    trackers:{
      list:async () => {
        await store.initialize();const current=store.getSnapshot(),hidden=new Set(current.outbox.filter(item => item.operation === "delete").map(item => item.localId));
        return current.records.filter(row => row.resourceType === "tracker" && !row.payload.archivedAt && !hidden.has(row.id)).map(row => ({id:row.id,name:String(row.payload.name),icon:String(row.payload.icon ?? ""),image:row.payload.iconType === "image" && row.serverId ? current.readOnly?.images[String(row.serverId)]?.dataUrl : undefined,disabled:platform.readOnly(account) || !canEditTrackerRecord(row),href:row.serverId ? `/trackers/${row.serverId}` : `/trackers?local=${encodeURIComponent(row.id)}`,lastOccurredAt:current.records.filter(entry => entry.resourceType === "tracker_entry" && belongs(entry,row) && !hidden.has(entry.id)).map(entry => String(entry.payload.occurredAt)).sort().at(-1) ?? null}));
      },
      detail:async id => {
        await store.initialize();const current=store.getSnapshot(),row=current.records.find(row => row.resourceType === "tracker" && row.id === id),hidden=new Set(current.outbox.filter(item => item.operation === "delete").map(item => item.localId));
        if(!row || row.payload.archivedAt || hidden.has(id))throw new Error(english ? "Tracker unavailable" : "观测不可用");
        return {fields:current.records.filter(field => field.resourceType === "tracker_field" && belongs(field,row) && !hidden.has(field.id)).map(asField).sort((a,b) => a.sortOrder-b.sortOrder),entries:current.records.filter(entry => entry.resourceType === "tracker_entry" && belongs(entry,row) && !hidden.has(entry.id)).map(entry => ({occurredAt:String(entry.payload.occurredAt),values:entry.payload.values as Record<string,unknown> ?? {},note:String(entry.payload.note ?? "")}))};
      },
      save:async (id,input) => {
        const row=store.getSnapshot().records.find(item => item.resourceType === "tracker" && item.id === id);
        if(!row || platform.readOnly(account) || !canEditTrackerRecord(row))throw new Error(english ? "This Tracker is read-only" : "此观测暂时只读");
        await saveLocalTrackerEntry(store,row,input);showActionToast(english ? "Saved on this device." : "已保存到本机");
        if(!isPreviewAccount(account))void synchronizeTrackerSession(account,platform).catch(() => {});
      },
    },
  // Store revisions refresh every mounted instance, including Universal Log writes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }),[account,platform,store,state.revision,request,online,english]);
  return <PersonalWidgetStack cacheScope={account.accountId} environment={environment}/>;
}
