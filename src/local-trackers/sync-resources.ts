import {dateInEvaOrbit} from "../lib/time.ts";
import type {SyncModuleId,ModuleSyncStatus} from "../lib/sync-modules.ts";
import type {LocalAccount,TrackerPlatform} from "./platform";

export async function readModuleSyncStatus(platform:TrackerPlatform,account:LocalAccount,id:SyncModuleId,refresh=false):Promise<ModuleSyncStatus>{
 if(id==="trackers")throw new Error("Tracker uses its versioned replica");
 const value=id==="home"?refresh?(await Promise.all([platform.homeResource(account,"day",dateInEvaOrbit(),true),platform.homeResource(account,"month",dateInEvaOrbit().slice(0,7),true),platform.homeResource(account,"due","current",true)]))[0]:await platform.homeResource(account,"day","latest"):id==="food"?await platform.foodSnapshot(account,refresh):id==="health"?await platform.healthSnapshot(account,refresh):id==="cats"?await platform.catsSnapshot(account,refresh):id==="subscriptions"?await platform.subscriptionsSnapshot(account,refresh):id==="relations"?await platform.relationsSnapshot(account,refresh):id==="media"?await platform.mediaSnapshot(account,refresh):id==="memo"?await platform.memoSnapshot(account,refresh):id==="chronicle"?await platform.chronicleSnapshot(account,refresh):id==="inbox"?await platform.inboxSnapshot(account,refresh):await platform.workspaceSnapshot(account,id,refresh);
 return {capturedAt:value?.capturedAt,complete:value&&"complete" in value?Boolean(value.complete):value&&"data" in value&&value.data&&"complete" in value.data?Boolean(value.data.complete):undefined};
}
