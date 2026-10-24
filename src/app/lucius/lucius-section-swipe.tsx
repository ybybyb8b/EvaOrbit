"use client";

import { useCallback, useRef, type ReactNode } from "react";
import { useSectionSwipe } from "@/components/use-section-swipe";

const sections = ["posts", "diary", "cases"] as const;
const links = { posts: "/lucius", diary: "/lucius?tab=diary", cases: "/lucius?tab=cases" };

export function LuciusSectionSwipe({ tab, children }: { tab: typeof sections[number]; children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null), navRef = useRef<HTMLElement>(null);
  const setRoot = useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    navRef.current = node?.querySelector<HTMLElement>(".lucius-profile-tabs") ?? null;
  }, []);
  useSectionSwipe({ active: tab, sections, rootRef, feedbackRef: navRef, onChange: next => navRef.current?.querySelector<HTMLAnchorElement>(`a[href="${links[next]}"]`)?.click(), ignoreSelector: ".lucius-post-comments, form" });
  return <div ref={setRoot} className="lucius-profile-page">{children}</div>;
}
