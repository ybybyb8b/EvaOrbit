"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef } from "react";
import { useLocale } from "@/components/locale-controller";
import { useSectionSwipe } from "@/components/use-section-swipe";
import styles from "./subscription-sections.module.css";

type Section = "overview" | "trends" | "library";
const sectionKeys = ["overview", "trends", "library"] as const;

export function SubscriptionSections({ active, onViewChange }: { active: Section; onViewChange?: (view: "overview" | "trends") => void }) {
  const { english } = useLocale();
  const navRef = useRef<HTMLElement>(null), rootRef = useRef<HTMLElement | null>(null);
  const sections = useMemo(() => [
    { key: "overview", href: "/subscriptions?view=overview", label: english ? "Overview" : "订阅首页" },
    { key: "trends", href: "/subscriptions?view=trends", label: english ? "Trends" : "趋势统计" },
    { key: "library", href: "/subscriptions/library", label: english ? "Library" : "软件库" },
  ] as const, [english]);
  const setNav = useCallback((node: HTMLElement | null) => { navRef.current = node; rootRef.current = node?.closest<HTMLElement>(".page") ?? null; }, []);
  const activate = useCallback((section: Section) => navRef.current?.querySelector<HTMLElement>(`[data-section-key="${section}"]`)?.click(), []);
  useSectionSwipe({ active, sections: sectionKeys, rootRef, feedbackRef: navRef, onChange: activate, ignoreSelector: "[data-subscription-swipe-ignore]", interactiveSurfaceSelector: "[data-subscription-swipe-surface]" });

  return <nav ref={setNav} className={styles.sections} aria-label={english ? "Subscriptions sections" : "订阅分区"}>
    {sections.map((section) => onViewChange && section.key !== "library"
      ? <button key={section.key} data-section-key={section.key} aria-pressed={active === section.key} onClick={() => onViewChange(section.key as "overview" | "trends")}>{section.label}</button>
      : <Link key={section.key} data-section-key={section.key} href={section.href} aria-current={active === section.key ? "page" : undefined}>{section.label}</Link>)}
  </nav>;
}
