import type { CSSProperties } from "react";

export function ReiconSymbol({ name, size = 20 }: { name: string; size?: number }) {
  const url = `url("/api/reicon/${encodeURIComponent(name)}")`;
  return <span aria-hidden="true" className="reicon-symbol" style={{ width: size, height: size, maskImage: url, WebkitMaskImage: url } as CSSProperties} />;
}
