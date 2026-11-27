"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import type { BusinessRequest } from "@/lib/business-request";
import type { TrackerEntry, TrackerField } from "@/lib/types";
import type { StackTracker } from "@/lib/home-tracker-stack";
import type { HomeLinkProps } from "../home-calendar-timeline";
import { responseError } from "@/lib/response-error";
import { homeCacheChanged } from "@/lib/home-cache";
import { useLocale } from "../locale-controller";
import { ErrorNotice } from "../error-notice";
import { EVAORBIT_TIME_ZONE, dateInEvaOrbit, dateRange } from "@/lib/time";
import styles from "../personal-widget-stack.module.css";

export type WidgetTracker = StackTracker & { href: string; icon?: string; image?: string };
export type WidgetTrackerDetail = { fields: TrackerField[]; entries: Pick<TrackerEntry, "occurredAt" | "values" | "note">[] };
export type TrackerWidgetAdapter = {
  list: () => Promise<WidgetTracker[]>;
  detail: (id: string) => Promise<WidgetTrackerDetail>;
  save: (id: string, input: Pick<TrackerEntry, "occurredAt" | "values" | "note">) => Promise<void>;
};
export type WidgetEnvironment = { request: BusinessRequest; trackers: TrackerWidgetAdapter; canCompleteCare: boolean; Link: ComponentType<HomeLinkProps> };
type WidgetContextValue = WidgetEnvironment & { json: <T>(path: string) => Promise<T>; refresh: () => void; revision: number; trackerList: () => Promise<WidgetTracker[]>; trackerDetail: TrackerWidgetAdapter["detail"] };
const Context = createContext<WidgetContextValue | null>(null);
export function WidgetProvider({ environment, children }: { environment: WidgetEnvironment; children: ReactNode }) {
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    let midnight: ReturnType<typeof setTimeout>;
    const schedule = () => { midnight=setTimeout(() => {visible();schedule();},Math.max(1,Date.parse(dateRange(dateInEvaOrbit()).to)-Date.now())); };
    schedule();
    window.addEventListener(homeCacheChanged, refresh); window.addEventListener("online", refresh); window.addEventListener("evaorbit:native-active", refresh); document.addEventListener("visibilitychange", visible);
    return () => { clearTimeout(midnight); window.removeEventListener(homeCacheChanged, refresh); window.removeEventListener("online", refresh); window.removeEventListener("evaorbit:native-active", refresh); document.removeEventListener("visibilitychange", visible); };
  }, [refresh]);
  const value = useMemo(() => {
    const pending = new Map<string, Promise<unknown>>();
    const cached = <T,>(key: string, load: () => Promise<T>): Promise<T> => {
      if (!pending.has(key)) pending.set(key, load().catch(error => { pending.delete(key); throw error; }));
      return pending.get(key) as Promise<T>;
    };
    return { ...environment, refresh, revision,
      json: <T,>(path: string) => cached<T>(path, async () => { const response = await environment.request(path, { cache: "no-store" }); if (!response.ok) throw new Error(await responseError(response, "Could not load widget. Please try again.")); return response.json() as Promise<T>; }),
      trackerList: () => cached("trackers", environment.trackers.list),
      trackerDetail: (id: string) => cached(`tracker:${id}`, () => environment.trackers.detail(id)),
    };
  }, [environment, refresh, revision]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useWidgetEnvironment() { const value = useContext(Context); if (!value) throw new Error("WidgetProvider required"); return value; }
export function useWidgetResource<T>(load: () => Promise<T>) {
  const [state, setState] = useState<{ data?: T; loading: boolean; error: string }>({ loading: true, error: "" });
  useEffect(() => { let alive = true; void load().then(data => { if(alive) setState({ data, loading: false, error: "" }); }).catch(reason => { if(alive) setState(current => ({ ...current, loading: false, error: reason instanceof Error ? reason.message : String(reason) })); }); return () => { alive = false; }; }, [load]);
  return state;
}
export function WidgetStatus({ loading, error, onRetry }: { loading?: boolean; error?: string; onRetry?: () => void }) {
  const { english } = useLocale(), { refresh } = useWidgetEnvironment();
  return error ? <div className={styles.status}><ErrorNotice inline>{error}</ErrorNotice><button type="button" className="text-button" onClick={onRetry ?? refresh}>{english ? "Retry" : "重试"}</button></div> : loading ? <p role="status">{english ? "Loading…" : "正在读取…"}</p> : null;
}
export function WidgetLink({ href, name }: { href: string; name: string }) {
  const { Link } = useWidgetEnvironment();
  return <Link href={href} className={styles.openLink}><span className="sr-only">{name}</span></Link>;
}
export function widgetDate(value: string, english: boolean, hasTime = true) {
  return new Intl.DateTimeFormat(english ? "en" : "zh-CN", { month: "short", day: "numeric", ...(hasTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const } : {}), timeZone: EVAORBIT_TIME_ZONE }).format(new Date(value.length === 10 ? `${value}T12:00:00+08:00` : value));
}
