"use client";
import { useMemo } from "react";
import type { ComponentType } from "react";
import type { HomeLinkProps } from "./home-calendar-timeline";
import { PersonalWidgetStack } from "./personal-widget-stack";
import type { WidgetEnvironment, WidgetTrackerDetail } from "./widgets/widget-context";
import type { TrackerSummary } from "@/lib/types";
import { responseError } from "@/lib/response-error";
import { reconcileNativeNotifications } from "@/lib/native-bridge";
import { showActionToast } from "./action-toast";
import { useLocale } from "./locale-controller";
const PlainLink = (props:HomeLinkProps) => <a {...props}/>;
async function read<T>(path:string):Promise<T> {
  const response=await fetch(path,{cache:"no-store"});
  if(!response.ok)throw new Error(await responseError(response,"Could not load widget. Please try again."));
  return response.json() as Promise<T>;
}
export function PersonalWidgetStackWeb({ cacheScope, LinkComponent=PlainLink }: { cacheScope:string; LinkComponent?:ComponentType<HomeLinkProps> }) {
  const { english } = useLocale();
  const environment=useMemo<WidgetEnvironment>(() => ({
    request:(path,init) => fetch(path,init), Link:LinkComponent, canCompleteCare:true,
    trackers:{
      list:async () => (await read<TrackerSummary[]>("/api/trackers")).filter(item => !item.archivedAt).map(item => ({id:String(item.id),name:item.name,icon:item.icon,image:item.iconType === "image" ? `/api/trackers/${item.id}/icon?v=${encodeURIComponent(item.updatedAt)}` : undefined,lastOccurredAt:item.stats.lastOccurredAt,href:`/trackers/${item.id}`})),
      detail:id => read<WidgetTrackerDetail>(`/api/trackers/${id}`),
      save:async (id,input) => {
        const response=await fetch(`/api/trackers/${id}/entries`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)});
        if(!response.ok)throw new Error(await responseError(response,english ? "Could not save record. Please retry." : "记录保存失败，请重试。"));
        try {await reconcileNativeNotifications();}catch{/* Existing Web Push fallback remains active. */}
        showActionToast(english ? "Record saved" : "记录已保存");
      },
    },
  }),[LinkComponent,english]);
  return <PersonalWidgetStack cacheScope={cacheScope} environment={environment}/>;
}
