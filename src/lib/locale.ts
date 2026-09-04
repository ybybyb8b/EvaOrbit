export const UI_LANGUAGES = ["zh-CN", "en"] as const;

export type UiLanguage = (typeof UI_LANGUAGES)[number];

export const DEFAULT_UI_LANGUAGE: UiLanguage = "zh-CN";

export function normalizeUiLanguage(value: unknown): UiLanguage {
  return UI_LANGUAGES.includes(value as UiLanguage) ? value as UiLanguage : DEFAULT_UI_LANGUAGE;
}

export function isEnglish(language: UiLanguage) {
  return language === "en";
}
