"use client";

import { PageHeader } from "./page-header";
import { useLocale } from "./locale-controller";

export function PageLoading({ title, englishTitle }: { title: string; englishTitle: string }) {
  const { english } = useLocale();
  return <div className="page" aria-busy="true"><PageHeader eyebrow="" title={english ? englishTitle : title} /><p role="status">{english ? "Loading…" : "正在读取…"}</p></div>;
}
