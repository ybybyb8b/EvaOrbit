"use client";
import { createContext, useContext, type CSSProperties } from "react";
import { Icon } from "./icons";

export const ReiconAssetContext = createContext<Record<string,string> | null>(null);

export function ReiconSymbol({ name, size = 20 }: { name: string; size?: number }) {
  const assets = useContext(ReiconAssetContext);
  if (assets && !assets[name]) return <Icon name="calendar" />;
  const url = `url("${assets?.[name] ?? `/api/reicon/${encodeURIComponent(name)}`}")`;
  return <span aria-hidden="true" className="reicon-symbol" style={{ width: size, height: size, maskImage: url, WebkitMaskImage: url } as CSSProperties} />;
}
