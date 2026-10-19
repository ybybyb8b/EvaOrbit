"use client";
import { ErrorNotice } from "@/components/error-notice";
import { ToastNotice } from "@/components/action-toast";

import { useState } from "react";
import { type AppearanceMode, type ColorTheme } from "@/lib/theme";
import { UI_LANGUAGES, type UiLanguage } from "@/lib/locale";
import { useLocale } from "@/components/locale-controller";
import { CHINESE_FONTS, ENGLISH_FONTS, type ChineseFont, type EnglishFont } from "@/lib/font-preferences";

const modes: Array<{ value: AppearanceMode; label: string; detail: string }> = [
  { value: "light", label: "浅色", detail: "始终使用明亮界面" },
  { value: "dark", label: "深色", detail: "使用中性黑灰背景" },
  { value: "system", label: "跟随系统", detail: "随设备外观自动切换" },
];

const themes: Array<{ value: ColorTheme; label: string; detail: string }> = [
  { value: "editorial", label: "原野绿", detail: "EvaOrbit 当前的米白与绿色" },
  { value: "rosewood", label: "粉棕", detail: "柔和粉褐、陶土与暖纸色" },
  { value: "powderblue", label: "奶杏蓝", detail: "奶杏底色与深宝蓝强调" },
  { value: "mistviolet", label: "雾紫墨", detail: "雾灰紫底色与灰葡萄紫强调" },
];

export function AppearanceSettings({ localOnly = false }: { localOnly?: boolean }) {
  const { english, language, appearanceMode, colorTheme, chineseFont, englishFont, loadFailed, setPreferences } = useLocale();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const visibleError = error || (loadFailed ? english ? "Could not load appearance settings. Your local settings are retained." : "读取主题设置失败，已保留本机设置。" : "");

  async function save(nextMode: AppearanceMode, nextTheme: ColorTheme, nextLanguage: UiLanguage = language, nextChineseFont: ChineseFont = chineseFont, nextEnglishFont: EnglishFont = englishFont) {
    const nextEnglish = nextLanguage === "en";
    setSaving(true); setNotice(""); setError("");
    try {
      const next = { appearanceMode: nextMode, colorTheme: nextTheme, uiLanguage: nextLanguage, chineseFont: nextChineseFont, englishFont: nextEnglishFont };
      setPreferences(next);
      if (localOnly) { setNotice(nextEnglish ? "Appearance saved on this device." : "外观已保存到本机。"); return; }
      const response = await fetch("/api/preferences/appearance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!response.ok) throw new Error(nextEnglish ? "Could not save appearance settings" : "保存主题设置失败");
      setNotice(nextEnglish ? "Appearance updated." : "外观已经更新。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : nextEnglish ? "Could not save appearance settings" : "保存主题设置失败");
    } finally { setSaving(false); }
  }

  return <section className="appearance-theme-settings">
    <div className="persona-heading"><span className="eyebrow">{english ? "LANGUAGE & APPEARANCE" : "语言与外观"}</span><h2>{english ? "Interface" : "界面设置"}</h2></div>
    <div className="appearance-setting-group">
      <strong>{english ? "Language" : "界面语言"}</strong>
      <div className="appearance-option-grid language-options">{UI_LANGUAGES.map((value) => <button type="button" key={value} className={language === value ? "active" : ""} aria-pressed={language === value} disabled={saving} onClick={() => void save(appearanceMode, colorTheme, value)}><b>{value === "en" ? "English" : "中文"}</b><small>{value === "en" ? "English interface" : "中文界面"}</small></button>)}</div>
    </div>
    <div className="appearance-setting-group">
      <strong>{english ? "Chinese typeface" : "中文字体"}</strong>
      <div className="appearance-option-grid font-options">{CHINESE_FONTS.map((value) => <button type="button" key={value} className={chineseFont === value ? "active" : ""} aria-pressed={chineseFont === value} disabled={saving} onClick={() => void save(appearanceMode, colorTheme, language, value, englishFont)}><b className={`font-sample font-sample-zh font-${value}`}>{({ canger: "仓耳华新体", lxgw: "霞鹜文楷", alimama: "刻宋", ibm: "仓耳玄三" } as const)[value]}</b><small>{english ? "Chinese interface" : "中文界面"}</small></button>)}</div>
    </div>
    <div className="appearance-setting-group">
      <strong>{english ? "English typeface" : "英文字体"}</strong>
      <div className="appearance-option-grid font-options">{ENGLISH_FONTS.map((value) => <button type="button" key={value} className={englishFont === value ? "active" : ""} aria-pressed={englishFont === value} disabled={saving} onClick={() => void save(appearanceMode, colorTheme, language, chineseFont, value)}><b className={`font-sample font-sample-en font-${value}`}>{({ zen: "ZEN Serif", ibm: "August", polyamine: "Polyamine", cormorant: "Cormorant Garamond" } as const)[value]}</b><small>{english ? "English interface" : "英文界面"}</small></button>)}</div>
    </div>
    <div className="appearance-setting-group">
      <strong>{english ? "Display mode" : "显示模式"}</strong>
      <div className="appearance-option-grid">{modes.map((mode) => <button type="button" key={mode.value} className={appearanceMode === mode.value ? "active" : ""} aria-pressed={appearanceMode === mode.value} disabled={saving} onClick={() => void save(mode.value, colorTheme)}><span className={`appearance-mode-preview ${mode.value}`} aria-hidden="true"><i /><i /></span><b>{english ? ({ light: "Light", dark: "Dark", system: "System" } as const)[mode.value] : mode.label}</b><small>{english ? ({ light: "Always use the light appearance", dark: "Use a neutral dark appearance", system: "Match the device appearance" } as const)[mode.value] : mode.detail}</small></button>)}</div>
    </div>
    <div className="appearance-setting-group">
      <strong>{english ? "Color theme" : "颜色主题"}</strong>
      <div className="appearance-option-grid themes">{themes.map((theme) => <button type="button" key={theme.value} className={colorTheme === theme.value ? "active" : ""} aria-pressed={colorTheme === theme.value} disabled={saving} onClick={() => void save(appearanceMode, theme.value)}><span className={`appearance-theme-preview ${theme.value}`} aria-hidden="true"><i /><i /><i /></span><b>{english ? ({ editorial: "Field Green", rosewood: "Rosewood", powderblue: "Almond Blue", mistviolet: "Mist Violet" } as const)[theme.value] : theme.label}</b><small>{english ? ({ editorial: "Ivory and muted green", rosewood: "Soft rosewood and warm paper", powderblue: "Milky almond and deep ocean blue", mistviolet: "Misty grey violet and muted grape" } as const)[theme.value] : theme.detail}</small></button>)}</div>
    </div>
    {visibleError && <ErrorNotice>{visibleError}</ErrorNotice>}{notice && <ToastNotice message={notice} onShown={() => setNotice("")} />}
  </section>;
}
