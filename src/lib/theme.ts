export const APPEARANCE_MODES = ["system", "light", "dark"] as const;
export const COLOR_THEMES = ["editorial", "rosewood", "powderblue"] as const;

export type AppearanceMode = (typeof APPEARANCE_MODES)[number];
export type ColorTheme = (typeof COLOR_THEMES)[number];

export const DEFAULT_APPEARANCE_MODE: AppearanceMode = "system";
export const DEFAULT_COLOR_THEME: ColorTheme = "editorial";

export function normalizeAppearanceMode(value: unknown): AppearanceMode {
  return APPEARANCE_MODES.includes(value as AppearanceMode) ? value as AppearanceMode : DEFAULT_APPEARANCE_MODE;
}

export function normalizeColorTheme(value: unknown): ColorTheme {
  return COLOR_THEMES.includes(value as ColorTheme) ? value as ColorTheme : DEFAULT_COLOR_THEME;
}
