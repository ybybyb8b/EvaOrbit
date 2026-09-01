"use client";

import { useCallback, useEffect, useState } from "react";
import { getNativeHostInfo, nativeCall, nativeNotificationsSupported, reconcileNativeNotifications, type NativeNotificationStatus } from "@/lib/native-bridge";

const permissionLabel = { not_requested: "Not requested", allowed: "Allowed", denied: "Denied" } as const;

export function NativeNotificationControl() {
  const [hostAvailable, setHostAvailable] = useState(false);
  const [supported, setSupported] = useState(false);
  const [status, setStatus] = useState<NativeNotificationStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const info = await getNativeHostInfo();
    setHostAvailable(Boolean(info));
    const available = nativeNotificationsSupported(info);
    setSupported(available);
    if (!available) { setStatus(null); return; }
    try { setStatus(await nativeCall<NativeNotificationStatus>("notification.getStatus")); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read native notification status"); }
  }, []);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refresh(), 0);
    window.addEventListener("evaorbit:native-ready", refresh);
    return () => { window.clearTimeout(initialRefresh); window.removeEventListener("evaorbit:native-ready", refresh); };
  }, [refresh]);

  async function authorize() {
    setBusy(true); setError(""); setMessage("");
    try {
      setStatus(await nativeCall<NativeNotificationStatus>("notification.requestAuthorization"));
      const result = await reconcileNativeNotifications();
      setMessage(`Permission updated. ${result.scheduled} upcoming reminders scheduled locally.`);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not request notification permission"); }
    finally { setBusy(false); }
  }

  async function test() {
    setBusy(true); setError(""); setMessage("");
    try {
      await nativeCall("notification.schedule", { id: `evaorbit-test-${Date.now()}`, title: "EvaOrbit", body: "Native local notifications are ready.", triggerAt: new Date(Date.now() + 5_000).toISOString(), repeats: false, url: "/settings/notifications" });
      setMessage("A test notification is scheduled for a few seconds from now.");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not schedule a test notification"); }
    finally { setBusy(false); }
  }

  return <section className="notification-channel native-channel" aria-labelledby="native-notification-title">
    <div className="notification-channel-heading"><div><span className="eyebrow">NATIVE NOTIFICATIONS</span><h2 id="native-notification-title">On this iPhone</h2><p>Local reminders scheduled by the installed EvaOrbit Native Host. No APNs remote push is required.</p></div><span className={`status-pill ${supported ? "" : "disabled"}`}>{supported ? "Available" : hostAvailable ? "Update required" : "Not installed"}</span></div>
    {supported && status ? <><div className="notification-channel-status"><div><span>Permission</span><strong>{permissionLabel[status.permission]}</strong></div><div><span>Native Host</span><strong>{status.available ? "Available" : "Unavailable"}</strong></div><div><span>Scheduled</span><strong>{status.scheduledCount ?? 0}</strong></div></div><div className="notification-channel-actions">{status.permission !== "allowed" && <button className="button primary" disabled={busy || status.permission === "denied"} onClick={() => void authorize()}>{busy ? "Working…" : "Request permission"}</button>}<button className="button secondary" disabled={busy || status.permission !== "allowed"} onClick={() => void test()}>Test notification</button></div>{status.permission === "denied" && <p className="channel-note">Permission is denied. Re-enable notifications for EvaOrbit in iOS Settings.</p>}</> : <p className="channel-note">{hostAvailable ? "This installed IPA does not expose the Native Notification bridge yet. Web Notifications remain available below." : "Install and open a Native Host build with notification capabilities to use local notifications. Web Notifications remain available below."}</p>}
    {error && <p className="form-error">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}
  </section>;
}
