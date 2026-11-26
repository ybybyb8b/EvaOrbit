import { useContext, useEffect, useMemo } from "react";
import { DaysView } from "@/app/days/days-view";
import { BusinessRequestContext } from "@/components/business-request-context";
import { registerLocalRefresh } from "./refresh";
import type { LocalAccount, TrackerPlatform } from "./platform";

export function DaysWorkspace({ account, platform }: { account: LocalAccount; platform: TrackerPlatform }) {
  const online = useContext(BusinessRequestContext);
  const request = useMemo(() => online ?? ((path: string, init?: RequestInit) => {
    if ((init?.method ?? "GET") !== "GET") throw new Error("Connect and sign in to save this date.");
    return platform.businessRequest(account, path, { ...init, cacheOnly: true });
  }), [online, platform, account]);
  useEffect(() => registerLocalRefresh(async () => { window.dispatchEvent(new Event("eo:days-refresh")); }), []);
  return <BusinessRequestContext.Provider value={request}><DaysView local /></BusinessRequestContext.Provider>;
}
