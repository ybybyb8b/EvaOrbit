"use client";
import { createContext, useContext, useEffect, useState, type ReactNode, type Dispatch, type SetStateAction } from "react";
import { useLocale } from "./locale-controller";

type PreviewMode = "original" | "paper" | null;
type PreviewPalette = "blue" | "reference" | "print";
const PreviewContext = createContext<{mode:PreviewMode;enabled:boolean;allowPrint:boolean;palette:PreviewPalette;setPalette:Dispatch<SetStateAction<PreviewPalette>>;setMode:Dispatch<SetStateAction<PreviewMode>>} | null>(null);
export function useClassicEditorialPreview() { return useContext(PreviewContext)?.enabled ?? false; }

/** URL-only layout study: no saved preferences or palette migration. */
export function ClassicEditorialPreviewProvider({children,surface="home"}:{children:ReactNode;surface?:"home"|"subscriptions"}) {
  const { designTheme } = useLocale();
  const [mode, setMode] = useState<PreviewMode>(null);
  const [palette, setPalette] = useState<PreviewPalette>("blue");
  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("classicPreview") === "paper";
    queueMicrotask(() => { if (alive && requested) { setMode("paper");setPalette(params.get("classicPalette") === "reference" ? "reference" : surface === "home" && params.get("classicPalette") === "print" ? "print" : "blue"); } });
    return () => { alive = false; };
  }, [surface]);
  useEffect(() => {
    if (mode !== "paper" || designTheme !== "classic") return;
    document.documentElement.dataset.classicPreview = "paper";
    document.documentElement.dataset.classicPalette = palette;
    return () => { delete document.documentElement.dataset.classicPreview;delete document.documentElement.dataset.classicPalette; };
  }, [mode, designTheme, palette]);
  return <PreviewContext.Provider value={{mode,enabled:mode === "paper" && designTheme === "classic",allowPrint:surface === "home",palette,setPalette,setMode}}>{children}</PreviewContext.Provider>;
}

export function ClassicEditorialPreview() {
  const { designTheme, english } = useLocale();
  const preview = useContext(PreviewContext);
  if (!preview || preview.mode === null || designTheme !== "classic") return null;
  const {mode,setMode,palette,setPalette,allowPrint} = preview;
  const palettes:PreviewPalette[]=allowPrint?["blue","reference","print"]:["blue","reference"];
  return <aside className="classic-preview-controls" aria-label={english ? "Classic layout preview" : "Classic 排版试版"}>
    <span>{english ? "Classic · Paper study" : "Classic · 纸白试版"}</span>
    <div>{(["original", "paper"] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)}>{value === "original" ? english ? "Original" : "原版" : english ? "Preview" : "试版"}</button>)}</div>
    {mode === "paper" && <div className="classic-preview-palette" role="group" aria-label={english ? "Preview colors" : "试版配色"}>{palettes.map(value=><button key={value} type="button" aria-pressed={palette===value} onClick={()=>setPalette(value)}>{value==="blue" ? english?"Blue grey":"灰蓝" : value==="reference" ? english?"Reference red":"原图酒红" : english?"Ink & paper":"纸刊黑白"}</button>)}</div>}
  </aside>;
}
