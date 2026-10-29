export const APPEARANCE_MODES = ["system", "light", "dark"] as const;
export const DESIGN_THEMES = ["classic", "vintage"] as const;
export type DesignTheme = (typeof DESIGN_THEMES)[number];
export const DEFAULT_DESIGN_THEME: DesignTheme = "classic";
export function normalizeDesignTheme(value: unknown): DesignTheme {
  return DESIGN_THEMES.includes(value as DesignTheme) ? value as DesignTheme : DEFAULT_DESIGN_THEME;
}

/** Classic palettes remain independent of the design theme. */
export const COLOR_THEMES = ["editorial", "rosewood", "powderblue", "mistviolet"] as const;

export type AppearanceMode = (typeof APPEARANCE_MODES)[number];
export type ColorTheme = (typeof COLOR_THEMES)[number];

export const DEFAULT_APPEARANCE_MODE: AppearanceMode = "system";
export const DEFAULT_COLOR_THEME: ColorTheme = "editorial";
export const NATIVE_LOADING_THEME = "editorial" as const;

export function normalizeAppearanceMode(value: unknown): AppearanceMode {
  return APPEARANCE_MODES.includes(value as AppearanceMode) ? value as AppearanceMode : DEFAULT_APPEARANCE_MODE;
}

export function normalizeColorTheme(value: unknown): ColorTheme {
  return COLOR_THEMES.includes(value as ColorTheme) ? value as ColorTheme : DEFAULT_COLOR_THEME;
}
