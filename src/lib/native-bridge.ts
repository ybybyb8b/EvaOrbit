import type { ScheduledNotification } from "./types";

export type NativeBridgeResponse<T> = { ok: true; result: T } | { ok: false; error: { code: string; message: string } };
export type NativeBridge = { version: number; call<T>(method: string, params?: Record<string, unknown>): Promise<NativeBridgeResponse<T>> };
export type NativeHostInfo = {
  platform?: string;
  bridgeVersion?: number;
  appVersion?: string;
  buildVersion?: string;
  healthKitPipeline?: string;
  capabilities?: string[] | Record<string, boolean>;
  methods?: string[];
};
export type HealthKitStatus = {
  available: boolean;
  installationId: string;
  authorizationRequested: boolean;
  hasReadData: boolean;
  metrics: Array<{ metric: "resting" | "active"; name: string }>;
  backgroundDelivery: Record<string, "enabled" | "failed" | "not_requested">;
  lastLocalSync: string | null;
  lastSuccessfulUpload: string | null;
  pendingCount: number;
  credentialConfigured: boolean;
  lastError: string | null;
};
export type NativeNotificationPermission = "not_requested" | "allowed" | "denied";
export type NativeNotificationStatus = { available: boolean; permission: NativeNotificationPermission; scheduledCount?: number };
export type NativePendingNotification = { id: string; triggerAt?: string };

declare global {
  interface Window { EvaOrbitNative?: NativeBridge }
}

export async function nativeCall<T>(method: string, params: Record<string, unknown> = {}) {
  const bridge = typeof window === "undefined" ? undefined : window.EvaOrbitNative;
  if (!bridge) throw new Error("EvaOrbit Native Host is not available");
  const response = await bridge.call<T>(method, params);
  if (!response.ok) throw new Error(response.error.message);
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
  return ["notification.getStatus", "notification.requestAuthorization", "notification.schedule", "notification.cancel", "notification.listPending"]
    .every((method) => hostSupports(info, method));
}

function notificationFireAt(item: ScheduledNotification) {
  const due = new Date(item.snoozedUntil ?? item.nextDueAt ?? item.scheduledAt).getTime();
  return new Date(due - item.leadTimeMinutes * 60_000).toISOString();
}

export async function reconcileNativeNotifications(items?: ScheduledNotification[]) {
  const info = await getNativeHostInfo();
  if (!nativeNotificationsSupported(info)) return { supported: false, scheduled: 0 };
  const source: ScheduledNotification[] = items ?? await fetch("/api/notifications", { cache: "no-store" }).then(async (response) => {
    if (!response.ok) throw new Error("Could not load reminders for native notifications");
    return (await response.json() as { upcoming: ScheduledNotification[] }).upcoming;
  });
  const desired = source.filter((item) => item.dueHasExplicitTime && item.isActive).slice(0, 48);
  const pendingResult = await nativeCall<NativePendingNotification[] | { notifications: NativePendingNotification[] }>("notification.listPending");
  const pending = Array.isArray(pendingResult) ? pendingResult : pendingResult.notifications;
  const desiredIds = new Set(desired.map((item) => `evaorbit-reminder-${item.id}`));
  for (const item of pending) {
    if (item.id.startsWith("evaorbit-reminder-") && !desiredIds.has(item.id)) await nativeCall("notification.cancel", { id: item.id });
  }
  for (const item of desired) {
    await nativeCall("notification.schedule", {
      id: `evaorbit-reminder-${item.id}`,
      title: item.title,
      body: item.note || `${item.subjectLabel} · ${item.sourceLabel}`,
      triggerAt: notificationFireAt(item),
      repeats: false,
      url: "/settings/notifications",
    });
  }
  return { supported: true, scheduled: desired.length };
}
