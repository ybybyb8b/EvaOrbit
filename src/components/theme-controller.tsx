"use client";

import { useEffect } from "react";
import type { UiPreferences } from "@/lib/types";
import { applyAppearance, storedAppearance, syncAppearanceToNative } from "@/lib/theme-runtime";

export function ThemeController() {
  useEffect(() => {
    let current = storedAppearance();
    const applyCurrent = () => {
      applyAppearance(current.appearanceMode, current.colorTheme);
      syncAppearanceToNative(current.appearanceMode, current.colorTheme);
    };
    const onAppearanceChange = (event: Event) => {
      const detail = (event as CustomEvent<typeof current>).detail;
      if (!detail) return;
      current = detail;
      applyCurrent();
    };
    const onSystemChange = () => { if (current.appearanceMode === "system") applyCurrent(); };
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    applyCurrent();
    media.addEventListener("change", onSystemChange);
    window.addEventListener("evaorbit:appearance-change", onAppearanceChange);
    window.addEventListener("evaorbit:native-ready", applyCurrent);

    fetch("/api/preferences/appearance", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<UiPreferences> : null)
      .then((preferences) => {
        if (!preferences) return;
        current = { appearanceMode: preferences.appearanceMode, colorTheme: preferences.colorTheme };
        applyCurrent();
      })
      .catch(() => undefined);

    return () => {
      media.removeEventListener("change", onSystemChange);
      window.removeEventListener("evaorbit:appearance-change", onAppearanceChange);
      window.removeEventListener("evaorbit:native-ready", applyCurrent);
    };
  }, []);

  return null;
}
