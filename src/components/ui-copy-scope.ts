"use client";

import { useLayoutEffect, useRef } from "react";

/** Opt legacy UI copy into DOM translation only after its React tree has committed. */
export function useUiCopyScope<T extends HTMLElement>(translatePage = true) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const root = translatePage ? element.closest<HTMLElement>(".page") ?? element : element;
    root.dataset.uiCopyReady = "true";
    window.dispatchEvent(new CustomEvent("evaorbit:ui-copy-ready", { detail: { root } }));
    return () => { delete root.dataset.uiCopyReady; };
  });
  return ref;
}
