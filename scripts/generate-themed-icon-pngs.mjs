import { access, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = path.join(root, "public/icons/features");
const navNames = ["home", "lucius", "settings"];

const palettes = {
  editorial: {
    light: { ink: [36, 66, 53], secondary: [137, 160, 147], surface: [245, 248, 246] },
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
  mistviolet: {
    light: { ink: [102, 87, 123], secondary: [158, 144, 176], surface: [248, 245, 250], accent: [139, 119, 164], accentSoft: [226, 219, 234] },
    dark: { ink: [195, 179, 216], secondary: [137, 119, 159], surface: [41, 36, 47], accent: [203, 182, 228], accentSoft: [82, 67, 99] },
  },
};

const mix = (from, to, amount) => from.map((value, index) => Math.round(value + (to[index] - value) * amount));

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
    // Apply one palette to outlines, warm fills and decorative accents alike.
    const target = mapTone(luminance, palette, dark);
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
  const png = await sharp(data, { raw: info }).png({ compressionLevel: 9, adaptiveFiltering: true, palette: true, colours: 128, dither: 0.35 }).toBuffer();
  await writeFile(destination, png);
}

const selectedTheme = process.argv.find((argument) => argument.startsWith("--theme="))?.slice(8);
if (selectedTheme && !Object.hasOwn(palettes, selectedTheme)) throw new Error(`Unknown theme: ${selectedTheme}`);
const selectedPalettes = selectedTheme ? { [selectedTheme]: palettes[selectedTheme] } : palettes;
const selectedFile = process.argv.find(argument => argument.startsWith("--file="))?.slice(7);
const sourceFiles = (await readdir(sourceDirectory)).filter((name) => name.endsWith(".png") && !name.endsWith("-dark.png") && (!selectedFile || name === selectedFile)).sort();
for (const filename of sourceFiles) {
  const name = filename.replace(/\.png$/, "");
  const { data: source, info } = await normalizedSource(path.join(sourceDirectory, filename));

  for (const [theme, modes] of Object.entries(selectedPalettes)) {
    for (const [mode, palette] of Object.entries(modes)) {
      const data = Buffer.from(source);
      recolor(data, palette, mode === "dark");
      const suffix = mode === "dark" ? "-dark.png" : ".png";
      const base = path.join(root, `public/icons/themes/${theme}`);
      await writePng(data, info, path.join(base, "features", `${name}${suffix}`));
    }
  }
}

for (const name of selectedFile ? [] : navNames) {
  const navSource = path.join(root, "public/icons/nav", `${name}.png`);
  const featureSource = path.join(sourceDirectory, `${name}.png`);
  const input = await access(navSource).then(() => navSource).catch(() => featureSource);
  const { data: source, info } = await normalizedSource(input);

  for (const [theme, modes] of Object.entries(selectedPalettes)) {
    for (const [mode, palette] of Object.entries(modes)) {
      const data = Buffer.from(source);
      recolor(data, palette, mode === "dark");
      const suffix = mode === "dark" ? "-dark.png" : ".png";
      const base = path.join(root, `public/icons/themes/${theme}`);
      await writePng(data, info, path.join(base, "nav", `${name}${suffix}`));
    }
  }

  if (input === featureSource) await writePng(source, info, navSource);
}
