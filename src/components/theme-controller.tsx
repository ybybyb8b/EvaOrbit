"use client";

import { useEffect } from "react";
import { useLocale } from "./locale-controller";
import { applyAppearance, syncAppearanceToNative } from "@/lib/theme-runtime";

/** Both shells use the same system appearance and native loading integration. */
export function ThemeController() {
  const { appearanceMode, colorTheme } = useLocale();
  useEffect(() => {
    const apply = () => {
      applyAppearance(appearanceMode, colorTheme, false);
      syncAppearanceToNative(appearanceMode);
    };
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    apply();
    media.addEventListener("change", apply);
    window.addEventListener("evaorbit:native-ready", apply);
    return () => { media.removeEventListener("change", apply); window.removeEventListener("evaorbit:native-ready", apply); };
  }, [appearanceMode, colorTheme]);
  return null;
}
