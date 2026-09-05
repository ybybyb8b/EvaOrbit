"use client";

import { type ReactNode, type TransitionEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "@/components/locale-controller";
import { translateUiCopy } from "@/lib/ui-copy";

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

type FormSheetPhase = "opening" | "open" | "closing" | "closed";
const FORM_SHEET_CLOSE_FALLBACK_MS = 240;

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
  const { language } = useLocale();
  const copy = (value: string) => translateUiCopy(value, language);
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<FormSheetPhase>("opening");
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  const phaseRef = useRef<FormSheetPhase>("opening");

  useEffect(() => {
    closeRef.current = onClose;
    busyRef.current = busy;
  }, [busy, onClose]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!mounted || phase !== "opening") return;
    const frame = window.requestAnimationFrame(() => {
      if (phaseRef.current !== "opening") return;
      phaseRef.current = "open";
      setPhase("open");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mounted, phase]);

  const finishClose = useCallback(() => {
    if (phaseRef.current !== "closing") return;
    phaseRef.current = "closed";
    setPhase("closed");
    setMounted(false);
    closeRef.current();
  }, []);

  const requestClose = useCallback(() => {
    if (busyRef.current || phaseRef.current === "closing" || phaseRef.current === "closed") return;
    phaseRef.current = "closing";
    setPhase("closing");
  }, []);

  useEffect(() => {
    if (phase !== "closing") return;
    const fallback = window.setTimeout(finishClose, FORM_SHEET_CLOSE_FALLBACK_MS);
    return () => window.clearTimeout(fallback);
  }, [finishClose, phase]);

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
      if (event.key === "Escape") requestClose();
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
  }, [mounted, requestClose]);

  if (!mounted || phase === "closed") return null;

  const finishCloseOnTransition = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || (event.propertyName !== "transform" && event.propertyName !== "opacity")) return;
    finishClose();
  };

  return createPortal(
    <div className="form-sheet-layer" data-state={phase} role="presentation" ref={panelRef}>
      <button className="form-sheet-backdrop" type="button" aria-label={`${copy("Close")} ${copy(title)}`} onClick={requestClose} />
      <div className="form-sheet-panel" role="dialog" aria-modal="true" aria-labelledby={titleId} onTransitionEnd={finishCloseOnTransition}>
        <header className="form-sheet-header">
          <h2 id={titleId}>{copy(title)}</h2>
          <button className="text-button" type="button" onClick={requestClose} disabled={busy}>{copy("Close")}</button>
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
          <button className="button secondary" type="button" onClick={requestClose} disabled={busy}>{copy(cancelLabel)}</button>
          <button className="button primary" type={formId ? "submit" : "button"} form={formId} onClick={formId ? undefined : () => bodyRef.current?.querySelector("form")?.requestSubmit()} disabled={busy}>{copy(busy ? busyLabel : submitLabel)}</button>
        </footer>}
      </div>
    </div>,
    document.body,
  );
}
