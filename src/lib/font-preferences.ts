export const CHINESE_FONTS = ["canger", "lxgw", "alimama", "ibm"] as const;
export const ENGLISH_FONTS = ["zen", "ibm", "polyamine", "cormorant"] as const;

export type ChineseFont = (typeof CHINESE_FONTS)[number];
export type EnglishFont = (typeof ENGLISH_FONTS)[number];

export const DEFAULT_CHINESE_FONT: ChineseFont = "canger";
export const DEFAULT_ENGLISH_FONT: EnglishFont = "zen";

export function normalizeChineseFont(value: unknown): ChineseFont {
  return CHINESE_FONTS.includes(value as ChineseFont) ? value as ChineseFont : DEFAULT_CHINESE_FONT;
}

export function normalizeEnglishFont(value: unknown): EnglishFont {
  return ENGLISH_FONTS.includes(value as EnglishFont) ? value as EnglishFont : DEFAULT_ENGLISH_FONT;
}
