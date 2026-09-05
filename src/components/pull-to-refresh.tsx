"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useLocale } from "./locale-controller";
import {
  getPullRefreshDistance,
  REFRESH_THRESHOLD,
  shouldTriggerPullRefresh,
} from "@/lib/pull-refresh-gesture";

type RefreshPhase = "idle" | "pulling" | "ready" | "refreshing";

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
  const spinnerRef = useRef<HTMLSpanElement>(null);
  const phaseRef = useRef<RefreshPhase>("idle");
  const gestureRef = useRef({ tracking: false, startX: 0, startY: 0, startTime: 0, currentDistance: 0 });
  const reloadTimerRef = useRef<number | null>(null);
  const [phase, setPhaseState] = useState<RefreshPhase>("idle");

  useEffect(() => {
    const indicator = indicatorRef.current;
    if (!indicator) return;
    const setPhase = (next: RefreshPhase) => {
      if (phaseRef.current === next) return;
      phaseRef.current = next;
      setPhaseState(next);
    };
    const setVisuals = (distance: number) => {
      const progress = Math.min(distance / REFRESH_THRESHOLD, 1);
      indicator.style.opacity = `${progress}`;
      indicator.style.transform = `translate3d(-50%,calc(-100% - 10px + ${distance}px),0)`;
      if (spinnerRef.current) spinnerRef.current.style.transform = `rotate(${progress * 220}deg)`;
      gestureRef.current.currentDistance = distance;
    };
    const settleTo = (distance: number) => {
      indicator.style.transition = "";
      void window.getComputedStyle(indicator).transform;
      setVisuals(distance);
    };
    const reset = (flushCurrentStyle = true) => {
      gestureRef.current.tracking = false;
      if (flushCurrentStyle) {
        settleTo(0);
      } else {
        indicator.style.transition = "";
        setVisuals(0);
      }
      setPhase("idle");
    };
    setVisuals(0);
    setPhase("idle");
    const canStart = (target: EventTarget | null) => {
      if (!enabled || pathname === "/ai" || phaseRef.current === "refreshing") return false;
      if (!window.matchMedia("(max-width: 720px)").matches || window.scrollY > 0) return false;
      if (!(target instanceof Element) || target.closest(DISABLED_TARGETS)) return false;
      if (document.querySelector(".form-sheet-layer, .space-drawer-layer, .eva-wake-layer")) return false;
      return !hasScrollableParent(target);
    };
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        if (gestureRef.current.tracking) reset();
        return;
      }
      if (!canStart(event.target)) return;
      const touch = event.touches[0];
      indicator.style.transition = "none";
      gestureRef.current = {
        tracking: true,
        startX: touch.clientX,
        startY: touch.clientY,
        startTime: performance.now(),
        currentDistance: 0,
      };
    };
    const onTouchMove = (event: TouchEvent) => {
      const gesture = gestureRef.current;
      if (!gesture.tracking) return;
      if (event.touches.length !== 1) {
        reset(false);
        return;
      }
      const touch = event.touches[0];
      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;
      if (deltaY <= 0 || Math.abs(deltaX) > deltaY) {
        reset(false);
        return;
      }
      if (event.cancelable && deltaY > 4) event.preventDefault();
      const distance = getPullRefreshDistance(deltaY);
      setVisuals(distance);
      setPhase(distance >= REFRESH_THRESHOLD ? "ready" : "pulling");
    };
    const onTouchEnd = () => {
      const gesture = gestureRef.current;
      if (!gesture.tracking) return;
      gesture.tracking = false;
      if (!shouldTriggerPullRefresh(gesture.currentDistance, performance.now() - gesture.startTime)) {
        reset();
        return;
      }
      settleTo(54);
      setPhase("refreshing");
      reloadTimerRef.current = window.setTimeout(() => window.location.reload(), 360);
    };
    const onTouchCancel = () => reset();

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchCancel, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchCancel);
      if (reloadTimerRef.current !== null) window.clearTimeout(reloadTimerRef.current);
    };
  }, [enabled, pathname]);

  const label = phase === "refreshing"
    ? english ? "Refreshing" : "正在刷新"
    : phase === "ready"
      ? english ? "Release to refresh" : "松开刷新"
      : english ? "Pull to refresh" : "下拉刷新";

  return <div ref={indicatorRef} className={`pull-refresh-indicator is-${phase}`} role="status" aria-live="polite" aria-hidden={phase === "idle"}>
    <span ref={spinnerRef} className="pull-refresh-spinner" aria-hidden="true" />
    <span>{label}</span>
  </div>;
}
