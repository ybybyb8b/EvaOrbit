"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "./icons";
import { EvaWakePanel } from "./eva-wake-panel";
import { logout } from "@/app/login/actions";
import { NativeNotificationReconciler } from "./native-notification-reconciler";
import { ThemeController } from "./theme-controller";
import { useLocale } from "./locale-controller";
import { PullToRefresh } from "./pull-to-refresh";

const navigationGroups = [
  { label: "SPACE", items: [
    { href: "/", label: "Home", zh: "首页", icon: "home" as const },
    { href: "/inbox", label: "Inbox", zh: "散落", icon: "inbox" as const },
    { href: "/ai", label: "Eva", icon: "ai" as const },
    { href: "/lucius", label: "Lucius", icon: "lucius" as const },
    { href: "/projects", label: "Projects", zh: "工坊", icon: "tasks" as const },
  ] },
  { label: "LIFE", items: [
    { href: "/trackers", label: "Trackers", zh: "观测", icon: "tracker" as const },
    { href: "/food", label: "Food", zh: "吃吃", icon: "food" as const },
    { href: "/drinks", label: "Drinks", zh: "喝喝", icon: "drink" as const },
    { href: "/health", label: "Health", zh: "体征", icon: "health" as const },
    { href: "/cats", label: "Cats", zh: "咪子", icon: "cats" as const },
  ] },
  { label: "ARCHIVE", items: [
    { href: "/relations", label: "Relations", zh: "她们", icon: "people" as const },
    { href: "/media", label: "Media", zh: "展架", icon: "media" as const },
    { href: "/memo", label: "Memo", zh: "碎片", icon: "memory" as const },
    { href: "/chronicle", label: "Chronicle", zh: "纪事", icon: "chronicle" as const },
  ] },
];

type SpacesDrawerPhase = "closed" | "opening" | "open" | "closing";
const SPACES_DRAWER_CLOSE_FALLBACK_MS = 240;

export function AppShell({ children, cloudMode }: { children: React.ReactNode; cloudMode: boolean }) {
  const { english } = useLocale();
  const pathname = usePathname();
  const [evaOpen, setEvaOpen] = useState(false);
  const [spacesDrawerPhase, setSpacesDrawerPhase] = useState<SpacesDrawerPhase>("closed");
  const spacesDrawerMounted = spacesDrawerPhase !== "closed";
  const openSpacesDrawer = useCallback(() => {
    setSpacesDrawerPhase((phase) => phase === "closed" || phase === "closing" ? "opening" : phase);
  }, []);
  const closeSpacesDrawer = useCallback(() => {
    setSpacesDrawerPhase((phase) => phase === "opening" || phase === "open" ? "closing" : phase);
  }, []);

  useEffect(() => {
    if (spacesDrawerPhase !== "opening") return;
    const frame = window.requestAnimationFrame(() => {
      setSpacesDrawerPhase((phase) => phase === "opening" ? "open" : phase);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [spacesDrawerPhase]);

  useEffect(() => {
    if (spacesDrawerPhase !== "closing") return;
    const fallback = window.setTimeout(() => {
      setSpacesDrawerPhase((phase) => phase === "closing" ? "closed" : phase);
    }, SPACES_DRAWER_CLOSE_FALLBACK_MS);
    return () => window.clearTimeout(fallback);
  }, [spacesDrawerPhase]);

  useEffect(() => {
    if (!spacesDrawerMounted) return;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSpacesDrawer();
    };
    body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [closeSpacesDrawer, spacesDrawerMounted]);

  const finishSpacesDrawerClose = (event: React.TransitionEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget || (event.propertyName !== "transform" && event.propertyName !== "opacity")) return;
    setSpacesDrawerPhase((phase) => phase === "closing" ? "closed" : phase);
  };

  if (pathname === "/login") return children;
  return (
    <div className="app-shell">
      <ThemeController />
      <NativeNotificationReconciler />
      <PullToRefresh enabled={!spacesDrawerMounted && !evaOpen} />
      <aside className="sidebar">
        <Link href="/" className="brand" aria-label={english ? "EvaOrbit Home" : "EvaOrbit 首页"}>
          <span className="brand-mark"><Image src="/icons/app-icon-192.png" alt="" width={68} height={68} priority /></span>
          <span><strong>EvaOrbit</strong><small>{english ? "MY QUIET SPACE" : "我的安静空间"}</small></span>
        </Link>
        <nav className="main-nav" aria-label={english ? "Main navigation" : "主导航"}>
          {navigationGroups.map((group) => <div className="nav-group" key={group.label}><span className="nav-group-label">{english ? group.label : group.label === "SPACE" ? "空间" : group.label === "LIFE" ? "生活" : "档案"}</span>{group.items.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return <Link key={item.href} href={item.href} className={active ? "active" : ""}><Icon name={item.icon} variant="stroke" /><span>{english ? item.label : item.zh ?? item.label}</span></Link>;
          })}</div>)}
        </nav>
        <div className="sidebar-bottom">
          <Link href="/settings" className={pathname.startsWith("/settings") ? "active" : ""}><Icon name="settings" variant="stroke" /><span>{english ? "Settings" : "设置"}</span></Link>
          <div className="local-status"><span className="status-dot" /><span><strong>{english ? cloudMode ? "Private cloud" : "Local mode" : cloudMode ? "私人云端" : "本地模式"}</strong><small>{english ? cloudMode ? "Account and RLS enabled" : "SQLite development fallback" : cloudMode ? "登录与行级权限已开启" : "SQLite 开发后备"}</small></span></div>
          {cloudMode && <form action={logout}><button className="sidebar-logout" type="submit">{english ? "Sign out" : "退出登录"}</button></form>}
        </div>
      </aside>
      <main className="main-content">{children}</main>
      <button type="button" className={`spaces-drawer-trigger ${spacesDrawerMounted ? "active" : ""}`} aria-label={english ? "Open spaces" : "打开空间导航"} aria-haspopup="dialog" aria-expanded={spacesDrawerMounted} onClick={openSpacesDrawer}><span className="spaces-menu-lines" aria-hidden="true"><i /><i /><i /></span></button>
      {pathname !== "/ai" && <button className="eva-wake-desktop" onClick={() => setEvaOpen(true)} aria-label="Wake Eva"><Icon name="ai" /><span>Eva</span></button>}
      <nav className="mobile-nav" aria-label={english ? "Mobile navigation" : "移动端导航"}>
        <Link href="/" className={pathname === "/" ? "active" : ""}><Icon name="home" variant="nav" /><span>{english ? "Home" : "首页"}</span></Link>
        <Link href="/lucius" className={pathname.startsWith("/lucius") ? "active" : ""}><Icon name="lucius" variant="nav" /><span>Lucius</span></Link>
        <Link href="/settings" className={pathname.startsWith("/settings") ? "active" : ""}><Icon name="settings" variant="nav" /><span>{english ? "Settings" : "设置"}</span></Link>
      </nav>
      {spacesDrawerMounted && <div className="space-drawer-layer" data-state={spacesDrawerPhase} role="presentation">
        <button className="space-drawer-backdrop" type="button" aria-label={english ? "Close spaces" : "关闭空间导航"} onClick={closeSpacesDrawer} />
        <aside className="space-drawer" role="dialog" aria-modal="true" aria-label={english ? "All spaces" : "总览"} onTransitionEnd={finishSpacesDrawerClose}>
          <header><strong>{english ? "All Spaces" : "总览"}</strong><button type="button" aria-label={english ? "Close spaces" : "关闭空间导航"} onClick={closeSpacesDrawer}><Icon name="close" /></button></header>
          <nav aria-label={english ? "All spaces" : "总览"}>
            {navigationGroups.map((group) => <section key={group.label}>
              <span>{english ? group.label : group.label === "SPACE" ? "空间" : group.label === "LIFE" ? "生活" : "档案"}</span>
              {group.items.filter((item) => item.href !== "/").map((item) => {
                const active = pathname.startsWith(item.href);
                return <Link href={item.href} className={active ? "active" : ""} onClick={closeSpacesDrawer} key={item.href}><Icon name={item.icon} /><strong>{english ? item.label : item.zh ?? item.label}</strong></Link>;
              })}
            </section>)}
          </nav>
        </aside>
      </div>}
      <EvaWakePanel open={evaOpen} onClose={() => setEvaOpen(false)} />
    </div>
  );
}
