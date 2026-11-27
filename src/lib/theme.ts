export const APPEARANCE_MODES = ["system", "light", "dark"] as const;
export type AppearanceMode = (typeof APPEARANCE_MODES)[number];

export const VINTAGE_COLORWAYS = ["mauve-ivory", "oat-plum"] as const;
export type VintageColorway = (typeof VINTAGE_COLORWAYS)[number];
export function normalizeVintageColorway(value: unknown): VintageColorway {
  return VINTAGE_COLORWAYS.includes(value as VintageColorway) ? value as VintageColorway : "mauve-ivory";
}

export const DEFAULT_APPEARANCE_MODE: AppearanceMode = "system";

export function normalizeAppearanceMode(value: unknown): AppearanceMode {
  return APPEARANCE_MODES.includes(value as AppearanceMode) ? value as AppearanceMode : DEFAULT_APPEARANCE_MODE;
}
