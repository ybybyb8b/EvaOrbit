"use client";

import { useLocale } from "./locale-controller";
import { translateUiCopy } from "@/lib/ui-copy";
import { useUiCopyScope } from "./ui-copy-scope";

/** Shared page heading; route-specific navigation stays in PageHeader. */
export function PageHeading({ eyebrow, title, description, action, translatePage = true }: { eyebrow: string; title: React.ReactNode; description?: string; action?: React.ReactNode; translatePage?: boolean }) {
  const { language } = useLocale();
  const copyScope = useUiCopyScope<HTMLElement>(translatePage);
  const visibleDescription = description?.trim();
  return <header ref={copyScope} className="page-header"><div className="page-header-copy"><span className="eyebrow">{translateUiCopy(eyebrow, language)}</span><h1>{typeof title === "string" ? translateUiCopy(title, language) : title}</h1>{visibleDescription && <p className="page-header-description">{translateUiCopy(visibleDescription, language)}</p>}</div>{action}</header>;
}
