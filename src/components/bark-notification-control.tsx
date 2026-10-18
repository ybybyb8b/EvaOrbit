"use client";

import { ErrorNotice } from "@/components/error-notice";
import { useEffect, useRef, useState } from "react";
import { reconcileNativeNotifications } from "@/lib/native-bridge";
import type { BarkStatus } from "@/lib/push/bark";

export function BarkNotificationControl({ onChange }: { onChange: (enabled: boolean) => void }) {
  const [status, setStatus] = useState<BarkStatus | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const settingsRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    settingsRequest.current = controller;
    void fetch("/api/push/bark", { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]) }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "无法读取 Bark 设置");
      if (controller.signal.aborted) return;
      setStatus(result); onChange(result.enabled);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "无法读取 Bark 设置"); });
    return () => controller.abort();
  }, [onChange]);

  async function action(kind: "save" | "test" | "toggle" | "destination") {
    settingsRequest.current?.abort();
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/push/bark", {
        method: kind === "test" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15_000),
        ...(kind === "test" ? {} : { body: JSON.stringify(kind === "save" ? { url, enabled: false } : kind === "destination" ? {enabled:Boolean(status?.enabled),openInHost:!status?.openInHost} : { enabled: !status?.enabled }) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Bark 操作失败");
      if (kind === "test") setMessage("Bark 已接受测试通知。请在手机上点击通知，确认能打开 EO 后再设为主通道。");
      else {
        setStatus(result); onChange(result.enabled); setUrl("");
        setMessage(kind === "save" ? "地址已加密保存。接下来发送测试通知。" : kind === "destination" ? result.openInHost?"通知将打开 EO Host，请发送测试通知验证。":"通知将打开网页。" : result.enabled ? "Bark 已设为主通道。" : "Bark 已暂停，恢复原有通知通道。");
        try { await reconcileNativeNotifications(); } catch { setMessage("设置已保存。请打开 EO Host，让本地提醒同步此设置。"); }
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Bark 操作失败"); }
    finally { setBusy(false); }
  }
  return <section className="notification-channel bark-channel">
    <div className="notification-channel-heading"><div><span className="eyebrow">BARK</span><h2>手机推送</h2><p>先保存地址并测试跳转，再将 Bark 设为主要通知通道。</p></div><span className={`status-pill ${status?.enabled ? "" : "disabled"}`}>{status?.enabled ? "主通道" : status?.configured ? "已连接 · 暂停" : "待连接"}</span></div>
    <form onSubmit={event => { event.preventDefault(); void action("save"); }}>
      <label className="field bark-address">Bark 推送地址<input type="password" autoComplete="off" spellCheck={false} value={url} onChange={event => setUrl(event.target.value)} placeholder={status?.configured ? "已保存；粘贴新地址可更换" : "https://api.day.app/你的设备Key"} disabled={busy} /></label>
      <div className="notification-channel-actions"><button className="button secondary" disabled={busy || !url.trim()} type="submit">{status?.configured ? "更换地址" : "保存地址"}</button><button className="button secondary" type="button" disabled={busy || !status?.configured || Boolean(url.trim())} onClick={() => void action("test")}>发送测试通知</button><button className="button primary" type="button" disabled={busy || !status?.configured || Boolean(url.trim())} onClick={() => void action("toggle")}>{status?.enabled ? "暂停 Bark" : "设为主通道"}</button></div>
    </form>
    {status?.configured && <div className="notification-channel-actions"><span className="channel-note">点击通知打开：{status.openInHost?"EO Host":"网页"}</span><button className="button secondary" type="button" disabled={busy||Boolean(url.trim())} onClick={()=>void action("destination")}>{status.openInHost?"改为打开网页":"改为打开 Host"}</button></div>}
    {status?.configured && <p className="channel-note">打开 Host 需要安装支持通知链接的新版 IPA。旧版或未安装时请选择网页。</p>}
    {status?.enabled && <p className="channel-note">网页推送和 Host 本地业务提醒已暂停。Apple 提醒事项已有的首次提醒继续保留；打开一次 Host 可清理旧的本地提醒。</p>}
    {message && <p className="channel-note" role="status">{message}</p>}{error && <ErrorNotice role="alert">{error}</ErrorNotice>}
  </section>;
}
