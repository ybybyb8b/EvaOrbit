"use client";
import { useState } from "react";
import { ErrorNotice } from "@/components/error-notice";
import { ToastNotice } from "@/components/action-toast";
import { useLocale } from "@/components/locale-controller";
import { type AppearancePreferences } from "@/lib/appearance-preferences";
import { APPEARANCE_MODES, COLOR_THEMES, DESIGN_THEMES } from "@/lib/theme";
import { UI_LANGUAGES } from "@/lib/locale";
import { CHINESE_FONTS, ENGLISH_FONTS } from "@/lib/font-preferences";

export function AppearanceSettings({ localOnly = false }: { localOnly?: boolean }) {
  const { english, language, appearanceMode, colorTheme, designTheme, chineseFont, englishFont, loadFailed, setPreferences } = useLocale();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const visibleError = error || (loadFailed ? english ? "Could not load appearance settings. Your local settings are retained." : "读取主题设置失败，已保留本机设置。" : "");
  async function save(change: Partial<AppearancePreferences>) {
    const next = { appearanceMode, colorTheme, designTheme, uiLanguage: language, chineseFont, englishFont, ...change };
    const nextEnglish = next.uiLanguage === "en";
    setSaving(true); setNotice(""); setError("");
    try {
      setPreferences(next);
      if (localOnly) { setNotice(nextEnglish ? "Appearance saved on this device." : "外观已保存到本机。"); return; }
      const response = await fetch("/api/preferences/appearance", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      if (!response.ok) throw new Error(nextEnglish ? "Could not save appearance settings" : "保存主题设置失败");
      setNotice(nextEnglish ? "Appearance updated." : "外观已经更新。");
    } catch (reason) { setError(reason instanceof Error ? reason.message : nextEnglish ? "Could not save appearance settings" : "保存主题设置失败"); }
    finally { setSaving(false); }
  }
  return <section className="appearance-theme-settings">
    <div className="persona-heading"><span className="eyebrow">{english ? "LANGUAGE & APPEARANCE" : "语言与外观"}</span><h2>{english ? "Interface" : "界面设置"}</h2></div>
    <div className="appearance-setting-group">
      <strong>{english ? "Language" : "界面语言"}</strong>
      <div className="appearance-option-grid language-options">{UI_LANGUAGES.map(uiLanguage => <button type="button" key={uiLanguage} aria-pressed={language === uiLanguage} className={language === uiLanguage ? "active" : ""} disabled={saving} onClick={() => void save({ uiLanguage })}><b>{uiLanguage === "en" ? "English" : "中文"}</b><small>{uiLanguage === "en" ? "English interface" : "中文界面"}</small></button>)}</div>
    </div>
    <div className="appearance-setting-group">
      <strong>{english ? "Chinese typeface" : "中文字体"}</strong>
      <div className="appearance-option-grid font-options">{CHINESE_FONTS.map(value => <button type="button" key={value} className={chineseFont === value ? "active" : ""} aria-pressed={chineseFont === value} disabled={saving} onClick={() => void save({ chineseFont: value })}><b className={`font-sample font-sample-zh font-${value}`}>{({ canger: "仓耳华新体", lxgw: "霞鹜文楷", alimama: "刻宋", ibm: "仓耳玄三" } as const)[value]}</b><small>{english ? "Chinese interface" : "中文界面"}</small></button>)}</div>
    </div>
    <div className="appearance-setting-group">
      <strong>{english ? "English typeface" : "英文字体"}</strong>
      <div className="appearance-option-grid font-options">{ENGLISH_FONTS.map(value => <button type="button" key={value} className={englishFont === value ? "active" : ""} aria-pressed={englishFont === value} disabled={saving} onClick={() => void save({ englishFont: value })}><b className={`font-sample font-sample-en font-${value}`}>{({ zen: "ZEN Serif", ibm: "August", polyamine: "Polyamine", cormorant: "Cormorant Garamond" } as const)[value]}</b><small>{english ? "English interface" : "英文界面"}</small></button>)}</div>
    </div>
    <div className="appearance-setting-group">
      <strong>{english ? "Display mode" : "显示模式"}</strong>
      <div className="appearance-option-grid">{APPEARANCE_MODES.map(value => <button type="button" key={value} className={appearanceMode === value ? "active" : ""} aria-pressed={appearanceMode === value} disabled={saving} onClick={() => void save({ appearanceMode: value })}><span className={`appearance-mode-preview ${value}`} aria-hidden="true"><i /><i /></span><b>{english ? ({ light: "Light", dark: "Dark", system: "System" } as const)[value] : ({ light: "浅色", dark: "深色", system: "跟随系统" } as const)[value]}</b><small>{english ? ({ light: "Always use the light appearance", dark: "Use a neutral dark appearance", system: "Match the device appearance" } as const)[value] : ({ light: "始终使用明亮界面", dark: "使用中性黑灰背景", system: "随设备外观自动切换" } as const)[value]}</small></button>)}</div>
    </div>
    <div className="appearance-setting-group appearance-design-themes">
      <strong>{english ? "Theme" : "主题"}</strong>
      <div className="appearance-option-grid design-options">{DESIGN_THEMES.map(value => <button key={value} type="button" aria-pressed={designTheme === value} className={designTheme === value ? "active" : ""} disabled={saving} onClick={() => void save({ designTheme: value })}><span className={`appearance-theme-preview ${value}`} aria-hidden="true"><i /><i /><i /></span><b>{value === "vintage" ? "Vintage" : "Classic"}</b><small>{value === "vintage" ? (english ? "Cool white, plum and milk glass" : "冷灰白、深梅紫与乳白玻璃") : (english ? "Original design with four color palettes" : "原有设计，四套配色")}</small></button>)}</div>
      {designTheme === "classic" ? <div className="appearance-classic-colors">
        <strong>{english ? "Classic colors" : "Classic 配色"}</strong>
        <div className="appearance-option-grid themes">{COLOR_THEMES.map(value => <button type="button" key={value} className={colorTheme === value ? "active" : ""} aria-pressed={colorTheme === value} disabled={saving} onClick={() => void save({ colorTheme: value })}><span className={`appearance-theme-preview ${value}`} aria-hidden="true"><i /><i /><i /></span><b>{english ? ({ editorial: "Field Green", rosewood: "Rosewood", powderblue: "Almond Blue", mistviolet: "Mist Violet" } as const)[value] : ({ editorial: "原野绿", rosewood: "粉棕", powderblue: "奶杏蓝", mistviolet: "雾紫墨" } as const)[value]}</b><small>{english ? ({ editorial: "Ivory and muted green", rosewood: "Cream, soft pink and a sage accent", powderblue: "Milky almond and deep ocean blue", mistviolet: "Misty grey violet and muted grape" } as const)[value] : ({ editorial: "米白与柔和绿色", rosewood: "奶白与柔粉，浅灰绿点缀", powderblue: "奶杏底色与深宝蓝强调", mistviolet: "雾灰紫底色与灰葡萄紫强调" } as const)[value]}</small></button>)}</div>
      </div> : <p className="appearance-theme-detail">{english ? "Plum · the current Vintage palette" : "深梅紫 · 当前 Vintage 配色"}</p>}
    </div>
    {visibleError && <ErrorNotice>{visibleError}</ErrorNotice>}{notice && <ToastNotice message={notice} onShown={() => setNotice("")} />}
  </section>;
}
