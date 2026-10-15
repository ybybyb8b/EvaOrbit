"use client";

import { useEffect, useEffectEvent, useState, type Dispatch, type SetStateAction } from "react";
import { clientChangeAffects, clientDataChanged } from "@/lib/client-data-cache";

/** Re-read a client-owned view when a related background read or write changes it. */
export function useDataRefresh(path: string, refresh: () => void | Promise<unknown>) {
  const update = useEffectEvent(() => { void Promise.resolve(refresh()).catch(() => undefined); });
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const changed = (event: Event) => {
      if (!clientChangeAffects(path, event)) return;
      clearTimeout(timer); timer = setTimeout(update, 50);
    };
    window.addEventListener(clientDataChanged, changed);
    return () => { clearTimeout(timer); window.removeEventListener(clientDataChanged, changed); };
  }, [path]);
}

/** Refresh server-owned data without resetting filters or an editor's separate draft. */
export function useServerDataState<T>(initial: T, accept = true): [T, Dispatch<SetStateAction<T>>] {
  const [previous, setPrevious] = useState(initial);
  const [value, setValue] = useState(initial);
  if (previous !== initial) { setPrevious(initial); if (accept) setValue(initial); }
  return [value, setValue];
}
