"use client";
import {useLayoutEffect,type RefObject} from "react";
const nativeActive="evaorbit:native-active";
// Shared chat keyboard fit and pin-to-bottom behavior.
export function useChatViewport(container:RefObject<HTMLElement|null>,input:RefObject<HTMLTextAreaElement|null>,scroll:RefObject<HTMLDivElement|null>,followBottom:RefObject<boolean>){
  useLayoutEffect(() => {
    const element = container.current;
    const surface = element?.parentElement;
    const composerInput = input.current;
    const pane = scroll.current;
    if (!element || !surface || !composerInput || !pane) return;
    const viewport = window.visualViewport;
    const coarsePointer = window.matchMedia("(any-pointer: coarse)");
    let fullHeight = window.visualViewport?.height ?? window.innerHeight;
    let layoutWidth = window.innerWidth;
    let keyboardOpen = false;
    let frame = 0;
    let settleTimer: number | undefined;
    let lastEdit = -Infinity;
    let fitted: { inset: number; height: number } | undefined;
    const markEdit = () => { lastEdit = performance.now(); };
    const pinLatest = () => { if (followBottom.current) pane.scrollTop = pane.scrollHeight; };
    const fit = () => {
      frame = 0;
      window.clearTimeout(settleTimer);
      const unzoomed = Math.abs((viewport?.scale ?? 1) - 1) < .05;
      const visibleHeight = unzoomed ? viewport?.height ?? window.innerHeight : window.innerHeight;
      if (document.hidden || visibleHeight <= 0) return;
      const widthChanged = layoutWidth !== window.innerWidth;
      if (widthChanged) {
        layoutWidth = window.innerWidth;
        fullHeight = window.innerHeight;
      }
      const touchViewport = unzoomed && coarsePointer.matches;
      const editing = document.activeElement === composerInput;
      const wasKeyboardOpen = keyboardOpen;
      keyboardOpen = touchViewport && (editing || keyboardOpen) &&
        Math.max(fullHeight, window.innerHeight) - visibleHeight > (keyboardOpen ? 8 : 48);
      if (!keyboardOpen && unzoomed) fullHeight = visibleHeight;
      if (!fitted || keyboardOpen !== wasKeyboardOpen) element.setAttribute("data-keyboard-open", String(keyboardOpen));

      // Use the visible top and the surface's bounds in the same coordinate
      // space so document scrolling and visual viewport panning don't add up twice.
      const visibleTop = touchViewport && viewport ? Math.max(0, viewport.pageTop - window.scrollY) : 0;
      const surfaceTop = surface.getBoundingClientRect().top;
      const inset = touchViewport ? Math.max(0, Math.round(visibleTop - surfaceTop)) : 0;
      const height = Math.max(0, Math.floor(visibleHeight - Math.max(0, surfaceTop - visibleTop)));
      if (fitted && keyboardOpen && wasKeyboardOpen && !widthChanged) {
        const bottomChange = inset + height - fitted.inset - fitted.height;
        // The 4px keyboard gap absorbs 2px of jitter in either direction.
        if (Math.abs(bottomChange) <= 2 && Math.abs(inset - fitted.inset) <= 2) return;
        // Candidate updates can briefly report extra space while typing or deleting.
        // Move immediately when space shrinks so the keyboard can't cover the input.
        const remaining = 80 - (performance.now() - lastEdit);
        if (editing && bottomChange > 0 && remaining > 0) {
          settleTimer = window.setTimeout(scheduleFit, remaining);
          return;
        }
      }
      surface.style.setProperty("--parlor-wallpaper-height", `${fullHeight}px`);
      if (fitted?.inset === inset && fitted.height === height && keyboardOpen === wasKeyboardOpen) return;
      fitted = { inset, height };
      surface.style.setProperty("--parlor-screen-inset", `${inset}px`);
      element.style.setProperty("--parlor-chat-height", `${height}px`);
      pinLatest();
    };
    const scheduleFit = () => { if (!frame) frame = requestAnimationFrame(fit); };
    const observer = new ResizeObserver(pinLatest);
    observer.observe(pane);
    fit();
    composerInput.addEventListener("focus", scheduleFit);
    composerInput.addEventListener("blur", scheduleFit);
    composerInput.addEventListener("beforeinput", markEdit);
    composerInput.addEventListener("compositionupdate", markEdit);
    window.addEventListener("resize", scheduleFit);
    window.addEventListener("scroll", scheduleFit, { passive: true });
    window.addEventListener("pageshow", scheduleFit);
    window.addEventListener(nativeActive, scheduleFit);
    document.addEventListener("visibilitychange", scheduleFit);
    viewport?.addEventListener("resize", scheduleFit);
    viewport?.addEventListener("scroll", scheduleFit);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer);
      composerInput.removeEventListener("focus", scheduleFit);
      composerInput.removeEventListener("blur", scheduleFit);
      composerInput.removeEventListener("beforeinput", markEdit);
      composerInput.removeEventListener("compositionupdate", markEdit);
      window.removeEventListener("resize", scheduleFit);
      window.removeEventListener("scroll", scheduleFit);
      window.removeEventListener("pageshow", scheduleFit);
      window.removeEventListener(nativeActive, scheduleFit);
      document.removeEventListener("visibilitychange", scheduleFit);
      viewport?.removeEventListener("resize", scheduleFit);
      viewport?.removeEventListener("scroll", scheduleFit);
      surface.style.removeProperty("--parlor-wallpaper-height");
      surface.style.removeProperty("--parlor-screen-inset");
    };
  }, [container, input, scroll, followBottom]);
}
