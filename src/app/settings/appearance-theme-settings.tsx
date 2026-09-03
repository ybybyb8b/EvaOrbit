"use client";

import { useEffect, useState } from "react";
import type { UiPreferences } from "@/lib/types";
import { DEFAULT_APPEARANCE_MODE, DEFAULT_COLOR_THEME, type AppearanceMode, type ColorTheme } from "@/lib/theme";
import { applyAppearance } from "@/lib/theme-runtime";

const modes: Array<{ value: AppearanceMode; label: string; detail: string }> = [
  { value: "light", label: "浅色", detail: "始终使用明亮界面" },
  { value: "dark", label: "深色", detail: "使用中性黑灰背景" },
  { value: "system", label: "跟随系统", detail: "随设备外观自动切换" },
];

const themes: Array<{ value: ColorTheme; label: string; detail: string }> = [
  { value: "editorial", label: "原野绿", detail: "EvaOrbit 当前的米白与绿色" },
  { value: "rosewood", label: "粉棕", detail: "柔和粉褐、陶土与暖纸色" },
  { value: "powderblue", label: "粉雾蓝", detail: "浅蓝、粉蓝与雾面冷灰" },
];

export function AppearanceThemeSettings() {
  const [appearanceMode, setAppearanceMode] = useState<AppearanceMode>(DEFAULT_APPEARANCE_MODE);
  const [colorTheme, setColorTheme] = useState<ColorTheme>(DEFAULT_COLOR_THEME);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/preferences/appearance", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("读取主题设置失败");
        return response.json() as Promise<UiPreferences>;
      })
      .then((preferences) => {
        setAppearanceMode(preferences.appearanceMode);
        setColorTheme(preferences.colorTheme);
      })
      .catch((reason: Error) => setError(reason.message));
  }, []);

  async function save(nextMode: AppearanceMode, nextTheme: ColorTheme) {
    setAppearanceMode(nextMode);
    setColorTheme(nextTheme);
    applyAppearance(nextMode, nextTheme);
    window.dispatchEvent(new CustomEvent("evaorbit:appearance-change", { detail: { appearanceMode: nextMode, colorTheme: nextTheme } }));
    setSaving(true); setNotice(""); setError("");
    try {
      const response = await fetch("/api/preferences/appearance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appearanceMode: nextMode, colorTheme: nextTheme }),
      });
      if (!response.ok) throw new Error("保存主题设置失败");
      setNotice("外观已经更新。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存主题设置失败");
    } finally { setSaving(false); }
  }

  return <section className="appearance-theme-settings">
    <div className="persona-heading"><span className="eyebrow">COLOR & MODE</span><h2>界面主题</h2><p>只改变颜色，不改变页面版式、字号或组件位置。</p></div>
    <div className="appearance-setting-group">
      <strong>显示模式</strong>
      <div className="appearance-option-grid">{modes.map((mode) => <button type="button" key={mode.value} className={appearanceMode === mode.value ? "active" : ""} aria-pressed={appearanceMode === mode.value} disabled={saving} onClick={() => void save(mode.value, colorTheme)}><span className={`appearance-mode-preview ${mode.value}`} aria-hidden="true"><i /><i /></span><b>{mode.label}</b><small>{mode.detail}</small></button>)}</div>
    </div>
    <div className="appearance-setting-group">
      <strong>颜色主题</strong>
      <div className="appearance-option-grid themes">{themes.map((theme) => <button type="button" key={theme.value} className={colorTheme === theme.value ? "active" : ""} aria-pressed={colorTheme === theme.value} disabled={saving} onClick={() => void save(appearanceMode, theme.value)}><span className={`appearance-theme-preview ${theme.value}`} aria-hidden="true"><i /><i /><i /></span><b>{theme.label}</b><small>{theme.detail}</small></button>)}</div>
    </div>
    {error && <p className="form-error">{error}</p>}{notice && <p className="form-success" role="status">{notice}</p>}
  </section>;
}
