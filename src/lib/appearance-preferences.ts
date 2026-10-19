import type { UiPreferences } from "./types";
import { normalizeAppearanceMode, normalizeColorTheme } from "./theme";
import { applyAppearance, APPEARANCE_MODE_STORAGE_KEY, COLOR_THEME_STORAGE_KEY } from "./theme-runtime";
import { normalizeUiLanguage } from "./locale";
import { applyUiLanguage, UI_LANGUAGE_STORAGE_KEY } from "./locale-runtime";
import { normalizeChineseFont, normalizeEnglishFont } from "./font-preferences";
import { applyFonts, CHINESE_FONT_STORAGE_KEY, ENGLISH_FONT_STORAGE_KEY } from "./font-runtime";

export type AppearancePreferences = Pick<UiPreferences, "appearanceMode" | "colorTheme" | "uiLanguage" | "chineseFont" | "englishFont">;
export const LOCAL_APPEARANCE_BASELINE: Partial<AppearancePreferences> = { uiLanguage: "en", englishFont: "ibm" };
const keys = { appearanceMode: APPEARANCE_MODE_STORAGE_KEY, colorTheme: COLOR_THEME_STORAGE_KEY, uiLanguage: UI_LANGUAGE_STORAGE_KEY, chineseFont: CHINESE_FONT_STORAGE_KEY, englishFont: ENGLISH_FONT_STORAGE_KEY };

export function normalizeAppearancePreferences(value: Partial<AppearancePreferences> = {}): AppearancePreferences {
  return { appearanceMode: normalizeAppearanceMode(value.appearanceMode), colorTheme: normalizeColorTheme(value.colorTheme), uiLanguage: normalizeUiLanguage(value.uiLanguage), chineseFont: normalizeChineseFont(value.chineseFont), englishFont: normalizeEnglishFont(value.englishFont) };
}
export function storedAppearancePreferences(defaults: Partial<AppearancePreferences> = {}): AppearancePreferences {
  const values = { ...defaults };
  try {
    for (const [name, key] of Object.entries(keys)) {
      const value = localStorage.getItem(key);
      if (value !== null) Object.assign(values, { [name]: value });
    }
  } catch { /* Storage-restricted contexts still render with defaults. */ }
  return normalizeAppearancePreferences(values);
}
export function applyAppearancePreferences(value: AppearancePreferences, persist = true) {
  applyAppearance(value.appearanceMode, value.colorTheme, false);
  applyFonts(value.chineseFont, value.englishFont, false);
  applyUiLanguage(value.uiLanguage, false);
  if (persist) for (const [name, key] of Object.entries(keys)) localStorage.setItem(key, value[name as keyof AppearancePreferences]);
}
