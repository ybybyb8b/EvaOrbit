"use client";

import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { selectDropdownLayout } from "@/lib/select-dropdown-layout";

/** Native popovers escape sheet clipping while remaining inside its focus/dirty scope. */
export function SelectDropdown({ anchor, onClose, children, id, label, className = "" }: {
  anchor: RefObject<HTMLElement | null>; onClose: () => void; children: ReactNode; id: string; label: string; className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useLayoutEffect(() => { close.current = onClose; });
  useLayoutEffect(() => {
    const element = panel.current;
    const field = anchor.current;
    if (!element || !field) return;
    function position() {
      if (!element || !field) return;
      const rect = field.getBoundingClientRect();
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft ?? 0;
      const top = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? window.innerWidth;
      const layout = selectDropdownLayout(rect, { left, top, width, height: viewport?.height ?? window.innerHeight }, element.scrollHeight);
      element.style.width = `${layout.width}px`;
      element.style.left = `${layout.left}px`;
      element.style.maxHeight = `${layout.maxHeight}px`;
      element.style.top = `${layout.top}px`;
    }
    element.showPopover();
    position();
    const resize = new ResizeObserver(position);
    resize.observe(field);
    resize.observe(element);
    const outside = (event: PointerEvent) => {
      if (!element.contains(event.target as Node) && !field.contains(event.target as Node)) close.current();
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);
    window.visualViewport?.addEventListener("resize", position);
    window.visualViewport?.addEventListener("scroll", position);
    return () => {
      element.hidePopover();
      resize.disconnect();
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("scroll", position, true);
      window.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("scroll", position);
    };
  }, [anchor]);
  return <div ref={panel} popover="manual" id={id} className={`eo-select-dropdown ${className}`} aria-label={label} onKeyDown={event => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); anchor.current?.querySelector<HTMLElement>("input,summary")?.focus({ preventScroll: true }); }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not([disabled])"));
      const index = options.indexOf(document.activeElement as HTMLButtonElement);
      const next = index < 0 ? (event.key === "ArrowDown" ? 0 : options.length - 1) : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
      options[next]?.focus({ preventScroll: true });
      options[next]?.scrollIntoView({ block: "nearest" });
    }
  }}>{children}</div>;
}
