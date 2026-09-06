import { access, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = path.join(root, "public/icons/features");
const navNames = ["home", "lucius", "settings"];

const palettes = {
  editorial: {
    dark: { ink: [184, 206, 193], secondary: [111, 139, 126], surface: [29, 39, 35], accent: [220, 171, 82], accentSoft: [119, 83, 31] },
  },
  rosewood: {
    light: { ink: [111, 72, 77], secondary: [172, 137, 140], surface: [249, 240, 236], accent: [190, 126, 117], accentSoft: [239, 202, 190] },
    dark: { ink: [213, 166, 170], secondary: [160, 119, 124], surface: [43, 31, 34], accent: [229, 170, 157], accentSoft: [116, 73, 68] },
  },
  powderblue: {
    light: { ink: [79, 115, 139], secondary: [139, 170, 189], surface: [244, 249, 252], accent: [111, 159, 190], accentSoft: [205, 228, 241] },
    dark: { ink: [172, 205, 225], secondary: [111, 151, 176], surface: [28, 41, 49], accent: [145, 192, 219], accentSoft: [61, 96, 116] },
  },
};

const mix = (from, to, amount) => from.map((value, index) => Math.round(value + (to[index] - value) * amount));

function isBrandGreen(red, green, blue) {
  return green - red > 5 && green - blue > 4;
}

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function rgbToHsl(red, green, blue) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return [0, 0, lightness];
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  hue = ((hue * 60) + 360) % 360;
  return [hue, saturation, lightness];
}

function hslToRgb(hue, saturation, lightness) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const section = hue / 60;
  const x = chroma * (1 - Math.abs((section % 2) - 1));
  const [r, g, b] = section < 1 ? [chroma, x, 0] : section < 2 ? [x, chroma, 0] : section < 3 ? [0, chroma, x] : section < 4 ? [0, x, chroma] : section < 5 ? [x, 0, chroma] : [chroma, 0, x];
  const offset = lightness - chroma / 2;
  return [r, g, b].map((value) => Math.round((value + offset) * 255));
}

function preserveHueForDark(red, green, blue) {
  const [hue, saturation, lightness] = rgbToHsl(red, green, blue);
  const darkLightness = 0.78 - lightness * 0.52;
  const darkSaturation = saturation < 0.05 ? 0 : clamp(saturation * 0.82, 0.14, 0.7);
  return hslToRgb(hue, darkSaturation, darkLightness);
}

function isLargeWarmFill(red, green, blue) {
  const [hue, saturation, lightness] = rgbToHsl(red, green, blue);
  return hue >= 18 && hue <= 80 && saturation > 0.08 && lightness > 0.58;
}

function mapTone(luminance, palette, dark) {
  if (dark) {
    if (luminance < 0.52) return mix(palette.ink, palette.secondary, luminance / 0.52);
    return mix(palette.secondary, palette.surface, (luminance - 0.52) / 0.48);
  }
  if (luminance < 0.5) return mix(palette.ink, palette.secondary, luminance / 0.5);
  return mix(palette.secondary, palette.surface, (luminance - 0.5) / 0.5);
}

function recolor(buffer, palette, dark) {
  for (let index = 0; index < buffer.length; index += 4) {
    const red = buffer[index];
    const green = buffer[index + 1];
    const blue = buffer[index + 2];
    const alpha = buffer[index + 3];
    if (alpha <= 8) {
      buffer[index + 3] = 0;
      continue;
    }

    const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
    const target = isBrandGreen(red, green, blue) || (dark && isLargeWarmFill(red, green, blue))
      ? mapTone(luminance, palette, dark)
      : dark ? preserveHueForDark(red, green, blue) : [red, green, blue];
    buffer[index] = target[0];
    buffer[index + 1] = target[1];
    buffer[index + 2] = target[2];
    buffer[index + 3] = Math.round(((alpha - 8) / 247) * 255);
  }
}

async function normalizedSource(file) {
  return sharp(file).resize(512, 512, { fit: "contain", kernel: sharp.kernel.lanczos3 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

async function writePng(data, info, destination) {
  await mkdir(path.dirname(destination), { recursive: true });
  await sharp(data, { raw: info }).png({ compressionLevel: 9, adaptiveFiltering: true, palette: true, colours: 128, dither: 0.35 }).toFile(destination);
}

const sourceFiles = (await readdir(sourceDirectory)).filter((name) => name.endsWith(".png") && !name.endsWith("-dark.png")).sort();
for (const filename of sourceFiles) {
  const name = filename.replace(/\.png$/, "");
  const { data: source, info } = await normalizedSource(path.join(sourceDirectory, filename));

  for (const [theme, modes] of Object.entries(palettes)) {
    for (const [mode, palette] of Object.entries(modes)) {
      const data = Buffer.from(source);
      recolor(data, palette, mode === "dark");
      const suffix = mode === "dark" ? "-dark.png" : ".png";
      const base = theme === "editorial" ? path.join(root, "public/icons") : path.join(root, `public/icons/themes/${theme}`);
      await writePng(data, info, path.join(base, "features", `${name}${suffix}`));
    }
  }
}

for (const name of navNames) {
  const navSource = path.join(root, "public/icons/nav", `${name}.png`);
  const featureSource = path.join(sourceDirectory, `${name}.png`);
  const input = await access(navSource).then(() => navSource).catch(() => featureSource);
  const { data: source, info } = await normalizedSource(input);

  for (const [theme, modes] of Object.entries(palettes)) {
    for (const [mode, palette] of Object.entries(modes)) {
      const data = Buffer.from(source);
      recolor(data, palette, mode === "dark");
      const suffix = mode === "dark" ? "-dark.png" : ".png";
      const base = theme === "editorial" ? path.join(root, "public/icons") : path.join(root, `public/icons/themes/${theme}`);
      await writePng(data, info, path.join(base, "nav", `${name}${suffix}`));
    }
  }

  if (input === featureSource) await writePng(source, info, navSource);
}
