"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { UiPreferences } from "@/lib/types";
import { DEFAULT_UI_LANGUAGE, type UiLanguage } from "@/lib/locale";
import { applyUiLanguage, storedUiLanguage } from "@/lib/locale-runtime";
import { DEFAULT_CHINESE_FONT, DEFAULT_ENGLISH_FONT, type ChineseFont, type EnglishFont } from "@/lib/font-preferences";
import { applyFonts, storedFonts } from "@/lib/font-runtime";

type LocaleContextValue = {
  language: UiLanguage;
  english: boolean;
  setLanguage: (language: UiLanguage) => void;
  chineseFont: ChineseFont;
  englishFont: EnglishFont;
  setFonts: (chineseFont: ChineseFont, englishFont: EnglishFont) => void;
};

const LocaleContext = createContext<LocaleContextValue>({ language: DEFAULT_UI_LANGUAGE, english: false, setLanguage: () => undefined, chineseFont: DEFAULT_CHINESE_FONT, englishFont: DEFAULT_ENGLISH_FONT, setFonts: () => undefined });

export function LocaleController({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<UiLanguage>(DEFAULT_UI_LANGUAGE);
  const [fonts, setFontsState] = useState<{ chineseFont: ChineseFont; englishFont: EnglishFont }>({ chineseFont: DEFAULT_CHINESE_FONT, englishFont: DEFAULT_ENGLISH_FONT });

  useEffect(() => {
    const update = (next: UiLanguage, persist = true) => {
      setLanguageState(next);
      applyUiLanguage(next, persist);
    };
    const updateFonts = (chineseFont: ChineseFont, englishFont: EnglishFont, persist = true) => {
      setFontsState({ chineseFont, englishFont });
      applyFonts(chineseFont, englishFont, persist);
    };
    update(storedUiLanguage(), false);
    const localFonts = storedFonts();
    updateFonts(localFonts.chineseFont, localFonts.englishFont, false);
    fetch("/api/preferences/appearance", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<UiPreferences> : null)
      .then((preferences) => { if (preferences) { update(preferences.uiLanguage); updateFonts(preferences.chineseFont, preferences.englishFont); } })
      .catch(() => undefined);
  }, []);

  const value = useMemo<LocaleContextValue>(() => ({
    language,
    english: language === "en",
    setLanguage: (next) => {
      setLanguageState(next);
      applyUiLanguage(next);
    },
    ...fonts,
    setFonts: (chineseFont, englishFont) => {
      setFontsState({ chineseFont, englishFont });
      applyFonts(chineseFont, englishFont);
    },
  }), [language, fonts]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}
