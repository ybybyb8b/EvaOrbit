"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { useLocale } from "@/components/locale-controller";
import { subscriptionSectionSwipeEdge, subscriptionSectionSwipeIntent, subscriptionSectionSwipeStep } from "@/lib/subscription-section-swipe";
import styles from "./subscription-sections.module.css";

type Section = "overview" | "trends" | "library";

export function SubscriptionSections({ active, onViewChange }: { active: Section; onViewChange?: (view: "overview" | "trends") => void }) {
  const { english } = useLocale();
  const navRef = useRef<HTMLElement>(null);
  const sections = useMemo(() => [
    { key: "overview", href: "/subscriptions?view=overview", label: english ? "Overview" : "订阅首页" },
    { key: "trends", href: "/subscriptions?view=trends", label: english ? "Trends" : "趋势统计" },
    { key: "library", href: "/subscriptions/library", label: english ? "Library" : "软件库" },
  ] as const, [english]);

  useEffect(() => {
    const nav = navRef.current;
    const root = nav?.closest<HTMLElement>(".page");
    if (!nav || !root) return;
    const index = sections.findIndex((section) => section.key === active);
    let tracking = false;
    let intent: "pending" | "horizontal" | "vertical" = "pending";
    let startX = 0, lastX = 0, startY = 0, lastAt = 0, velocityX = 0, suppressClickUntil = 0;
    let internalClick = false;
    const clearFeedback = () => { nav.removeAttribute("data-swiping"); nav.style.removeProperty("--section-swipe-progress"); };
    const hasHorizontalScroller = (target: Element) => {
      for (let node: Element | null = target; node && node !== root; node = node.parentElement) {
        const style = getComputedStyle(node);
        if ((style.overflowX === "auto" || style.overflowX === "scroll") && node.scrollWidth > node.clientWidth + 2) return true;
      }
      return false;
    };
    const ignoresSwipe = (target: Element) => Boolean(
      target.closest("[data-section-swipe-ignore], nav, [role='dialog'], .form-sheet-layer, input, textarea, select, [contenteditable='true'], [role='slider'], [role='combobox'], [role='listbox'], video, audio, iframe")
      || (target.closest("button") && !target.closest("[data-section-swipe-surface]"))
      || hasHorizontalScroller(target)
    );
    const start = (event: TouchEvent) => {
      clearFeedback(); tracking = false; intent = "pending";
      if (event.touches.length !== 1 || (window.visualViewport?.scale ?? 1) > 1.05) return;
      const target = event.target;
      if (!(target instanceof Element) || ignoresSwipe(target)) return;
      const touch = event.touches[0], width = document.documentElement.clientWidth;
      if (touch.clientX <= subscriptionSectionSwipeEdge || touch.clientX >= width - subscriptionSectionSwipeEdge) return;
      tracking = true; startX = lastX = touch.clientX; startY = touch.clientY; lastAt = event.timeStamp; velocityX = 0;
    };
    const move = (event: TouchEvent) => {
      if (!tracking || event.touches.length !== 1) { tracking = false; clearFeedback(); return; }
      const touch = event.touches[0], dx = touch.clientX - startX, dy = touch.clientY - startY;
      if (intent === "pending") intent = subscriptionSectionSwipeIntent(dx, dy);
      if (intent === "vertical") { tracking = false; clearFeedback(); return; }
      if (intent !== "horizontal") return;
      event.preventDefault();
      const elapsed = Math.max(1, event.timeStamp - lastAt);
      velocityX = (touch.clientX - lastX) / elapsed; lastX = touch.clientX; lastAt = event.timeStamp;
      const blocked = (dx > 0 && index === 0) || (dx < 0 && index === sections.length - 1);
      const progress = Math.max(-1, Math.min(1, dx / document.documentElement.clientWidth)) * (blocked ? .28 : 1);
      nav.setAttribute("data-swiping", ""); nav.style.setProperty("--section-swipe-progress", progress.toString());
    };
    const end = (event: TouchEvent) => {
      if (!tracking) { clearFeedback(); return; }
      tracking = false;
      const dx = (event.changedTouches[0]?.clientX ?? lastX) - startX;
      const wasHorizontal = intent === "horizontal";
      clearFeedback();
      if (!wasHorizontal) return;
      if (Math.abs(dx) > 12) suppressClickUntil = Date.now() + 450;
      const target = subscriptionSectionSwipeStep({ dx, velocityX, width: document.documentElement.clientWidth, index, count: sections.length });
      if (target === null) return;
      const control = nav.querySelector<HTMLElement>(`[data-section-key="${sections[target].key}"]`);
      if (control) { internalClick = true; control.click(); internalClick = false; }
    };
    const cancel = () => { tracking = false; intent = "pending"; clearFeedback(); };
    const click = (event: MouseEvent) => { if (!internalClick && Date.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); } };
    root.addEventListener("touchstart", start, { passive: true });
    root.addEventListener("touchmove", move, { passive: false });
    root.addEventListener("touchend", end, { passive: true });
    root.addEventListener("touchcancel", cancel, { passive: true });
    root.addEventListener("click", click, true);
    return () => {
      root.removeEventListener("touchstart", start); root.removeEventListener("touchmove", move); root.removeEventListener("touchend", end); root.removeEventListener("touchcancel", cancel); root.removeEventListener("click", click, true); clearFeedback();
    };
  }, [active, sections]);

  return <nav ref={navRef} className={styles.sections} aria-label={english ? "Subscriptions sections" : "订阅分区"}>
    {sections.map((section) => onViewChange && section.key !== "library"
      ? <button key={section.key} data-section-key={section.key} aria-pressed={active === section.key} onClick={() => onViewChange(section.key as "overview" | "trends")}>{section.label}</button>
      : <Link key={section.key} data-section-key={section.key} href={section.href} aria-current={active === section.key ? "page" : undefined}>{section.label}</Link>)}
  </nav>;
}
