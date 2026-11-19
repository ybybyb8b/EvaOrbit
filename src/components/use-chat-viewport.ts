"use client";

import {useLayoutEffect,type RefObject} from "react";

export function useChatViewport(container:RefObject<HTMLElement|null>,input:RefObject<HTMLTextAreaElement|null>,scroll:RefObject<HTMLDivElement|null>,followBottom:RefObject<boolean>) {
  useLayoutEffect(() => {
    const chat = container.current;
    const surface = chat?.parentElement;
    const composer = input.current;
    const pane = scroll.current;
    if (!chat || !surface || !composer || !pane) return;

    const viewport = window.visualViewport;
    const coarsePointer = window.matchMedia("(any-pointer: coarse)");
    let width = window.innerWidth;
    let fullHeight = window.innerHeight;
    let keyboardOpen = false;
    let frame = 0;

    const pinLatest = () => { if (followBottom.current) pane.scrollTop = pane.scrollHeight; };
    const fit = () => {
      frame = 0;
      if (document.hidden) return;
      const touchViewport = coarsePointer.matches && Math.abs((viewport?.scale ?? 1) - 1) < .05;
      const visibleHeight = touchViewport ? viewport?.height ?? window.innerHeight : window.innerHeight;
      if (visibleHeight <= 0) return;

      if (width !== window.innerWidth) {
        width = window.innerWidth;
        fullHeight = window.innerHeight;
        keyboardOpen = false;
      }
      const editing = document.activeElement === composer;
      const heightLost = Math.max(fullHeight, window.innerHeight) - visibleHeight;
      keyboardOpen = touchViewport && (editing || keyboardOpen) && heightLost > (keyboardOpen ? 8 : 48);
      if (!editing && !keyboardOpen) fullHeight = Math.max(window.innerHeight, visibleHeight);

      // The touch surface is fixed to the layout viewport. VisualViewport offsets
      // are relative to that viewport, independent of focus-driven document scroll.
      const top = touchViewport ? Math.max(0, viewport?.offsetTop ?? 0) : 0;
      const surfaceTop = coarsePointer.matches ? 0 : Math.max(0, surface.getBoundingClientRect().top);
      surface.style.setProperty("--parlor-wallpaper-height", `${Math.ceil(Math.max(fullHeight, top + visibleHeight) - surfaceTop)}px`);
      chat.style.setProperty("--parlor-screen-inset", `${Math.round(top)}px`);
      chat.style.setProperty("--parlor-chat-height", `${Math.max(0, Math.floor(visibleHeight - surfaceTop))}px`);
      chat.setAttribute("data-keyboard-open", String(keyboardOpen));
      pinLatest();
    };
    const scheduleFit = () => { if (!frame) frame = requestAnimationFrame(fit); };
    const observer = new ResizeObserver(pinLatest);
    observer.observe(pane);
    const windowEvents = ["resize", "pageshow", "evaorbit:native-active"] as const;
    for (const event of windowEvents) window.addEventListener(event, scheduleFit);
    document.addEventListener("visibilitychange", scheduleFit);
    composer.addEventListener("focus", scheduleFit);
    composer.addEventListener("blur", scheduleFit);
    viewport?.addEventListener("resize", scheduleFit);
    viewport?.addEventListener("scroll", scheduleFit);
    fit();

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      for (const event of windowEvents) window.removeEventListener(event, scheduleFit);
      document.removeEventListener("visibilitychange", scheduleFit);
      composer.removeEventListener("focus", scheduleFit);
      composer.removeEventListener("blur", scheduleFit);
      viewport?.removeEventListener("resize", scheduleFit);
      viewport?.removeEventListener("scroll", scheduleFit);
      surface.style.removeProperty("--parlor-wallpaper-height");
    };
  }, [container, input, scroll, followBottom]);
}
