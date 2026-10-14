"use client";

import { useLocale } from "@/components/locale-controller";
import { translateUiCopy } from "@/lib/ui-copy";
import { usePathname } from "next/navigation";
import { PageBackButton } from "./page-back-button";
import { useUiCopyScope } from "./ui-copy-scope";

export function PageHeader({ eyebrow, title, description, action, translatePage = true }: { eyebrow: string; title: React.ReactNode; description?: string; action?: React.ReactNode; translatePage?: boolean }) {
  const { language } = useLocale();
  const pathname = usePathname();
  const copyScope = useUiCopyScope<HTMLElement>(translatePage);
  const visibleDescription = description?.trim();
  return <>{pathname.startsWith("/lucius/") && <header className="lucius-page-navigation"><PageBackButton /></header>}<header ref={copyScope} className="page-header">
    <div className="page-header-copy"><span className="eyebrow">{translateUiCopy(eyebrow, language)}</span><h1>{typeof title === "string" ? translateUiCopy(title, language) : title}</h1>{visibleDescription && <p className="page-header-description">{translateUiCopy(visibleDescription, language)}</p>}</div>
    {action}
  </header></>;
}
