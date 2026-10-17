"use client";

import { type ReactNode, type TransitionEvent, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "@/components/locale-controller";
import { translateUiCopy } from "@/lib/ui-copy";
import { SheetSuggestionTarget } from "./suggested-input";

type FormSheetProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  formId?: string;
  submitLabel?: string;
  busyLabel?: string;
  busy?: boolean;
  cancelLabel?: string;
  dirty?: boolean;
  submitDisabled?: boolean;
};

type FormSheetPhase = "opening" | "open" | "closing" | "closed";
const FORM_SHEET_CLOSE_FALLBACK_MS = 340;

export function scrollFormSheetField(body: HTMLElement | null, target: HTMLElement, alignStart = false) {
  if (!body || !body.contains(target)) return;
  const bounds = body.getBoundingClientRect(), field = target.getBoundingClientRect();
  const padding = getComputedStyle(body);
  const top = bounds.top + (parseFloat(padding.scrollPaddingTop) || 0);
  const bottom = bounds.bottom - (parseFloat(padding.scrollPaddingBottom) || 0);
  const delta = alignStart || field.top < top ? field.top - top : field.bottom > bottom ? field.bottom - bottom : 0;
  // Keep the fixed overlay and document still while revealing a field.
  if (delta) body.scrollTop += delta;
}

export function FormSheet({
  title,
  onClose,
  children,
  formId,
  submitLabel,
  busyLabel = "Saving…",
  busy = false,
  cancelLabel = "Cancel",
  dirty,
  submitDisabled = false,
}: FormSheetProps) {
  const { language } = useLocale();
  const copy = (value: string) => translateUiCopy(value, language);
  const [mounted, setMounted] = useState(false);
  const [suggestionTarget, setSuggestionTarget] = useState<HTMLDivElement | null>(null);
  const dirtyRef = useRef(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const discardRef = useRef(false);
  const [phase, setPhase] = useState<FormSheetPhase>("opening");
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const entryFocusRef = useRef<(() => void) | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  const phaseRef = useRef<FormSheetPhase>("opening");

  useEffect(() => {
    closeRef.current = onClose;
    busyRef.current = busy;
    if (dirty !== undefined) dirtyRef.current = dirty;
  }, [busy, dirty, onClose]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!mounted || phase !== "opening") return;
    let nextFrame = 0;
    const frame = window.requestAnimationFrame(() => {
      nextFrame = window.requestAnimationFrame(() => {
        if (phaseRef.current !== "opening") return;
        phaseRef.current = "open";
        setPhase("open");
      });
    });
    return () => { window.cancelAnimationFrame(frame); window.cancelAnimationFrame(nextFrame); };
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
    if (dirtyRef.current) {
      discardRef.current = true;
      setDiscardOpen(true);
      window.requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLButtonElement>(".form-sheet-discard-confirm button")?.focus());
      return;
    }
    phaseRef.current = "closing";
    setPhase("closing");
  }, []);

  useEffect(() => {
    if (phase !== "closing") return;
    const fallback = window.setTimeout(finishClose, FORM_SHEET_CLOSE_FALLBACK_MS);
    return () => window.clearTimeout(fallback);
  }, [finishClose, phase]);

  useLayoutEffect(() => {
    if (!mounted) return;
    const body = document.body;
    const dialog = dialogRef.current;
    const previousFocus = returnFocusRef.current;
    const inertSiblings = Array.from(body.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== panelRef.current)
      .map((element) => ({ element, inert: element.inert }));
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
    const getFocusable = () => dialog ? Array.from((discardRef.current ? dialog.querySelector(".form-sheet-discard-confirm") ?? dialog : dialog).querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
    )).filter((element) => !element.hidden && element.getClientRects().length > 0 && element.getAttribute("aria-hidden") !== "true") : [];
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (discardRef.current) { discardRef.current = false; setDiscardOpen(false); return; }
        requestClose();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = getFocusable();
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    inertSiblings.forEach(({ element }) => { element.inert = true; });
    updateViewport();
    entryFocusRef.current = () => {
      if (phaseRef.current !== "open") return;
      entryFocusRef.current = null;
      // Do not steal focus if the user has already started interacting.
      if (dialog?.contains(document.activeElement)) return;
      const initialFocus = dialog?.querySelector<HTMLElement>("[data-sheet-initial-focus]");
      if (initialFocus) {
        initialFocus.focus({ preventScroll: true });
        scrollFormSheetField(bodyRef.current, initialFocus, true);
        return;
      }
      if (window.matchMedia("(max-width: 720px)").matches) {
        dialog?.focus({ preventScroll: true });
        return;
      }
      const autoFocus = dialog?.querySelector<HTMLElement>("[autofocus]");
      const firstField = Array.from(dialog?.querySelectorAll<HTMLElement>("input:not([disabled]),select:not([disabled]),textarea:not([disabled])") ?? [])
        .find((element) => element.getClientRects().length > 0);
      const preferred = autoFocus?.getClientRects().length ? autoFocus : firstField ?? getFocusable()[0];
      (preferred ?? dialog)?.focus({ preventScroll: true });
    };
    // Transition events are not guaranteed (including reduced-motion mode).
    const focusFallback = window.setTimeout(() => entryFocusRef.current?.(), FORM_SHEET_CLOSE_FALLBACK_MS);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("scroll", updateViewport);
    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
      inertSiblings.forEach(({ element, inert }) => { element.inert = inert; });
      window.clearTimeout(focusFallback);
      entryFocusRef.current = null;
      previousFocus?.focus({ preventScroll: true });
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("scroll", updateViewport);
    };
  }, [mounted, requestClose]);

  if (!mounted || phase === "closed") return null;

  const finishCloseOnTransition = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.propertyName !== "transform" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (phaseRef.current === "open") { entryFocusRef.current?.(); return; }
    finishClose();
  };

  return createPortal(
    <div className="form-sheet-layer" data-state={phase} role="presentation" ref={panelRef}>
      <button className="form-sheet-backdrop" type="button" aria-label={`${language === "en" ? "Close" : "关闭"} ${copy(title)}`} onClick={requestClose} />
      <div className="form-sheet-panel" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onTransitionEnd={finishCloseOnTransition}
        onChangeCapture={event => { if (dirty === undefined && (!(event.target instanceof HTMLInputElement) || event.target.type !== "search")) dirtyRef.current = true; }}
        onClickCapture={event => { if (dirty === undefined && event.target instanceof Element && event.target.closest("[data-form-change]")) dirtyRef.current = true; }}
        onInvalidCapture={event => { if (event.target instanceof HTMLElement) scrollFormSheetField(bodyRef.current, event.target); }}>
        <header className="form-sheet-header">
          <h2 id={titleId}>{copy(title)}</h2>
          <button className="text-button" type="button" onClick={requestClose} disabled={busy || discardOpen}>{language === "en" ? "Close" : "关闭"}</button>
        </header>
        <div
          className="form-sheet-body"
          ref={bodyRef}
          inert={phase === "opening" || discardOpen || busy}
          onFocusCapture={(event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;
            window.setTimeout(() => { if (document.activeElement === target) scrollFormSheetField(bodyRef.current, target); }, 120);
          }}
        >
          <SheetSuggestionTarget.Provider value={suggestionTarget}>{children}</SheetSuggestionTarget.Provider>
        </div>
        <div className="form-sheet-recommendations" ref={setSuggestionTarget} hidden={discardOpen || busy} />
        {discardOpen ? <footer className="form-sheet-footer form-sheet-discard-confirm" role="group" aria-label={language === "en" ? "Unsaved changes" : "未保存的修改"}>
          <p role="alert">{language === "en" ? "Discard unsaved changes?" : "放弃尚未保存的修改？"}</p>
          <div><button className="button secondary" type="button" onClick={() => { discardRef.current = false; setDiscardOpen(false); dialogRef.current?.focus(); }}>{language === "en" ? "Keep editing" : "继续填写"}</button>
          <button className="button primary" type="button" onClick={() => { dirtyRef.current = false; discardRef.current = false; setDiscardOpen(false); requestClose(); }}>{language === "en" ? "Discard and close" : "放弃并关闭"}</button></div>
        </footer> : submitLabel && <footer className="form-sheet-footer">
          <button className="button secondary" type="button" onClick={requestClose} disabled={busy}>{copy(cancelLabel)}</button>
          <button className="button primary" type={formId ? "submit" : "button"} form={formId} onClick={formId ? undefined : () => bodyRef.current?.querySelector("form")?.requestSubmit()} disabled={busy || submitDisabled}>{copy(busy ? busyLabel : submitLabel)}</button>
        </footer>}
      </div>
    </div>,
    document.body,
  );
}
