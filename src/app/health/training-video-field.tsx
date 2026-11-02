"use client";
import { useEffect, useState } from "react";
import { useHealthData } from "@/components/health-data-context";
import { useFormPreview } from "@/components/form-preview";
import { useLocale } from "@/components/locale-controller";
import { isBilibiliVideoUrl, trainingVideoInput } from "@/lib/training-video";

export function TrainingVideoField({ url, title, label, onChange, onResolved }: {
  url: string; title?: string; label: string;
  onChange: (url: string, title?: string) => void;
  onResolved: (url: string, title: string) => void;
}) {
  const { read } = useHealthData();
  const preview = useFormPreview();
  const { english } = useLocale();
  const [requestStatus, setStatus] = useState({ url: "", value: "" });
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState(false);
  const status = !title && !editing && requestStatus.url === url ? requestStatus.value : "";
  useEffect(() => {
    if (preview || editing || title || !isBilibiliVideoUrl(url)) return;
    let alive = true;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus({ url, value: "loading" });
      try {
        const response = await read(`/api/health/training/video?url=${encodeURIComponent(url)}`, { signal: controller.signal });
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (typeof result.title !== "string" || !result.title.trim()) throw new Error();
        if (alive) { onResolved(url, result.title); setStatus({ url, value: "" }); }
      } catch { if (alive) setStatus({ url, value: "failed" }); }
    }, 600);
    return () => { alive = false; clearTimeout(timer); controller.abort(); };
    // Resolution writes only to this URL; unrelated form edits must not restart the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, title, attempt, preview, editing, read]);
  return <div className="training-video-field">
    <input type="url" inputMode="url" autoCapitalize="none" spellCheck={false} maxLength={1000} aria-label={label} placeholder={english ? "Paste link or share text" : "粘贴链接或分享文本"} value={url}
      onChange={event => { const input = trainingVideoInput(event.target.value); onChange(input.url, input.title); }}
      onPaste={event => { const input = trainingVideoInput(event.clipboardData.getData("text")); if (input.url.startsWith("https://")) { event.preventDefault(); onChange(input.url, input.title); } }} />
    {editing ? <label className="field"><span>{english ? "Video title · Optional" : "视频标题 · 可选"}</span><input autoFocus maxLength={300} value={title ?? ""} onChange={event => onChange(url, event.target.value)} /><button type="button" className="text-button" onClick={() => setEditing(false)}>{english ? "Done" : "完成"}</button></label> : <small className="training-video-caption" aria-live="polite">{title || (status === "loading" ? (english ? "Getting video title…" : "正在获取视频标题…") : status === "failed" ? <>{english ? "Link kept. Title unavailable." : "链接已保留，暂未获取到标题。"} <button type="button" className="text-button" onClick={() => setAttempt(value => value + 1)}>{english ? "Retry" : "重试"}</button></> : "")}{url && status !== "loading" && <button type="button" className="text-button" onClick={() => setEditing(true)}>{title ? (english ? "Edit title" : "修改标题") : (english ? "Add title" : "填写标题")}</button>}</small>}
  </div>;
}
