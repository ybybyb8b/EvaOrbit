import type {EventKitSyncScope} from "./eventkit-sync.ts";

export type EventKitSyncProgress={scope:EventKitSyncScope;phase:"reading"|"recovering"|"reconciling"|"complete"|"failed";completed:number;total:number;recentPending?:number;historyPending?:number;discoveriesPending?:number};
let progress:EventKitSyncProgress|null=null;
const listeners=new Set<()=>void>();
export const getEventKitSyncProgress=()=>progress;
export function subscribeEventKitSyncProgress(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
export function reportEventKitSyncProgress(next:EventKitSyncProgress){progress=next;listeners.forEach(listener=>listener());}
export function eventKitSyncProgressText(value:EventKitSyncProgress){
 const label=value.scope==="calendar"?"Calendar":value.scope==="reminder"?"Reminders":"Calendar / Reminders";
 if(value.phase==="reading")return `${label} · Reading sources and saved links…`;
 if(value.phase==="recovering")return `${label} · Checking saved links ${value.completed} / ${value.total}`;
 if(value.phase==="reconciling")return `${label} · Comparing and syncing changes…`;
 if(value.phase==="complete"&&(value.recentPending||value.historyPending||value.discoveriesPending))return `${label} · ${value.recentPending?`${value.recentPending} recent links pending`:'Recent link checks complete'} · ${value.historyPending??0} historical links pending · ${value.discoveriesPending??0} new items pending. Continues while the App is open.`;
 return "";
}
