export const APPEARANCE_MODES = ["system", "light", "dark"] as const;
export type AppearanceMode = (typeof APPEARANCE_MODES)[number];

export const DEFAULT_APPEARANCE_MODE: AppearanceMode = "system";

export function normalizeAppearanceMode(value: unknown): AppearanceMode {
  return APPEARANCE_MODES.includes(value as AppearanceMode) ? value as AppearanceMode : DEFAULT_APPEARANCE_MODE;
}
