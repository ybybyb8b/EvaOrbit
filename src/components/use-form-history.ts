"use client";

import { useEffect, useState } from "react";
import { uniqueInputValues } from "@/lib/form-input";

// Optional, bounded history from existing APIs. Failure never blocks manual entry.
export function useFormHistory(url: string | null, recordPath?: string) {
  const [history, setHistory] = useState<{ url: string; records: Record<string, unknown>[] }>({ url: "", records: [] });
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    void fetch(url, { signal: controller.signal, cache: "no-store" }).then(async response => {
      if (!response.ok) return;
      const body: unknown = await response.json();
      const data = recordPath && body && typeof body === "object" ? (body as Record<string, unknown>)[recordPath] : body;
      if (Array.isArray(data)) setHistory({ url, records: data.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null) });
    }).catch(() => { /* Keep free input available. */ });
    return () => controller.abort();
  }, [url, recordPath]);
  return url === history.url ? history.records : [];
}

export function historyValues(records: readonly Record<string, unknown>[], key: string) {
  return uniqueInputValues(records.flatMap(record => {
    const value = key.split(".").reduce<unknown>((current, part) => current && typeof current === "object" ? (current as Record<string, unknown>)[part] : undefined, record);
    return typeof value === "string" ? [value] : Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  }));
}
