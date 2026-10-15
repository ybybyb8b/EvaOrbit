"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { dataChangedDomains, dataChangedEvent, subscribeDataChanged } from "@/lib/data-changed";
import { createPageFreshness, isAppDataMutation } from "@/lib/page-navigation";
import { invalidateHomeCache } from "@/lib/home-cache";

/** Server-owned Home Due cards; the timeline refetches its own client cache. */
export function DataChangeReconciler() {
  const pathname = usePathname(), router = useRouter();
  const search = useSearchParams().toString();
  const freshness = useRef(createPageFreshness());
  const previousUrl = useRef<string | null>(null);
  useEffect(() => {
    const url = `${pathname}${search ? `?${search}` : ""}`;
    if (previousUrl.current === url) return;
    previousUrl.current = url;
    // Client-owned list caches need a fresh mount after a write. Plain browsing
    // keeps the router's fast back/forward cache, with no document reload.
    if (freshness.current.visit(url)) window.location.reload();
  }, [pathname, search]);
  useEffect(() => {
    const original = window.fetch;
    let active = true;
    const wrapped: typeof fetch = async (input, init) => {
      const mutation = isAppDataMutation(input, init, window.location.origin);
      const response = await original.call(window, input, init);
      if (active && mutation && response.ok) { freshness.current.invalidate(); invalidateHomeCache(); }
      return response;
    };
    window.fetch = wrapped;
    const synced = (event: Event) => {
      if (dataChangedDomains((event as CustomEvent).detail).length) { freshness.current.invalidate(); invalidateHomeCache(); }
    };
    window.addEventListener(dataChangedEvent, synced);
    return () => {
      active = false;
      if (window.fetch === wrapped) window.fetch = original;
      window.removeEventListener(dataChangedEvent, synced);
    };
  }, []);
  useEffect(() => {
    if (pathname !== "/") return;
    return subscribeDataChanged(["tasks", "reminders"], () => router.refresh());
  }, [pathname, router]);
  return null;
}
