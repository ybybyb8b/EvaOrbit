"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useLocale } from "./locale-controller";
import { translateUiCopy } from "@/lib/ui-copy";

type LogOptions = {
  label?: string;
  disabled?: boolean;
  onClick?: () => void;
  selectedDate?: string;
  onSaved?: () => Promise<void>;
  picker?: "tracker" | "inbox" | "drink";
};
type Registration = LogOptions & { pathname: string };
const BottomLogContext = createContext<{
  action: Registration | null;
  register: (action: Registration) => () => void;
} | null>(null);

export function BottomLogProvider({ children }: { children: ReactNode }) {
  const [action, setAction] = useState<Registration | null>(null);
  const register = useCallback((next: Registration) => {
    setAction(next);
    return () => setAction(current => current === next ? null : current);
  }, []);
  return <BottomLogContext.Provider value={{ action, register }}>{children}</BottomLogContext.Provider>;
}

export function useBottomLog() {
  const context = useContext(BottomLogContext);
  const pathname = usePathname();
  return context?.action?.pathname === pathname ? context.action : null;
}

// Page-owned forms keep their current date, selection, validation and refresh behavior.
export function useBottomLogAction(options: LogOptions) {
  const register = useContext(BottomLogContext)?.register;
  const pathname = usePathname();
  const latest = useRef(options);
  useLayoutEffect(() => { latest.current = options; });
  const { label, selectedDate, picker, disabled } = options;
  const hasClick = Boolean(options.onClick), hasSaved = Boolean(options.onSaved);
  useEffect(() => register?.({
    pathname, label, selectedDate, picker, disabled,
    onClick: hasClick ? () => latest.current.onClick?.() : undefined,
    onSaved: hasSaved ? async () => { await latest.current.onSaved?.(); } : undefined,
  }), [register, pathname, label, selectedDate, picker, disabled, hasClick, hasSaved]);
}

export function BottomLogScope(options: LogOptions) {
  const { language } = useLocale();
  useBottomLogAction({ ...options, label: options.label ? translateUiCopy(options.label, language) : undefined });
  return null;
}

export function PageLogAction({ label, onClick, children, className = "button primary", disabled = false }: {
  label: string; onClick: () => void; children: ReactNode; className?: string; disabled?: boolean;
}) {
  const { language } = useLocale();
  useBottomLogAction({ label: translateUiCopy(label, language), onClick, disabled });
  return <button type="button" className={`${className} page-log-action`} onClick={onClick} disabled={disabled}>{children}</button>;
}
