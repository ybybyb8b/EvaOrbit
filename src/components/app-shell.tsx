"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "./icons";
import { EvaWakePanel } from "./eva-wake-panel";
import { logout } from "@/app/login/actions";
import { NativeNotificationReconciler } from "./native-notification-reconciler";
import { ThemeController } from "./theme-controller";

const navigationGroups = [
  { label: "SPACE", items: [
    { href: "/", label: "Home", icon: "home" as const },
    { href: "/inbox", label: "Inbox", icon: "inbox" as const },
    { href: "/ai", label: "Eva", icon: "ai" as const },
    { href: "/lucius", label: "Lucius", icon: "lucius" as const },
    { href: "/projects", label: "Projects", icon: "tasks" as const },
  ] },
  { label: "LIFE", items: [
    { href: "/trackers", label: "Trackers", icon: "tracker" as const },
    { href: "/food", label: "Food", icon: "food" as const },
    { href: "/drinks", label: "Drinks", icon: "drink" as const },
    { href: "/health", label: "Health", icon: "health" as const },
    { href: "/cats", label: "Cats", icon: "cats" as const },
  ] },
  { label: "ARCHIVE", items: [
    { href: "/people", label: "People", icon: "people" as const },
    { href: "/media", label: "Media", icon: "media" as const },
    { href: "/memo", label: "Memo", icon: "memory" as const },
    { href: "/chronicle", label: "Chronicle", icon: "chronicle" as const },
  ] },
];

export function AppShell({ children, cloudMode }: { children: React.ReactNode; cloudMode: boolean }) {
  const pathname = usePathname();
  const [evaOpen, setEvaOpen] = useState(false);
  const [spacesOpen, setSpacesOpen] = useState(false);

  useEffect(() => {
    if (!spacesOpen) return;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSpacesOpen(false);
    };
    body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [spacesOpen]);
  if (pathname === "/login") return children;
  return (
    <div className="app-shell">
      <ThemeController />
      <NativeNotificationReconciler />
      <aside className="sidebar">
        <Link href="/" className="brand" aria-label="EvaOrbit 首页">
          <span className="brand-mark"><Image src="/icons/app-icon-192.png" alt="" width={68} height={68} priority /></span>
          <span><strong>EvaOrbit</strong><small>MY QUIET SPACE</small></span>
        </Link>
        <nav className="main-nav" aria-label="主导航">
          {navigationGroups.map((group) => <div className="nav-group" key={group.label}><span className="nav-group-label">{group.label}</span>{group.items.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return <Link key={item.href} href={item.href} className={active ? "active" : ""}><Icon name={item.icon} variant="stroke" /><span>{item.label}</span></Link>;
          })}</div>)}
        </nav>
        <div className="sidebar-bottom">
          <Link href="/settings" className={pathname.startsWith("/settings") ? "active" : ""}><Icon name="settings" variant="stroke" /><span>Settings</span></Link>
          <div className="local-status"><span className="status-dot" /><span><strong>{cloudMode ? "私人云端" : "本地模式"}</strong><small>{cloudMode ? "登录与行级权限已开启" : "SQLite 开发后备"}</small></span></div>
          {cloudMode && <form action={logout}><button className="sidebar-logout" type="submit">退出登录</button></form>}
        </div>
      </aside>
      <main className="main-content">{children}</main>
      <button type="button" className={`spaces-drawer-trigger ${spacesOpen ? "active" : ""}`} aria-label="打开空间导航" aria-haspopup="dialog" onClick={() => setSpacesOpen(true)}><span className="spaces-menu-lines" aria-hidden="true"><i /><i /><i /></span></button>
      {pathname !== "/ai" && <button className="eva-wake-desktop" onClick={() => setEvaOpen(true)} aria-label="Wake Eva"><Icon name="ai" /><span>Eva</span></button>}
      <nav className="mobile-nav" aria-label="移动端导航">
        <Link href="/" className={pathname === "/" ? "active" : ""}><Icon name="home" variant="nav" /><span>Home</span></Link>
        <Link href="/lucius" className={pathname.startsWith("/lucius") ? "active" : ""}><Icon name="lucius" variant="nav" /><span>Lucius</span></Link>
        <Link href="/settings" className={pathname.startsWith("/settings") ? "active" : ""}><Icon name="settings" variant="nav" /><span>Settings</span></Link>
      </nav>
      {spacesOpen && <div className="space-drawer-layer" role="presentation">
        <button className="space-drawer-backdrop" type="button" aria-label="关闭空间导航" onClick={() => setSpacesOpen(false)} />
        <aside className="space-drawer" role="dialog" aria-modal="true" aria-label="全部空间">
          <header><strong>全部空间</strong><button type="button" aria-label="关闭空间导航" onClick={() => setSpacesOpen(false)}><Icon name="close" /></button></header>
          <nav aria-label="全部空间">
            {navigationGroups.map((group) => <section key={group.label}>
              <span>{group.label === "SPACE" ? "空间" : group.label === "LIFE" ? "生活" : "档案"}</span>
              {group.items.filter((item) => item.href !== "/").map((item) => {
                const active = pathname.startsWith(item.href);
                return <Link href={item.href} className={active ? "active" : ""} onClick={() => setSpacesOpen(false)} key={item.href}><Icon name={item.icon} /><strong>{item.label}</strong></Link>;
              })}
            </section>)}
          </nav>
        </aside>
      </div>}
      <EvaWakePanel open={evaOpen} onClose={() => setEvaOpen(false)} />
    </div>
  );
}
