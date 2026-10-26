"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { dataChangedDomains, dataChangedEvent } from "@/lib/data-changed";
import { createPageFreshness, isAppDataMutation } from "@/lib/page-navigation";
import { invalidateHomeCache } from "@/lib/home-cache";
import { affectsData, dataDomain } from "@/lib/cache-policy";
import { cachedClientFetch, clientChangeAffects, clientDataChanged, configureClientCache, invalidateClientData, isClientDataStorageKey } from "@/lib/client-data-cache";
import { clearClientJsonCache } from "@/lib/client-json-cache";
import { useBackScrollRestoration } from "./use-back-scroll-restoration";

/** Server-owned Home Due cards; the timeline refetches its own client cache. */
export function DataChangeReconciler({ cacheScope }: { cacheScope: string | null }) {
  const pathname = usePathname(), router = useRouter();
  const search = useSearchParams().toString();
  useBackScrollRestoration(`${pathname}${search ? `?${search}` : ""}`);
  const freshness = useRef(createPageFreshness());
  const previousUrl = useRef<string | null>(null);
  useEffect(() => {
    const url = `${pathname}${search ? `?${search}` : ""}`;
    if (previousUrl.current === url) return;
    previousUrl.current = url;
    // Merge fresh server data in place; never destroy filters, drafts or scroll.
    if (freshness.current.visit(url)) router.refresh();
  }, [pathname, search, router]);
  useLayoutEffect(() => {
    configureClientCache(cacheScope);
    const original = window.fetch;
    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout>;
    const invalidate = (domains: string[]) => {
      invalidateClientData(domains);
    };
    const wrapped: typeof fetch = async (input, init) => {
      const mutation = isAppDataMutation(input, init, window.location.origin);
      const response = await cachedClientFetch(input, init, original.bind(window), window.location.origin);
      if (active && mutation && response.ok) {
        const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin);
        invalidate(url.pathname.startsWith("/api/") ? [dataDomain(url.pathname)] : ["*"]);
      }
      return response;
    };
    window.fetch = wrapped;
    const synced = (event: Event) => {
      const domains = dataChangedDomains((event as CustomEvent).detail).map(domain => domain === "reminders" ? "notifications" : domain);
      if (domains.length) invalidate(domains);
    };
    const storage = (event: StorageEvent) => {
      if (!isClientDataStorageKey(event.key)) return;
      window.dispatchEvent(new CustomEvent(clientDataChanged, { detail: { domains: ["*"], reason: "invalidate" } }));
    };
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ reason: string; domains: string[] }>).detail;
      if (detail?.reason !== "invalidate") return;
      freshness.current.invalidate(url => affectsData(url, detail.domains));
      clearClientJsonCache();
      if (affectsData("/", detail.domains)) invalidateHomeCache();
      if (!clientChangeAffects(window.location.pathname, event)) return;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => { freshness.current.visit(window.location.pathname + window.location.search); router.refresh(); }, 100);
    };
    let lastActive = Date.now();
    const visible = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastActive < 30_000) return;
      lastActive = Date.now(); invalidate(["*"]);
    };
    const online = () => { if (document.visibilityState === "visible") invalidate(["*"]); };
    window.addEventListener(dataChangedEvent, synced);
    window.addEventListener("storage", storage);
    window.addEventListener(clientDataChanged, changed);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", online);
    return () => {
      active = false;
      clearTimeout(refreshTimer);
      if (window.fetch === wrapped) window.fetch = original;
      window.removeEventListener(dataChangedEvent, synced);
      window.removeEventListener("storage", storage);
      window.removeEventListener(clientDataChanged, changed);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", online);
    };
  }, [cacheScope, router]);
  useEffect(() => {
    const prefetched = new Set<string>();
    const intent = (event: Event) => {
      const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.origin);
      if (url.origin !== window.location.origin || /^\/(api|login|oauth|native)(\/|$)/.test(url.pathname) || url.pathname === window.location.pathname && url.search === window.location.search) return;
      const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
      const href = url.pathname + url.search;
      if (connection?.saveData || !navigator.onLine || prefetched.has(href) || prefetched.size >= 8) return;
      prefetched.add(href); router.prefetch(href);
    };
    document.addEventListener("pointerover", intent, { passive: true });
    document.addEventListener("pointerdown", intent, { passive: true });
    document.addEventListener("focusin", intent);
    return () => { document.removeEventListener("pointerover", intent); document.removeEventListener("pointerdown", intent); document.removeEventListener("focusin", intent); };
  }, [router]);
  return null;
}
