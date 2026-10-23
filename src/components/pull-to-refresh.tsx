"use client";
import {useCallback} from "react";
import {usePathname,useRouter} from "next/navigation";
import {PullToRefreshView} from "./pull-to-refresh-core";
import {invalidateClientData} from "@/lib/client-data-cache";
import {dataDependencies} from "@/lib/cache-policy";

export function PullToRefresh({enabled}:{enabled:boolean}){
 const pathname=usePathname(),router=useRouter();
 const refresh=useCallback(()=>{invalidateClientData(dataDependencies(pathname));router.refresh();},[pathname,router]);
 return <PullToRefreshView enabled={enabled} pathname={pathname} onRefresh={refresh}/>;
}
