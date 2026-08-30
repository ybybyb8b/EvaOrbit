"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

type FormSheetProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  formId?: string;
  submitLabel?: string;
  busyLabel?: string;
  busy?: boolean;
  cancelLabel?: string;
};

export function FormSheet({
  title,
  onClose,
  children,
  formId,
  submitLabel,
  busyLabel = "Saving…",
  busy = false,
  cancelLabel = "Cancel",
}: FormSheetProps) {
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);

  useEffect(() => {
    closeRef.current = onClose;
    busyRef.current = busy;
  }, [busy, onClose]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;

    const updateViewport = () => {
      const viewport = window.visualViewport;
      const layer = panelRef.current;
      if (!layer) return;
      layer.style.setProperty("--form-sheet-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
      layer.style.setProperty("--form-sheet-viewport-width", `${viewport?.width ?? window.innerWidth}px`);
      layer.style.setProperty("--form-sheet-viewport-top", `${viewport?.offsetTop ?? 0}px`);
      layer.style.setProperty("--form-sheet-viewport-left", `${viewport?.offsetLeft ?? 0}px`);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) closeRef.current();
    };
    updateViewport();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("scroll", updateViewport);
    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("scroll", updateViewport);
    };
  }, [mounted]);

  if (!mounted) return null;

  return createPortal(
    <div className="form-sheet-layer" role="presentation" ref={panelRef}>
      <button className="form-sheet-backdrop" type="button" aria-label={`Close ${title}`} onClick={() => { if (!busy) onClose(); }} />
      <div className="form-sheet-panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="form-sheet-header">
          <h2 id={titleId}>{title}</h2>
          <button className="text-button" type="button" onClick={onClose} disabled={busy}>Close</button>
        </header>
        <div
          className="form-sheet-body"
          ref={bodyRef}
          onFocusCapture={(event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;
            window.setTimeout(() => target.scrollIntoView({ block: "nearest", behavior: "smooth" }), 120);
          }}
        >
          {children}
        </div>
        {submitLabel && <footer className="form-sheet-footer">
          <button className="button secondary" type="button" onClick={onClose} disabled={busy}>{cancelLabel}</button>
          <button className="button primary" type={formId ? "submit" : "button"} form={formId} onClick={formId ? undefined : () => bodyRef.current?.querySelector("form")?.requestSubmit()} disabled={busy}>{busy ? busyLabel : submitLabel}</button>
        </footer>}
      </div>
    </div>,
    document.body,
  );
}
