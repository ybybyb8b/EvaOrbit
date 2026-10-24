"use client";

import { useEffect, useEffectEvent, type RefObject } from "react";
import { sectionSwipeEdge, sectionSwipeIntent, sectionSwipeStep } from "@/lib/section-swipe";

type SectionSwipeOptions<T extends string> = {
  active: T;
  sections: readonly T[];
  rootRef: RefObject<HTMLElement | null>;
  feedbackRef?: RefObject<HTMLElement | null>;
  onChange: (section: T) => void;
  enabled?: boolean;
  ignoreSelector?: string;
  interactiveSurfaceSelector?: string;
};

const commonIgnore = "nav, [role='dialog'], .form-sheet-layer, input, textarea, select, summary, [contenteditable='true'], [role='slider'], [role='combobox'], [role='listbox'], video, audio, iframe";

export function useSectionSwipe<T extends string>({ active, sections, rootRef, feedbackRef, onChange, enabled = true, ignoreSelector, interactiveSurfaceSelector }: SectionSwipeOptions<T>) {
  const changeSection = useEffectEvent(onChange);
  useEffect(() => {
    const root = rootRef.current, feedback = feedbackRef?.current;
    const index = sections.indexOf(active);
    if (!enabled || !root || index < 0) return;
    feedback?.setAttribute("data-section-swipe-feedback", "");
    let tracking = false, intent: "pending" | "horizontal" | "vertical" = "pending", changing = false;
    let startX = 0, lastX = 0, startY = 0, lastAt = 0, velocityX = 0, suppressClickUntil = 0;
    const clearFeedback = () => {
      feedback?.removeAttribute("data-section-swiping");
      feedback?.style.removeProperty("--section-swipe-progress");
    };
    const hasHorizontalScroller = (target: Element) => {
      for (let node: Element | null = target; node && node !== root; node = node.parentElement) {
        const style = getComputedStyle(node);
        if ((style.overflowX === "auto" || style.overflowX === "scroll") && node.scrollWidth > node.clientWidth + 2) return true;
      }
      return false;
    };
    const ignoresSwipe = (target: Element) => Boolean(
      target.closest(commonIgnore)
      || (ignoreSelector && target.closest(ignoreSelector))
      || (target.closest("button") && !(interactiveSurfaceSelector && target.closest(interactiveSurfaceSelector)))
      || hasHorizontalScroller(target)
    );
    const start = (event: TouchEvent) => {
      clearFeedback(); tracking = false; intent = "pending";
      if (event.touches.length !== 1 || (window.visualViewport?.scale ?? 1) > 1.05 || root.querySelector("[data-section-swipe-pause]") || document.querySelector('[aria-modal="true"]')) return;
      const target = event.target;
      if (!(target instanceof Element) || ignoresSwipe(target)) return;
      const touch = event.touches[0], width = document.documentElement.clientWidth;
      if (touch.clientX <= sectionSwipeEdge || touch.clientX >= width - sectionSwipeEdge) return;
      tracking = true; startX = lastX = touch.clientX; startY = touch.clientY; lastAt = event.timeStamp; velocityX = 0;
    };
    const move = (event: TouchEvent) => {
      if (!tracking || event.touches.length !== 1) { tracking = false; clearFeedback(); return; }
      const touch = event.touches[0], dx = touch.clientX - startX, dy = touch.clientY - startY;
      if (intent === "pending") intent = sectionSwipeIntent(dx, dy);
      if (intent === "vertical") { tracking = false; clearFeedback(); return; }
      if (intent !== "horizontal") return;
      event.preventDefault();
      const elapsed = Math.max(1, event.timeStamp - lastAt);
      velocityX = (touch.clientX - lastX) / elapsed; lastX = touch.clientX; lastAt = event.timeStamp;
      const blocked = (dx > 0 && index === 0) || (dx < 0 && index === sections.length - 1);
      const progress = Math.max(-1, Math.min(1, dx / document.documentElement.clientWidth)) * (blocked ? .28 : 1);
      feedback?.setAttribute("data-section-swiping", "");
      feedback?.style.setProperty("--section-swipe-progress", progress.toString());
    };
    const end = (event: TouchEvent) => {
      if (!tracking) { clearFeedback(); return; }
      tracking = false;
      const dx = (event.changedTouches[0]?.clientX ?? lastX) - startX, wasHorizontal = intent === "horizontal";
      clearFeedback();
      if (!wasHorizontal) return;
      if (Math.abs(dx) > 12) suppressClickUntil = Date.now() + 450;
      const target = sectionSwipeStep({ dx, velocityX, width: document.documentElement.clientWidth, index, count: sections.length });
      if (target === null) return;
      changing = true; changeSection(sections[target]); changing = false;
    };
    const cancel = () => { tracking = false; intent = "pending"; clearFeedback(); };
    const click = (event: MouseEvent) => {
      if (!changing && Date.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); }
    };
    root.addEventListener("touchstart", start, { passive: true });
    root.addEventListener("touchmove", move, { passive: false });
    root.addEventListener("touchend", end, { passive: true });
    root.addEventListener("touchcancel", cancel, { passive: true });
    root.addEventListener("click", click, true);
    return () => {
      feedback?.removeAttribute("data-section-swipe-feedback");
      root.removeEventListener("touchstart", start); root.removeEventListener("touchmove", move); root.removeEventListener("touchend", end); root.removeEventListener("touchcancel", cancel); root.removeEventListener("click", click, true); clearFeedback();
    };
  }, [active, enabled, feedbackRef, ignoreSelector, interactiveSurfaceSelector, rootRef, sections]);
}
