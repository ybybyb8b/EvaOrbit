import {
  DEFAULT_APPEARANCE_MODE,
  DEFAULT_COLOR_THEME,
  normalizeAppearanceMode,
  normalizeColorTheme,
  type AppearanceMode,
  type ColorTheme,
} from "./theme";

export const APPEARANCE_MODE_STORAGE_KEY = "evaorbit.appearanceMode";
export const COLOR_THEME_STORAGE_KEY = "evaorbit.colorTheme";

const themeColors: Record<ColorTheme, Record<"light" | "dark", string>> = {
  editorial: { light: "#f5f2e9", dark: "#101111" },
  rosewood: { light: "#f4ece8", dark: "#110f10" },
};

export function resolveAppearanceMode(mode: AppearanceMode): "light" | "dark" {
  if (mode !== "system") return mode;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function storedAppearance() {
  if (typeof window === "undefined") return { appearanceMode: DEFAULT_APPEARANCE_MODE, colorTheme: DEFAULT_COLOR_THEME };
  return {
    appearanceMode: normalizeAppearanceMode(window.localStorage.getItem(APPEARANCE_MODE_STORAGE_KEY)),
    colorTheme: normalizeColorTheme(window.localStorage.getItem(COLOR_THEME_STORAGE_KEY)),
  };
}

export function applyAppearance(appearanceMode: AppearanceMode, colorTheme: ColorTheme, persist = true) {
  const resolvedMode = resolveAppearanceMode(appearanceMode);
  const root = document.documentElement;
  root.dataset.appearance = appearanceMode;
  root.dataset.mode = resolvedMode;
  root.dataset.theme = colorTheme;
  root.style.colorScheme = resolvedMode;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", themeColors[colorTheme][resolvedMode]);
  if (persist) {
    window.localStorage.setItem(APPEARANCE_MODE_STORAGE_KEY, appearanceMode);
    window.localStorage.setItem(COLOR_THEME_STORAGE_KEY, colorTheme);
  }
  window.dispatchEvent(new CustomEvent("evaorbit:appearance-applied", { detail: { appearanceMode, colorTheme, resolvedMode } }));
}

export function syncAppearanceToNative(appearanceMode: AppearanceMode, colorTheme: ColorTheme) {
  const bridge = window.EvaOrbitNative;
  if (!bridge) return;
  void bridge.call("appearance.setPreference", { appearanceMode, colorTheme }).catch(() => undefined);
}
