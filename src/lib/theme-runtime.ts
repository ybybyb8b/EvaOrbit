import type { AppearanceMode } from "./theme";

export const APPEARANCE_MODE_STORAGE_KEY = "evaorbit.appearanceMode";
export function resolveAppearanceMode(mode: AppearanceMode): "light" | "dark" {
  if (mode !== "system") return mode;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyAppearance(appearanceMode: AppearanceMode) {
  const resolvedMode = resolveAppearanceMode(appearanceMode);
  const root = document.documentElement;
  root.dataset.appearance = appearanceMode;
  root.dataset.mode = resolvedMode;
  root.dataset.designTheme = "vintage";
  root.dataset.theme = "vintage";
  root.style.colorScheme = resolvedMode;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", resolvedMode === "dark" ? "#202124" : "#f2f3f5");
  window.dispatchEvent(new CustomEvent("evaorbit:appearance-applied", { detail: { appearanceMode, resolvedMode } }));
}

export function syncAppearanceToNative(appearanceMode: AppearanceMode) {
  const bridge = window.EvaOrbitNative;
  if (!bridge) return;
  void bridge.call("appearance.setPreference", { appearanceMode }).catch(() => undefined);
}
