import { DEFAULT_CHINESE_FONT, DEFAULT_ENGLISH_FONT, normalizeChineseFont, normalizeEnglishFont, type ChineseFont, type EnglishFont } from "./font-preferences";

export const CHINESE_FONT_STORAGE_KEY = "evaorbit.chineseFont";
export const ENGLISH_FONT_STORAGE_KEY = "evaorbit.englishFont";

export function storedFonts() {
  if (typeof window === "undefined") return { chineseFont: DEFAULT_CHINESE_FONT, englishFont: DEFAULT_ENGLISH_FONT };
  return { chineseFont: normalizeChineseFont(window.localStorage.getItem(CHINESE_FONT_STORAGE_KEY)), englishFont: normalizeEnglishFont(window.localStorage.getItem(ENGLISH_FONT_STORAGE_KEY)) };
}

export function applyFonts(chineseFont: ChineseFont, englishFont: EnglishFont, persist = true) {
  const root = document.documentElement;
  root.dataset.chineseFont = chineseFont;
  root.dataset.englishFont = englishFont;
  if (persist) {
    window.localStorage.setItem(CHINESE_FONT_STORAGE_KEY, chineseFont);
    window.localStorage.setItem(ENGLISH_FONT_STORAGE_KEY, englishFont);
  }
}
