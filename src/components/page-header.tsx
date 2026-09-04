"use client";

import { useLocale } from "@/components/locale-controller";
import { translateUiCopy } from "@/lib/ui-copy";

export function PageHeader({ eyebrow, title, action }: { eyebrow: string; title: React.ReactNode; description?: string; action?: React.ReactNode }) {
  const { language } = useLocale();
  return <header className="page-header">
    <div><span className="eyebrow">{translateUiCopy(eyebrow, language)}</span><h1>{typeof title === "string" ? translateUiCopy(title, language) : title}</h1></div>
    {action}
  </header>;
}
