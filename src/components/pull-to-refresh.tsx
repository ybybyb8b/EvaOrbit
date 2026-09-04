"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useLocale } from "./locale-controller";

type RefreshPhase = "idle" | "pulling" | "ready" | "refreshing";

const REFRESH_THRESHOLD = 68;
const MAX_PULL_DISTANCE = 112;
const DISABLED_TARGETS = [
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
  ".form-sheet-layer",
  ".space-drawer-layer",
  ".eva-wake-layer",
  ".ai-workspace",
  "[data-pull-refresh-disabled]",
].join(",");

function hasScrollableParent(target: Element) {
  let node = target.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    const scrollable = /(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1;
    if (scrollable) return true;
    node = node.parentElement;
  }
  return false;
}

export function PullToRefresh({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const { english } = useLocale();
  const indicatorRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<RefreshPhase>("idle");
  const gestureRef = useRef({ tracking: false, startX: 0, startY: 0 });
  const reloadTimerRef = useRef<number | null>(null);
  const [phase, setPhaseState] = useState<RefreshPhase>("idle");

  useEffect(() => {
    const indicator = indicatorRef.current;
    const setPhase = (next: RefreshPhase) => {
      if (phaseRef.current === next) return;
      phaseRef.current = next;
      setPhaseState(next);
    };
    const setDistance = (distance: number) => {
      if (!indicator) return;
      indicator.style.setProperty("--pull-distance", `${distance}px`);
      indicator.style.setProperty("--pull-progress", `${Math.min(distance / REFRESH_THRESHOLD, 1)}`);
    };
    const reset = () => {
      gestureRef.current.tracking = false;
      setDistance(0);
      setPhase("idle");
    };
    reset();
    const canStart = (target: EventTarget | null) => {
      if (!enabled || pathname === "/ai" || phaseRef.current === "refreshing") return false;
      if (!window.matchMedia("(max-width: 720px)").matches || window.scrollY > 0) return false;
      if (!(target instanceof Element) || target.closest(DISABLED_TARGETS)) return false;
      if (document.querySelector(".form-sheet-layer, .space-drawer-layer, .eva-wake-layer")) return false;
      return !hasScrollableParent(target);
    };
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || !canStart(event.target)) return;
      const touch = event.touches[0];
      gestureRef.current = { tracking: true, startX: touch.clientX, startY: touch.clientY };
    };
    const onTouchMove = (event: TouchEvent) => {
      const gesture = gestureRef.current;
      if (!gesture.tracking || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;
      if (deltaY <= 0 || Math.abs(deltaX) > deltaY) {
        reset();
        return;
      }
      if (event.cancelable && deltaY > 4) event.preventDefault();
      const distance = Math.min(MAX_PULL_DISTANCE, deltaY * 0.52);
      setDistance(distance);
      setPhase(distance >= REFRESH_THRESHOLD ? "ready" : "pulling");
    };
    const onTouchEnd = () => {
      if (!gestureRef.current.tracking) return;
      gestureRef.current.tracking = false;
      if (phaseRef.current !== "ready") {
        reset();
        return;
      }
      setDistance(54);
      setPhase("refreshing");
      reloadTimerRef.current = window.setTimeout(() => window.location.reload(), 360);
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", reset, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", reset);
      if (reloadTimerRef.current !== null) window.clearTimeout(reloadTimerRef.current);
    };
  }, [enabled, pathname]);

  const label = phase === "refreshing"
    ? english ? "Refreshing" : "正在刷新"
    : phase === "ready"
      ? english ? "Release to refresh" : "松开刷新"
      : english ? "Pull to refresh" : "下拉刷新";

  return <div ref={indicatorRef} className={`pull-refresh-indicator is-${phase}`} role="status" aria-live="polite" aria-hidden={phase === "idle"}>
    <span className="pull-refresh-spinner" aria-hidden="true" />
    <span>{label}</span>
  </div>;
}
