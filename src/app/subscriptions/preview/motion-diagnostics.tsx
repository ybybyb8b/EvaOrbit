"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { startSubscriptionMotionTrace } from "@/lib/subscription-motion-trace";
import styles from "./preview.module.css";

const subscribe = () => () => {};
const isEnabled = () => new URLSearchParams(location.search).get("carousel-debug") === "1";
export function MotionDiagnostics({ rail }: { rail: RefObject<HTMLDivElement | null> }) {
  const enabled = useSyncExternalStore(subscribe, isEnabled, () => false);
  const [recording, setRecording] = useState(false);
  const [download, setDownload] = useState<string | null>(null);
  const stop = useRef<ReturnType<typeof startSubscriptionMotionTrace> | null>(null);
  useEffect(() => {
    return () => { stop.current?.(); stop.current = null; };
  }, []);
  useEffect(() => () => { if (download) URL.revokeObjectURL(download); }, [download]);
  if (!enabled) return null;
  function start() {
    if (!rail.current) return;
    setDownload(null);
    stop.current = startSubscriptionMotionTrace(rail.current);
    setRecording(true);
  }
  function finish() {
    const trace = stop.current?.(); stop.current = null;
    setRecording(false);
    if (trace) {
      const data = { ...trace, capturedAt: new Date().toISOString(), userAgent: navigator.userAgent,
        viewport: [innerWidth, innerHeight, devicePixelRatio], theme: document.documentElement.dataset.theme,
        mode: document.documentElement.dataset.mode, reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
        railWidth: rail.current?.clientWidth, slideWidths: Array.from(rail.current?.children ?? [], child => (child as HTMLElement).offsetWidth) };
      setDownload(URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" })));
    }
  }
  return <aside className={styles.motionDiagnostics} aria-label="轮播性能诊断">
    <span>{recording ? "正在记录 · 滑动后松手，重复 3 次" : "轮播诊断 · 只记录运动数据"}</span>
    <button type="button" onClick={recording ? finish : start}>{recording ? "停止" : "开始"}</button>
    {download && <a href={download} download="evaorbit-carousel-C.json">导出 JSON</a>}
  </aside>;
}
