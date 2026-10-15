"use client";

import { useCallback, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import { clientCacheScope, clientDataChanged } from "@/lib/client-data-cache";

const values = new Map<string, unknown>();
const changed = "eo:view-state-changed";
export function clearRememberedViews() {
  values.clear();
  try { for (let index = sessionStorage.length - 1; index >= 0; index--) { const key = sessionStorage.key(index); if (key?.startsWith("eo:view:")) sessionStorage.removeItem(key); } } catch { /* unavailable storage */ }
}
function subscribe(listener: () => void) {
  window.addEventListener(changed, listener); window.addEventListener(clientDataChanged, listener);
  return () => { window.removeEventListener(changed, listener); window.removeEventListener(clientDataChanged, listener); };
}

/** Small view preferences only, never editors, passwords or record contents. */
export function useRememberedState<T>(name: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const [fallback, setFallback] = useState(initial);
  const server = useCallback(() => fallback, [fallback]);
  const key = useCallback(() => `eo:view:${JSON.stringify([clientCacheScope(), window.location.pathname, name, window.location.search])}`, [name]);
  const read = useCallback(() => {
    if (!clientCacheScope()) return fallback;
    const name = key();
    if (!values.has(name)) {
      let value = fallback;
      try {
        const stored = sessionStorage.getItem(name);
        if (stored !== null) {
          const parsed: unknown = JSON.parse(stored);
          if (fallback === null ? parsed === null || typeof parsed === "string" : typeof parsed === typeof fallback) value = parsed as T;
        }
      } catch { /* unavailable or corrupt preference */ }
      values.set(name, value);
    }
    return values.get(name) as T;
  }, [fallback, key]);
  const value = useSyncExternalStore(subscribe, read, server);
  const setValue = useCallback<Dispatch<SetStateAction<T>>>(next => {
    const updated = typeof next === "function" ? (next as (previous: T) => T)(read()) : next;
    if (!clientCacheScope()) { setFallback(() => updated); }
    else {
      const name = key(); values.set(name, updated);
      try { sessionStorage.setItem(name, JSON.stringify(updated)); } catch { /* memory remains usable */ }
    }
    window.dispatchEvent(new Event(changed));
  }, [key, read]);
  return [value, setValue];
}
