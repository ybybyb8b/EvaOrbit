import { getNativeHostInfo, hostSupports, nativeCall } from "./native-bridge.ts";

export const dataChangedEvent = "eo:data-changed";
export type DataDomain = "calendar" | "tasks" | "reminders" | "health";
export type DataChangedDetail = { domains: DataDomain[]; source: "eventkit" | "healthkit" };
const domains = new Set<DataDomain>(["calendar", "tasks", "reminders", "health"]);

export function dataChangedDomains(detail: unknown): DataDomain[] {
  if (!detail || typeof detail !== "object" || !("domains" in detail) || !Array.isArray(detail.domains)) return [];
  return [...new Set(detail.domains.filter((value): value is DataDomain => domains.has(value)))];
}

/** Completion only: this event is never a sync trigger. Old Hosts dispatch locally. */
export async function notifyDataChanged(changed: DataDomain[], source: DataChangedDetail["source"]) {
  const detail = { domains: dataChangedDomains({ domains: changed }), source };
  if (!detail.domains.length || typeof window === "undefined") return;
  if (hostSupports(await getNativeHostInfo(), "host.notifyDataChanged")) {
    try { await nativeCall("host.notifyDataChanged", detail); return; }
    catch { /* A failed notification must not undo committed EO changes. */ }
  }
  window.dispatchEvent(new CustomEvent(dataChangedEvent, { detail }));
}

export function subscribeDataChanged(affected: DataDomain[], refresh: () => void, win = window) {
  let timer: number | undefined;
  const listener = (event: Event) => {
    if (!dataChangedDomains((event as CustomEvent).detail).some(domain => affected.includes(domain))) return;
    if (timer !== undefined) win.clearTimeout(timer);
    timer = win.setTimeout(() => { timer = undefined; refresh(); }, 50);
  };
  win.addEventListener(dataChangedEvent, listener);
  return () => { win.removeEventListener(dataChangedEvent, listener); if (timer !== undefined) win.clearTimeout(timer); };
}
