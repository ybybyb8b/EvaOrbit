import {nativeApiFetch} from "./native-api.ts";
import type { NativeNotificationSchedule, ScheduledNotification } from "./types";
import { isManagedNativeNotification, nativeNotificationIdentifier as managedIdentifier, nativeReminderNotification } from "./native-notifications.ts";

export type NativeBridgeResponse<T> = { ok: true; result: T } | { ok: false; error: { code: string; message: string } };
export type NativeBridge = { version: number; call<T>(method: string, params?: Record<string, unknown>): Promise<NativeBridgeResponse<T>> };
export class NativeBridgeError extends Error {readonly code:string;constructor(message:string,code:string){super(message);this.name="NativeBridgeError";this.code=code;}}
export type NativeHostInfo = {
  apiOrigin?: string;
  platform?: string;
  bridgeVersion?: number;
  appVersion?: string;
  buildVersion?: string;
  healthKitPipeline?: string;
  hapticPipeline?: string;
  eventKitPipeline?: string;
  capabilities?: string[] | Record<string, boolean>;
  methods?: string[];
};
export type HealthKitStatus = {
  available: boolean;
  installationId: string;
  authorizationRequested: boolean;
  hasReadData: boolean;
  metrics: Array<{ metric: "resting" | "active" | "body_mass" | "menstrual_flow" | "sleep" | "heart_rate" | "resting_heart_rate" | "hrv" | "workout"; name: string }>;
  readSyncMetrics?: string[];
  backgroundDelivery: Record<string, "enabled" | "failed" | "not_requested" | "sync_disabled">;
  lastLocalSync: string | null;
  lastSuccessfulUpload: string | null;
  pendingCount: number;
  credentialConfigured: boolean;
  lastError: string | null;
};
export type NativeNotificationPermission = "not_determined" | "denied" | "authorized" | "provisional" | "ephemeral";
export type NativeNotificationSetting = "enabled" | "disabled" | "not_supported";
export type NativeNotificationStatus = {
  available: boolean;
  permission: NativeNotificationPermission;
  alertSetting?: NativeNotificationSetting;
  soundSetting?: NativeNotificationSetting;
  scheduledCount?: number;
};
export type NativePendingNotification = { id: string; triggerAt?: string };
const nativePendingReminderLimit = 48;

declare global {
  interface Window { EvaOrbitNative?: NativeBridge }
}

type NativeRequest=<T>(method:string,params:Record<string,unknown>)=>Promise<T>;
let nativeRequest:{request:NativeRequest}|undefined;
export function installNativeRequest(request:NativeRequest){const session={request};nativeRequest=session;return()=>{if(nativeRequest===session)nativeRequest=undefined;};}
export function captureNativeSessionGuard(){const session=nativeRequest;return()=>{if(nativeRequest!==session)throw new Error("Account changed. Native reconciliation stopped.");};}
export function nativeCall<T>(method:string,params:Record<string,unknown>={}){return nativeRequest?nativeRequest.request<T>(method,params):rawNativeCall<T>(method,params);}
export async function rawNativeCall<T>(method: string, params: Record<string, unknown> = {}) {
  const bridge = typeof window === "undefined" ? undefined : window.EvaOrbitNative;
  if (!bridge) throw new Error("EvaOrbit Native Host is not available");
  const response = await bridge.call<T>(method, params);
  if (!response.ok) throw new NativeBridgeError(response.error.message,response.error.code);
  return response.result;
}

export async function getNativeHostInfo(): Promise<NativeHostInfo | null> {
  if (typeof window === "undefined" || !window.EvaOrbitNative) return null;
  try { return await nativeCall<NativeHostInfo>("host.getInfo"); }
  catch { return null; }
}

export function hostSupports(info: NativeHostInfo | null, method: string) {
  if (!info) return false;
  if (info.methods?.includes(method)) return true;
  if (Array.isArray(info.capabilities)) return info.capabilities.includes(method);
  return info.capabilities?.[method] === true;
}

export function healthKitSupported(info: NativeHostInfo | null) {
  return Boolean(info?.healthKitPipeline || hostSupports(info, "healthkit.getStatus"));
}

export function nativeNotificationsSupported(info: NativeHostInfo | null) {
  return ["notification.getStatus", "notification.requestAuthorization", "notification.schedule", "notification.cancel", "notification.listPending", "notification.openSettings"]
    .every((method) => hostSupports(info, method));
}

export function nativeHapticsSupported(info: NativeHostInfo | null) {
  return hostSupports(info, "haptic.play");
}

export function eventKitSupported(info:NativeHostInfo|null){return["eventkit.getStatus","eventkit.requestAccess","eventkit.fetch","eventkit.save","eventkit.delete"].every(method=>hostSupports(info,method));}

export function nativeNotificationIdentifier(reminderId: number) {
  return managedIdentifier("reminder", reminderId);
}

export function nativeNotificationSchedule(item: ScheduledNotification): NativeNotificationSchedule | null {
  return nativeReminderNotification(item, typeof document === "undefined" ? "zh-CN" : document.documentElement.lang || navigator.language);
}

let reconcileWork: ReturnType<typeof performNativeNotificationReconcile> | null = null;
let reconcilePending = false;

export function reconcileNativeNotifications() {
  const guardSession=captureNativeSessionGuard();
  reconcilePending = true;
  if (reconcileWork) return reconcileWork;
  const work = (async () => {
    let result;
    do {
      reconcilePending = false;
      result = await performNativeNotificationReconcile(guardSession);
    } while (reconcilePending);
    return result;
  })();
  reconcileWork = work;
  void work.then(() => { reconcileWork = null; }, () => { reconcileWork = null; });
  return work;
}

async function performNativeNotificationReconcile(guardSession:()=>void) {
  guardSession();
  const info = await getNativeHostInfo();
  if (!nativeNotificationsSupported(info)) return { supported: false, authorized: false, scheduled: 0 };
  const status = await nativeCall<NativeNotificationStatus>("notification.getStatus");
  if (!["authorized", "provisional", "ephemeral"].includes(status.permission)) {
    return { supported: true, authorized: false, scheduled: status.scheduledCount ?? 0 };
  }
  const desired = await nativeApiFetch("/api/notifications", { cache: "no-store" }).then(async (response) => {
    if (!response.ok) throw new Error("Could not load reminders for native notifications");
    return (await response.json() as { nativeNotifications: NativeNotificationSchedule[] }).nativeNotifications;
  }).then((items) => items
    .filter((item) => new Date(item.triggerAt).getTime() > Date.now())
    .sort((a, b) => a.triggerAt.localeCompare(b.triggerAt))
    .slice(0, nativePendingReminderLimit));
  guardSession();
  const pendingResult = await nativeCall<NativePendingNotification[] | { notifications: NativePendingNotification[] }>("notification.listPending");
  const pending = Array.isArray(pendingResult) ? pendingResult : pendingResult.notifications;
  const desiredIds = new Set(desired.map((item) => item.id));
  for (const item of pending) {
    guardSession();
    if (isManagedNativeNotification(item.id) && !desiredIds.has(item.id)) await nativeCall("notification.cancel", { id: item.id });
  }
  for (const item of desired) {
    guardSession();
    await nativeCall("notification.schedule", { ...item });
  }
  return { supported: true, authorized: true, scheduled: desired.length };
}
