/** Quantized, alpha-aware sampling. Neutral/empty marks deliberately have no accent. */
export function representativeIconColor(pixels: ArrayLike<number>): string | null {
  const buckets = new Map<string, { weight: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const [r, g, b, alpha] = [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (alpha < 160 || max < 35 || min > 235 || max - min < 30) continue;
    const weight = alpha / 255 * (1 + (max - min) / 255);
    const key = `${r >> 5}:${g >> 5}:${b >> 5}`;
    const bucket = buckets.get(key) ?? { weight: 0, r: 0, g: 0, b: 0 };
    bucket.weight += weight; bucket.r += r * weight; bucket.g += g * weight; bucket.b += b * weight;
    buckets.set(key, bucket);
  }
  const winner = [...buckets.values()].sort((a, b) => b.weight - a.weight)[0];
  return winner ? `#${[winner.r, winner.g, winner.b].map(value => Math.round(value / winner.weight).toString(16).padStart(2, "0")).join("")}` : null;
}

type RGB = [number, number, number];
const luminance = (rgb: RGB) => rgb.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
export const iconContrast = (a: RGB, b: RGB) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
const mix = (a: RGB, b: RGB, weight: number): RGB => a.map((value, i) => Math.round(value * weight + b[i] * (1 - weight))) as RGB;

export function subscriptionCardPalette(accent: RGB, surface: RGB, end: RGB, text: RGB) {
  const start = mix(accent, surface, .22);
  const contrast = (ink: RGB) => Math.min(iconContrast(ink, start), iconContrast(ink, end));
  const ink = contrast(text) >= 4.5 ? text : contrast([255, 255, 255]) > contrast([0, 0, 0]) ? [255, 255, 255] as RGB : [0, 0, 0] as RGB;
  const softened = mix(ink, start, .82);
  return { start, end, ink, muted: contrast(softened) >= 4.5 ? softened : ink };
}
