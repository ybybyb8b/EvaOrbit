"use client";

import { useEffect, useState } from "react";
import { reconcileNativeNotifications } from "@/lib/native-bridge";
import type { BarkStatus } from "@/lib/push/bark";

export function BarkNotificationControl({ onChange }: { onChange: (enabled: boolean) => void }) {
  const [status, setStatus] = useState<BarkStatus | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/push/bark", { signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "无法读取 Bark 设置");
      setStatus(result); onChange(result.enabled);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "无法读取 Bark 设置"); });
    return () => controller.abort();
  }, [onChange]);

  async function action(kind: "save" | "test" | "toggle") {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/push/bark", {
        method: kind === "test" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        ...(kind === "test" ? {} : { body: JSON.stringify(kind === "save" ? { url, enabled: false } : { enabled: !status?.enabled }) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Bark 操作失败");
      if (kind === "test") setMessage("Bark 已接受测试通知。请在手机上点击通知，确认能打开 EO 后再设为主通道。");
      else {
        setStatus(result); onChange(result.enabled); setUrl("");
        setMessage(kind === "save" ? "地址已加密保存。接下来发送测试通知。" : result.enabled ? "Bark 已设为主通道。" : "Bark 已暂停，恢复原有通知通道。");
        try { await reconcileNativeNotifications(); } catch { setMessage("设置已保存。请打开 EO Host，让本地提醒同步此设置。"); }
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Bark 操作失败"); }
    finally { setBusy(false); }
  }
  return <section className="notification-channel bark-channel">
    <div className="notification-channel-heading"><div><span className="eyebrow">BARK</span><h2>手机推送</h2><p>先保存地址并测试跳转，再将 Bark 设为主要通知通道。</p></div><span className={`status-pill ${status?.enabled ? "" : "disabled"}`}>{status?.enabled ? "主通道" : status?.configured ? "已连接 · 暂停" : "待连接"}</span></div>
    <form onSubmit={event => { event.preventDefault(); void action("save"); }}>
      <label className="field bark-address">Bark 推送地址<input type="password" autoComplete="off" spellCheck={false} value={url} onChange={event => setUrl(event.target.value)} placeholder={status?.configured ? "已保存；粘贴新地址可更换" : "https://api.day.app/你的设备Key"} disabled={busy || !status} /></label>
      <div className="notification-channel-actions"><button className="button secondary" disabled={busy || !status || !url.trim()} type="submit">{status?.configured ? "更换地址" : "保存地址"}</button><button className="button secondary" type="button" disabled={busy || !status?.configured || Boolean(url.trim())} onClick={() => void action("test")}>发送测试通知</button><button className="button primary" type="button" disabled={busy || !status?.configured || Boolean(url.trim())} onClick={() => void action("toggle")}>{status?.enabled ? "暂停 Bark" : "设为主通道"}</button></div>
    </form>
    {status?.enabled && <p className="channel-note">网页推送和 Host 本地业务提醒已暂停。Apple 提醒事项已有的首次提醒继续保留；打开一次 Host 可清理旧的本地提醒。</p>}
    {message && <p className="channel-note" role="status">{message}</p>}{error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
