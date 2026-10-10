"use client";

import { useEffect, useState } from "react";
import { iconContrast, representativeIconColor, subscriptionCardPalette } from "@/lib/subscription-icon-color";
import type { CSSProperties } from "react";

const cache = new Map<string, Promise<string | null>>();
function extract(source: string) {
  const existing = cache.get(source);
  if (existing) return existing;
  const result = new Promise<string | null>(resolve => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    const timeout = window.setTimeout(() => { image.src = ""; resolve(null); }, 5000);
    image.onload = () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement("canvas"); canvas.width = canvas.height = 32;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) { resolve(null); return; }
        context.drawImage(image, 0, 0, 32, 32);
        resolve(representativeIconColor(context.getImageData(0, 0, 32, 32).data));
      } catch { resolve(null); }
    };
    image.onerror = () => { clearTimeout(timeout); resolve(null); };
    image.src = source;
  });
  // Page-session cache: same source is decoded once, including failed/CORS sources.
  if (cache.size >= 200) cache.delete(cache.keys().next().value!);
  cache.set(source, result);
  return result;
}

export function useIconColors(sources: Record<number, string>) {
  const [colors, setColors] = useState<Record<number, string | null>>({});
  const [theme, setTheme] = useState<{ surface: [number,number,number]; end: [number,number,number]; text: [number,number,number] } | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all(Object.entries(sources).map(async ([id, source]) => [id, await extract(source)] as const)).then(entries => { if (alive) setColors(Object.fromEntries(entries)); });
    return () => { alive = false; };
  }, [sources]);
  useEffect(() => {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    const update = () => {
      const style = getComputedStyle(document.documentElement);
      const rgb = (token: string): [number,number,number] => {
        context.clearRect(0,0,1,1); context.fillStyle = style.getPropertyValue(token).trim(); context.fillRect(0,0,1,1);
        const values = context.getImageData(0,0,1,1).data;
        return [values[0], values[1], values[2]];
      };
      setTheme({ surface: rgb("--surface-raised"), end: rgb("--surface-card"), text: rgb("--text-primary") });
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode", "data-theme", "style"] });
    return () => observer.disconnect();
  }, []);
  function palette(accent: string | null): CSSProperties {
    if (!theme || !accent || !/^#[\da-f]{6}$/i.test(accent)) return {};
    const rgb = [1,3,5].map(index => parseInt(accent.slice(index,index+2),16)) as [number,number,number];
    const values = subscriptionCardPalette(rgb, theme.surface, theme.end, theme.text);
    return Object.fromEntries(Object.entries(values).map(([key,value]) => [`--preview-${key}`, `rgb(${value.join(" ")})`])) as CSSProperties;
  }
  const neutralFilter = theme && iconContrast(theme.text, [0,0,0]) > iconContrast(theme.text, [255,255,255]) ? "brightness(0) invert(1)" : "brightness(0)";
  return { colors, palette, neutralFilter };
}
