"use client";

import { useEffect, useRef, useState } from "react";

/** Native Back can restore too early while an API-owned list is still short. */
export function useBackScrollRestoration(url: string) {
  const positions = useRef(new Map<string, number>());
  const pending = useRef<{ url: string; top: number } | null>(null);
  const leaving = useRef<string | null>(null);
  const [request, setRequest] = useState<{ url: string; top: number } | null>(null);
  useEffect(() => {
    const current = () => window.location.pathname + window.location.search;
    const save = () => { if (!pending.current && leaving.current !== current()) positions.current.set(current(), window.scrollY); };
    const back = () => { const destination = { url: current(), top: positions.current.get(current()) ?? 0 }; pending.current = destination; setRequest(destination); };
    const cancel = () => { pending.current = null; };
    const navigate = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.origin !== window.location.origin || link.target || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      if (link.pathname + link.search === current()) return;
      positions.current.set(current(), window.scrollY); leaving.current = current(); cancel();
    };
    window.addEventListener("scroll", save, { passive: true });
    window.addEventListener("popstate", back);
    window.addEventListener("wheel", cancel, { passive: true });
    window.addEventListener("touchstart", cancel, { passive: true });
    window.addEventListener("pointerdown", cancel, { passive: true });
    window.addEventListener("keydown", cancel);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("scroll", save); window.removeEventListener("popstate", back);
      window.removeEventListener("wheel", cancel); window.removeEventListener("touchstart", cancel);
      window.removeEventListener("pointerdown", cancel); window.removeEventListener("keydown", cancel);
      document.removeEventListener("click", navigate, true);
    };
  }, []);
  useEffect(() => {
    leaving.current = null;
    const destination = request;
    if (!destination || destination.url !== url || pending.current !== destination) return;
    let frame = 0;
    const restore = () => {
      if (pending.current !== destination) return;
      if (document.documentElement.scrollHeight - window.innerHeight < destination.top) return;
      window.scrollTo({ top: destination.top, behavior: "instant" });
      pending.current = null;
    };
    const observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(restore); });
    observer.observe(document.body);
    frame = requestAnimationFrame(restore);
    const timeout = window.setTimeout(() => { if (pending.current === destination) pending.current = null; observer.disconnect(); }, 5000);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.clearTimeout(timeout); };
  }, [url, request]);
}
