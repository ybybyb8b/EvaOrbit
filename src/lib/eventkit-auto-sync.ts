import { eventKitSupported, getNativeHostInfo, nativeCall } from "./native-bridge.ts";
import { eventKitCalendarReadModes, synchronizeEventKit, type EventKitModes, type EventKitReminderRoutes, type EventKitSource, type EventKitStatus } from "./eventkit-sync.ts";
import { captureEventKitPreferences, parseEventKitPreferences, resolveEventKitPreferences, type EventKitPreferences } from "./eventkit-preferences.ts";

export const eventKitSourcesKey = "evaorbit.eventkit.sources.v1";
export const eventKitRoutesKey = "evaorbit.eventkit.routes.v1";
export const eventKitLastSyncKey = "evaorbit.eventkit.last-sync.v1";
export const eventKitConfigChanged = "evaorbit:eventkit-config-changed";
export const eventKitSyncFinished = "evaorbit:eventkit-sync-finished";
const accountKey = "evaorbit.eventkit.account.v1";
let preferenceWrites: Promise<unknown> = Promise.resolve();
let preferenceLoad: Promise<ReturnType<typeof resolveEventKitPreferences>> | null = null;
let preferenceNotice = "";
export function eventKitPreferenceNotice() { return preferenceNotice; }
type AccountPreferences = { available: boolean; userId?: string; revision?: number; preferences?: EventKitPreferences | null };
async function preferenceRequest(init?: RequestInit): Promise<AccountPreferences> {
  const response = await fetch("/api/preferences/eventkit", { cache: "no-store", ...init });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "账户同步偏好读取或保存失败");
  if (typeof result.available !== "boolean") throw new Error("账户同步偏好响应不正确");
  return result;
}
function cacheResolved(preferences: EventKitPreferences, status: EventKitStatus) {
  const resolved = resolveEventKitPreferences(preferences, status);
  localStorage.setItem(eventKitSourcesKey, JSON.stringify(resolved.modes));
  localStorage.setItem(eventKitRoutesKey, JSON.stringify(resolved.routes));
  preferenceNotice = resolved.unresolved ? `账户偏好已恢复；${resolved.unresolved} 个来源暂不可用或无法唯一匹配，相关同步暂停，原偏好仍保留。` : "同步偏好已保存到 EO 账户，重装后登录可自动恢复。";
  return resolved;
}
async function readAccountPreferences(status: EventKitStatus) {
  const account = await preferenceRequest();
  if (!account.available) {
    preferenceNotice = "本地模式：同步偏好仅保存在当前设备。";
    const modes = eventKitCalendarReadModes(status.calendars, storedEventKitModes());
    return { modes, routes: storedEventKitRoutes(modes, status.reminderLists), unresolved: 0 };
  }
  if (!account.userId || !Number.isSafeInteger(account.revision)) throw new Error("账户同步偏好响应不正确");
  const oldAccount = localStorage.getItem(accountKey);
  if (oldAccount && oldAccount !== account.userId) {
    localStorage.setItem(eventKitSourcesKey, "{}"); localStorage.setItem(eventKitRoutesKey, "{}");
  }
  localStorage.setItem(accountKey, account.userId);
  if (account.preferences) return cacheResolved(parseEventKitPreferences(account.preferences), status);
  const modes = eventKitCalendarReadModes(status.calendars, storedEventKitModes()), routes = storedEventKitRoutes(modes, status.reminderLists);
  // First upgrade uploads the existing local choices once; a fresh install never overwrites an account backup with empty choices.
  if (Object.keys(modes).length || Object.keys(routes).length) {
    const preferences = captureEventKitPreferences(status, modes, routes);
    if (preferences.sources.length) {
      const saved = await preferenceRequest({ method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preferences, revision: account.revision }) });
      return cacheResolved(parseEventKitPreferences(saved.preferences), status);
    }
  }
  preferenceNotice = "选择同步来源后会保存到 EO 账户，重装后登录可恢复。";
  return { modes, routes, unresolved: 0 };
}
export async function loadEventKitAccountPreferences(status: EventKitStatus) {
  await preferenceWrites;
  if (!preferenceLoad) {
    const current = readAccountPreferences(status); preferenceLoad = current;
    void current.finally(() => { if (preferenceLoad === current) preferenceLoad = null; }).catch(() => {});
  }
  return preferenceLoad;
}
export function saveEventKitAccountPreferences(status: EventKitStatus, modes: EventKitModes, routes: EventKitReminderRoutes, changedSources: string[] = []) {
  const save = preferenceWrites.catch(() => {}).then(async () => {
    // Finish any startup restore before a user edit is saved, preserving inaccessible source choices.
    if (preferenceLoad) await preferenceLoad;
    const account = await preferenceRequest();
    if (account.available) {
      const preferences = captureEventKitPreferences(status, modes, routes, account.preferences ? parseEventKitPreferences(account.preferences) : undefined, changedSources);
      const saved = await preferenceRequest({ method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preferences, revision: account.revision }) });
      return cacheResolved(parseEventKitPreferences(saved.preferences), status);
    }
    localStorage.setItem(eventKitSourcesKey, JSON.stringify(modes)); localStorage.setItem(eventKitRoutesKey, JSON.stringify(routes));
    return { modes, routes, unresolved: 0 };
  });
  preferenceWrites = save.catch(() => {});
  return save;
}

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
  const { modes, routes } = await loadEventKitAccountPreferences(status);
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
