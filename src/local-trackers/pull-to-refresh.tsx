import {useCallback} from "react";
import {PullToRefreshView} from "@/components/pull-to-refresh-core";
import {invalidateClientData} from "@/lib/client-data-cache";
import {clearClientJsonCache} from "@/lib/client-json-cache";
import {dataDependencies} from "@/lib/cache-policy";
import {refreshLocalPage} from "./refresh";

export function LocalPullToRefresh({pathname}:{pathname:string}){
 const refresh=useCallback(async()=>{
  clearClientJsonCache();
  invalidateClientData(dataDependencies(pathname));
  await refreshLocalPage();
 },[pathname]);
 return <PullToRefreshView enabled={!pathname.startsWith("/settings")} pathname={pathname} onRefresh={refresh}/>;
}
