import { DEFAULT_UI_LANGUAGE, normalizeUiLanguage, type UiLanguage } from "./locale";

export const UI_LANGUAGE_STORAGE_KEY = "evaorbit.uiLanguage";

export function storedUiLanguage(): UiLanguage {
  if (typeof window === "undefined") return DEFAULT_UI_LANGUAGE;
  return normalizeUiLanguage(window.localStorage.getItem(UI_LANGUAGE_STORAGE_KEY));
}

export function applyUiLanguage(language: UiLanguage, persist = true) {
  const root = document.documentElement;
  root.dataset.locale = language;
  root.lang = language;
  if (persist) window.localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, language);
  window.dispatchEvent(new CustomEvent("evaorbit:language-applied", { detail: { language } }));
}
