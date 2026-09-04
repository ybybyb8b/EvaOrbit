import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getUiPreferences, updateAppearancePreferences } from "@/lib/services/evaorbit";
import { APPEARANCE_MODES, COLOR_THEMES, type AppearanceMode, type ColorTheme } from "@/lib/theme";
import { ValidationError } from "@/lib/validation";
import { UI_LANGUAGES, type UiLanguage } from "@/lib/locale";
import { CHINESE_FONTS, ENGLISH_FONTS, type ChineseFont, type EnglishFont } from "@/lib/font-preferences";

export const runtime = "nodejs";

export async function GET() {
  try { return NextResponse.json(await getUiPreferences()); } catch (error) { return apiError(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (!APPEARANCE_MODES.includes(body.appearanceMode as AppearanceMode)) throw new ValidationError("显示模式不正确");
    if (!COLOR_THEMES.includes(body.colorTheme as ColorTheme)) throw new ValidationError("颜色主题不正确");
    if (!UI_LANGUAGES.includes(body.uiLanguage as UiLanguage)) throw new ValidationError("界面语言不正确");
    if (!CHINESE_FONTS.includes(body.chineseFont as ChineseFont)) throw new ValidationError("中文字体不正确");
    if (!ENGLISH_FONTS.includes(body.englishFont as EnglishFont)) throw new ValidationError("英文字体不正确");
    return NextResponse.json(await updateAppearancePreferences({
      appearanceMode: body.appearanceMode as AppearanceMode,
      colorTheme: body.colorTheme as ColorTheme,
      uiLanguage: body.uiLanguage as UiLanguage,
      chineseFont: body.chineseFont as ChineseFont,
      englishFont: body.englishFont as EnglishFont,
    }));
  } catch (error) { return apiError(error); }
}
