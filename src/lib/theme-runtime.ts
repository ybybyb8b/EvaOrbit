import {
  DEFAULT_APPEARANCE_MODE,
  DEFAULT_COLOR_THEME,
  normalizeDesignTheme,
  type DesignTheme,
  NATIVE_LOADING_THEME,
  normalizeAppearanceMode,
  normalizeColorTheme,
  type AppearanceMode,
  type ColorTheme,
} from "./theme";

export const APPEARANCE_MODE_STORAGE_KEY = "evaorbit.appearanceMode";
export const DESIGN_THEME_STORAGE_KEY = "evaorbit.designTheme";
export const LEGACY_HOME_STYLE_STORAGE_KEY = "evaorbit.homeStyle";
export function storedDesignTheme(): DesignTheme {
  try { return normalizeDesignTheme(localStorage.getItem(DESIGN_THEME_STORAGE_KEY) ?? localStorage.getItem(LEGACY_HOME_STYLE_STORAGE_KEY)); }
  catch { return "classic"; }
}

export const COLOR_THEME_STORAGE_KEY = "evaorbit.colorTheme";

const themeColors: Record<ColorTheme, Record<"light" | "dark", string>> = {
  editorial: { light: "#f5f2e9", dark: "#111313" },
  rosewood: { light: "#faf5ef", dark: "#202124" },
  powderblue: { light: "#faf2e0", dark: "#111313" },
  mistviolet: { light: "#f3f1f5", dark: "#111313" },
};

export function resolveAppearanceMode(mode: AppearanceMode): "light" | "dark" {
  if (mode !== "system") return mode;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function storedAppearance() {
  if (typeof window === "undefined") return { appearanceMode: DEFAULT_APPEARANCE_MODE, colorTheme: DEFAULT_COLOR_THEME, designTheme: "classic" as DesignTheme };
  return {
    designTheme: storedDesignTheme(),
    appearanceMode: normalizeAppearanceMode(window.localStorage.getItem(APPEARANCE_MODE_STORAGE_KEY)),
    colorTheme: normalizeColorTheme(window.localStorage.getItem(COLOR_THEME_STORAGE_KEY)),
  };
}

export function applyAppearance(appearanceMode: AppearanceMode, colorTheme: ColorTheme, persist = true, designTheme: DesignTheme = "classic") {
  const resolvedMode = resolveAppearanceMode(appearanceMode);
  const root = document.documentElement;
  root.dataset.appearance = appearanceMode;
  root.dataset.mode = resolvedMode;
  root.dataset.designTheme = designTheme;
  root.dataset.homeStyle = designTheme;
  root.dataset.classicColorTheme = colorTheme;
  root.dataset.theme = designTheme === "vintage" ? "vintage" : colorTheme;
  root.style.colorScheme = resolvedMode;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", (designTheme === "vintage" ? { light: "#f2f3f5", dark: "#202124" } : themeColors[colorTheme])[resolvedMode]);
  if (persist) {
    window.localStorage.setItem(DESIGN_THEME_STORAGE_KEY, designTheme);
    window.localStorage.setItem(APPEARANCE_MODE_STORAGE_KEY, appearanceMode);
    window.localStorage.setItem(COLOR_THEME_STORAGE_KEY, colorTheme);
  }
  window.dispatchEvent(new CustomEvent("evaorbit:appearance-applied", { detail: { appearanceMode, colorTheme, designTheme, resolvedMode } }));
}

export function syncAppearanceToNative(appearanceMode: AppearanceMode) {
  const bridge = window.EvaOrbitNative;
  if (!bridge) return;
  void bridge.call("appearance.setPreference", { appearanceMode, colorTheme: NATIVE_LOADING_THEME }).catch(() => undefined);
}
