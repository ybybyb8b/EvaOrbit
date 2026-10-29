"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { installUiCopyBridge } from "@/lib/locale-runtime";
import { DESIGN_THEME_STORAGE_KEY, LEGACY_HOME_STYLE_STORAGE_KEY } from "@/lib/theme-runtime";
import type { UiLanguage } from "@/lib/locale";
import type { ChineseFont, EnglishFont } from "@/lib/font-preferences";
import { applyAppearancePreferences, normalizeAppearancePreferences, storedAppearancePreferences, type AppearancePreferences } from "@/lib/appearance-preferences";

type LocaleContextValue = AppearancePreferences & {
  language: UiLanguage;
  english: boolean;
  loadFailed: boolean;
  setLanguage: (language: UiLanguage) => void;
  setFonts: (chineseFont: ChineseFont, englishFont: EnglishFont) => void;
  setPreferences: (value: AppearancePreferences) => void;
};
const LocaleContext = createContext<LocaleContextValue>({ ...normalizeAppearancePreferences(), language: "zh-CN", english: false, loadFailed: false, setLanguage: () => undefined, setFonts: () => undefined, setPreferences: () => undefined });

export function LocaleController({ children, localOnly = false, defaults }: { children: React.ReactNode; localOnly?: boolean; defaults?: Partial<AppearancePreferences> }) {
  const [preferences, setState] = useState(() => normalizeAppearancePreferences(defaults));
  const revision = useRef(0);
  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    const local = storedAppearancePreferences(defaults);
    let migrateLegacyVintage = false;
    try { migrateLegacyVintage = localStorage.getItem(DESIGN_THEME_STORAGE_KEY) !== "classic" && localStorage.getItem(LEGACY_HOME_STYLE_STORAGE_KEY) === "vintage"; } catch { /* Storage is optional. */ }
    applyAppearancePreferences(local, false);
    const expectedRevision = revision.current;
    queueMicrotask(() => { if (alive && revision.current === expectedRevision) setState(local); });
    if (!localOnly) fetch("/api/preferences/appearance", { cache: "no-store" })
      .then(async response => { if (!response.ok) throw new Error("Preferences unavailable"); return response.json(); })
      .then(value => {
        if (!value || !alive || revision.current !== expectedRevision) return;
        const next = normalizeAppearancePreferences({ ...value, ...(migrateLegacyVintage ? { designTheme: local.designTheme } : {}) });
        setState(next);
        try { applyAppearancePreferences(next); } catch { /* Cloud preferences remain usable without browser persistence. */ }
      }).catch(() => { if (alive && revision.current === expectedRevision) setLoadFailed(true); });
    return () => { alive = false; };
  }, [localOnly, defaults]);
  useEffect(() => installUiCopyBridge(preferences.uiLanguage), [preferences.uiLanguage]);

  const value = useMemo<LocaleContextValue>(() => {
    const setPreferences = (next: AppearancePreferences) => {
      revision.current += 1;
      setLoadFailed(false);
      setState(next);
      applyAppearancePreferences(next);
      try { localStorage.removeItem(LEGACY_HOME_STYLE_STORAGE_KEY); } catch { /* Storage is optional. */ }
    };
    return { ...preferences, language: preferences.uiLanguage, english: preferences.uiLanguage === "en", loadFailed, setPreferences,
      setLanguage: uiLanguage => setPreferences({ ...preferences, uiLanguage }),
      setFonts: (chineseFont, englishFont) => setPreferences({ ...preferences, chineseFont, englishFont }),
    };
  }, [preferences, loadFailed]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
export function useLocale() { return useContext(LocaleContext); }
