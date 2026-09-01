"use client";

import { useCallback, useEffect, useState } from "react";

type NativeBridgeResponse<T> = { ok: true; result: T } | { ok: false; error: { code: string; message: string } };
type NativeBridge = { version: number; call<T>(method: string, params?: Record<string, unknown>): Promise<NativeBridgeResponse<T>> };
type HealthKitStatus = {
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

declare global {
  interface Window { EvaOrbitNative?: NativeBridge }
}

async function nativeCall<T>(method: string, params: Record<string, unknown> = {}) {
  const bridge = window.EvaOrbitNative;
  if (!bridge) throw new Error("EvaOrbit Native Host is not available");
  const response = await bridge.call<T>(method, params);
  if (!response.ok) throw new Error(response.error.message);
  return response.result;
}

function formatTime(value: string | null) {
  if (!value) return "Not yet";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Not yet";
}

function responseError(value: unknown, fallback: string) {
  return value && typeof value === "object" && "error" in value && typeof value.error === "string" ? value.error : fallback;
}

export function AppleHealthSection() {
  const [nativeHost, setNativeHost] = useState(false);
  const [status, setStatus] = useState<HealthKitStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!window.EvaOrbitNative) { setNativeHost(false); setStatus(null); return; }
    setNativeHost(true);
    try { setStatus(await nativeCall<HealthKitStatus>("healthkit.getStatus")); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read Apple Health status"); }
  }, []);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refresh(), 0);
    const ready = () => void refresh();
    window.addEventListener("evaorbit:native-ready", ready);
    return () => {
      window.clearTimeout(initialRefresh);
      window.removeEventListener("evaorbit:native-ready", ready);
    };
  }, [refresh]);

  async function connect() {
    if (!status) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const registrationResponse = await fetch("/api/native/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installationId: status.installationId }),
      });
      const registration = await registrationResponse.json().catch(() => null) as { credential?: string } | { error?: string } | null;
      if (!registrationResponse.ok || !registration || !("credential" in registration) || typeof registration.credential !== "string") {
        throw new Error(responseError(registration, "Could not register this iPhone"));
      }
      await nativeCall("healthkit.configureCredential", {
        credential: registration.credential,
        ingestUrl: `${window.location.origin}/api/healthkit/energy/ingest`,
      });
      await nativeCall<HealthKitStatus>("healthkit.requestAuthorization");
      setMessage("Apple Health connection requested");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect Apple Health");
    } finally { setBusy(false); }
  }

  async function syncNow() {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await nativeCall<{ synced: boolean }>("healthkit.syncNow");
      setMessage(result.synced ? "Local Apple Health sync completed" : "Sync finished with an error; data remains queued safely");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sync Apple Health");
    } finally { setBusy(false); }
  }

  async function disconnect() {
    if (!status) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/native/devices", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installationId: status.installationId }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseError(result, "Could not revoke this iPhone"));
      await nativeCall("healthkit.clearCredential");
      setMessage("Native upload credential revoked");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not disconnect Apple Health");
    } finally { setBusy(false); }
  }

  return <section className="apple-health-section" aria-labelledby="apple-health-title">
    <div className="apple-health-heading">
      <div><span className="eyebrow">APPLE HEALTH</span><h2 id="apple-health-title">Energy sync</h2><p>Resting and Active Energy only. EvaOrbit never uploads raw HealthKit samples.</p></div>
      <span className={`status-pill ${nativeHost ? "" : "disabled"}`}>{nativeHost ? "Native Host" : "Web only"}</span>
    </div>
    {!nativeHost && <p className="apple-health-fallback">Open this page inside the EvaOrbit iOS app to connect Apple Health.</p>}
    {nativeHost && status && <>
      <div className="apple-health-status-grid">
        <Status label="HealthKit" value={status.available ? "Available" : "Unavailable"} />
        <Status label="Access requested" value={status.authorizationRequested ? "Yes" : "No"} />
        <Status label="Data read" value={status.hasReadData ? "Yes" : "Not yet"} />
        <Status label="Pending upload" value={String(status.pendingCount)} />
        <Status label="Last local sync" value={formatTime(status.lastLocalSync)} />
        <Status label="Last upload" value={formatTime(status.lastSuccessfulUpload)} />
      </div>
      <div className="apple-health-metrics">{status.metrics.map((metric) => <div key={metric.metric}><strong>{metric.name}</strong><span>Background delivery: {status.backgroundDelivery[metric.metric]?.replaceAll("_", " ") ?? "not requested"}</span></div>)}</div>
      {status.lastError && <p className="apple-health-error">Last error: {status.lastError}</p>}
      {error && <p className="form-error">{error}</p>}
      {message && <p className="form-success" role="status">{message}</p>}
      <div className="apple-health-actions">
        {status.available && (!status.authorizationRequested || !status.credentialConfigured) && <button className="button primary" disabled={busy} onClick={() => void connect()}>{busy ? "Connecting…" : "Connect / Request Access"}</button>}
        {status.available && status.authorizationRequested && <button className="button secondary" disabled={busy} onClick={() => void syncNow()}>{busy ? "Syncing…" : "Sync Now"}</button>}
        {status.credentialConfigured && <button className="text-button" disabled={busy} onClick={() => void disconnect()}>Revoke native upload</button>}
      </div>
      <p className="apple-health-privacy-note">HealthKit does not reveal whether read access was granted per metric. “Data read” changes only after EvaOrbit successfully receives samples.</p>
    </>}
  </section>;
}

function Status({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}
