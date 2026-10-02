import { eventKitSupported, getNativeHostInfo, nativeCall } from "./native-bridge.ts";
import { eventKitCalendarReadModes, synchronizeEventKit, type EventKitModes, type EventKitReminderRoutes, type EventKitSource, type EventKitStatus } from "./eventkit-sync.ts";

export const eventKitSourcesKey = "evaorbit.eventkit.sources.v1";
export const eventKitRoutesKey = "evaorbit.eventkit.routes.v1";
export const eventKitLastSyncKey = "evaorbit.eventkit.last-sync.v1";
export const eventKitConfigChanged = "evaorbit:eventkit-config-changed";
export const eventKitSyncFinished = "evaorbit:eventkit-sync-finished";

export function storedEventKitModes(): EventKitModes {
  try { return JSON.parse(localStorage.getItem(eventKitSourcesKey) ?? "{}") as EventKitModes; } catch { return {}; }
}
export function storedEventKitRoutes(modes?: EventKitModes, lists: EventKitSource[] = []): EventKitReminderRoutes {
  try {
    const saved = localStorage.getItem(eventKitRoutesKey);
    if (saved) return JSON.parse(saved) as EventKitReminderRoutes;
    const legacy = lists.find(source => modes?.[source.identifier] === "two_way")?.identifier;
    const routes = legacy ? { tasks: legacy } : {};
    localStorage.setItem(eventKitRoutesKey, JSON.stringify(routes));
    return routes;
  } catch { return {}; }
}

export async function syncConfiguredEventKit() {
  if (!eventKitSupported(await getNativeHostInfo())) return null;
  const status = await nativeCall<EventKitStatus>("eventkit.getStatus");
  const granted = (permission: string) => ["authorized", "full_access"].includes(permission);
  if (!granted(status.calendarPermission) && !granted(status.reminderPermission)) return null;
  const modes = eventKitCalendarReadModes(status.calendars, storedEventKitModes());
  const routes = storedEventKitRoutes(modes, status.reminderLists);
  if (!Object.values(modes).some(mode => mode !== "off") && !Object.values(routes).some(Boolean)) return null;
  // Never treat a revoked permission as an empty Apple store (and delete EO records).
  if (status.calendars.some(source => modes[source.identifier] !== "off" && modes[source.identifier]) && !granted(status.calendarPermission)) return null;
  if ((Object.values(routes).some(Boolean) || status.reminderLists.some(source => modes[source.identifier] !== "off" && modes[source.identifier])) && !granted(status.reminderPermission)) return null;
  const result = await synchronizeEventKit(status, modes, routes);
  localStorage.setItem(eventKitLastSyncKey, result.lastSync);
  window.dispatchEvent(new CustomEvent(eventKitSyncFinished, { detail: { result } }));
  return result;
}

/** Global foreground scheduler. Events during a run get one follow-up, not lost work. */
export function startEventKitAutoSync(sync: () => Promise<unknown>, win = window, doc = document) {
  let stopped = false, running = false, pending = false, timer: number | undefined;
  const run = async () => {
    timer = undefined;
    if (stopped || doc.visibilityState !== "visible" || win.navigator.onLine === false) return;
    if (running) { pending = true; return; }
    running = true;
    try { await sync(); }
    catch (error) { win.dispatchEvent(new CustomEvent(eventKitSyncFinished, { detail: { error: error instanceof Error ? error.message : "同步失败" } })); }
    finally { running = false; if (pending && !stopped) { pending = false; schedule(); } }
  };
  const schedule = () => {
    if (timer !== undefined) win.clearTimeout(timer);
    timer = win.setTimeout(() => { void run(); }, 1500);
  };
  const events = ["evaorbit:native-ready", "evaorbit:native-active", "evaorbit:eventkit-store-changed", eventKitConfigChanged, "online"];
  events.forEach(event => win.addEventListener(event, schedule));
  doc.addEventListener("visibilitychange", schedule);
  const interval = win.setInterval(() => { void run(); }, 60_000);
  schedule();
  return () => {
    stopped = true;
    if (timer !== undefined) win.clearTimeout(timer);
    win.clearInterval(interval);
    events.forEach(event => win.removeEventListener(event, schedule));
    doc.removeEventListener("visibilitychange", schedule);
  };
}
