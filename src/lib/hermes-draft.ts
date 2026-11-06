"use client";

import { useRef, useSyncExternalStore } from "react";

const changed = "eo:hermes-draft";
const empty = "";
type DraftKind = "chat" | "note" | "answer";

function subscribe(listener: () => void) {
  window.addEventListener(changed, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(changed, listener);
    window.removeEventListener("storage", listener);
  };
}

function draftKey(scope: string, conversationId: string | undefined, kind: DraftKind) {
  return `eo:hermes-draft:${encodeURIComponent(scope)}:${conversationId ?? "new"}:${kind}`;
}

export function readHermesDraft(scope: string | null, conversationId: string | undefined, kind: DraftKind) {
  if (!scope) return empty;
  try { return window.localStorage.getItem(draftKey(scope, conversationId, kind)) ?? empty; }
  catch { return empty; }
}

export function useHermesDraft(scope: string | null, conversationId: string | undefined, kind: DraftKind) {
  const memory = useRef(new Map<string, string>());
  const key = draftKey(scope ?? "", conversationId, kind);
  const value = useSyncExternalStore(subscribe, () => memory.current.get(key) ?? readHermesDraft(scope, conversationId, kind), () => empty);

  function write(next: string, target = conversationId, expected?: string) {
    const targetKey = draftKey(scope ?? "", target, kind);
    if (expected !== undefined && (memory.current.get(targetKey) ?? readHermesDraft(scope, target, kind)) !== expected) return;
    try {
      if (!scope) throw new Error("Account storage unavailable");
      if (next) window.localStorage.setItem(targetKey, next);
      else window.localStorage.removeItem(targetKey);
      memory.current.delete(targetKey);
    } catch {
      memory.current.set(targetKey, next);
    }
    window.dispatchEvent(new Event(changed));
  }
  return [value, write] as const;
}
