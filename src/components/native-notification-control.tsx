"use client";

import { useCallback, useEffect, useState } from "react";
import { getNativeHostInfo, nativeCall, nativeNotificationsSupported, reconcileNativeNotifications, type NativeNotificationStatus } from "@/lib/native-bridge";

const permissionLabel = { not_determined: "Not determined", denied: "Denied", authorized: "Authorized", provisional: "Provisional", ephemeral: "Ephemeral" } as const;
const authorizedPermissions = new Set<NativeNotificationStatus["permission"]>(["authorized", "provisional", "ephemeral"]);

export function NativeNotificationControl() {
  const [hostAvailable, setHostAvailable] = useState(false);
  const [checked, setChecked] = useState(false);
  const [supported, setSupported] = useState(false);
  const [status, setStatus] = useState<NativeNotificationStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    const info = await getNativeHostInfo();
    setHostAvailable(Boolean(info));
    const available = nativeNotificationsSupported(info);
    setSupported(available);
    if (!available) { setStatus(null); setChecked(true); return; }
    try { setStatus(await nativeCall<NativeNotificationStatus>("notification.getStatus")); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read native notification status"); }
    finally { setChecked(true); }
  }, []);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refresh(), 0);
    window.addEventListener("evaorbit:native-ready", refresh);
    window.addEventListener("evaorbit:native-active", refresh);
    return () => { window.clearTimeout(initialRefresh); window.removeEventListener("evaorbit:native-ready", refresh); window.removeEventListener("evaorbit:native-active", refresh); };
  }, [refresh]);

  async function authorize() {
    setBusy(true); setError(""); setMessage("");
    try {
      setStatus(await nativeCall<NativeNotificationStatus>("notification.requestAuthorization"));
      const result = await reconcileNativeNotifications();
      setMessage(result.authorized ? `Permission updated. ${result.scheduled} upcoming reminders scheduled locally.` : "Notification access was not granted. Web Notifications remain available.");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not request notification permission"); }
    finally { setBusy(false); }
  }

  async function refreshAndReconcile() {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await reconcileNativeNotifications();
      await refresh();
      setMessage(result.authorized ? `${result.scheduled} upcoming reminders are synchronized.` : "Native notification status refreshed.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not refresh native notifications"); }
    finally { setBusy(false); }
  }

  async function openSettings() {
    setBusy(true); setError("");
    try { await nativeCall("notification.openSettings"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open iOS Settings"); }
    finally { setBusy(false); }
  }

  async function test() {
    setBusy(true); setError(""); setMessage("");
    try {
      await nativeCall("notification.schedule", { id: `evaorbit-test-${Date.now()}`, title: "EvaOrbit", body: "Native local notifications are ready.", triggerAt: new Date(Date.now() + 5_000).toISOString() });
      setMessage("A test notification is scheduled for a few seconds from now.");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not schedule a test notification"); }
    finally { setBusy(false); }
  }

  if (!checked || !hostAvailable) return null;
  const authorized = status ? authorizedPermissions.has(status.permission) : false;
  return <section className="notification-channel native-channel" aria-labelledby="native-notification-title">
    <div className="notification-channel-heading"><div><span className="eyebrow">NATIVE NOTIFICATIONS</span><h2 id="native-notification-title">On this iPhone</h2><p>Local reminders scheduled by the installed EvaOrbit Native Host. No APNs remote push is required.</p></div><span className={`status-pill ${supported ? "" : "disabled"}`}>{supported ? "Available" : hostAvailable ? "Update required" : "Not installed"}</span></div>
    {supported && status ? <><div className="notification-channel-status"><div><span>Permission</span><strong>{permissionLabel[status.permission]}</strong></div><div><span>Native Host</span><strong>{status.available ? "Available" : "Unavailable"}</strong></div><div><span>Scheduled</span><strong>{status.scheduledCount ?? 0}</strong></div></div><div className="notification-channel-actions">{status.permission === "not_determined" && <button className="button primary" disabled={busy} onClick={() => void authorize()}>{busy ? "Working…" : "Request Access"}</button>}{status.permission === "denied" && <button className="button primary" disabled={busy} onClick={() => void openSettings()}>Open iOS Settings</button>}<button className="button secondary" disabled={busy} onClick={() => void refreshAndReconcile()}>Refresh status</button><button className="button secondary" disabled={busy || !authorized} onClick={() => void test()}>Test notification</button></div>{status.permission === "denied" && <p className="channel-note">Permission is denied. EvaOrbit will not request it repeatedly; enable Notifications in iOS Settings if you want local delivery.</p>}</> : <p className="channel-note">This installed IPA does not expose the Native Notification bridge yet. Web Notifications remain available below.</p>}
    {error && <p className="form-error">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}
  </section>;
}
