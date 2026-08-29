"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon } from "./icons";
import { EvaWakePanel } from "./eva-wake-panel";
import { logout } from "@/app/login/actions";

const navigationGroups = [
  { label: "SPACE", items: [
    { href: "/", label: "Home", icon: "home" as const },
    { href: "/inbox", label: "Inbox", icon: "inbox" as const },
    { href: "/ai", label: "Eva", icon: "ai" as const },
    { href: "/notifications", label: "Notifications", icon: "notifications" as const },
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
    { href: "/lucius", label: "Lucius", icon: "history" as const },
  ] },
];

export function AppShell({ children, cloudMode }: { children: React.ReactNode; cloudMode: boolean }) {
  const pathname = usePathname();
  const [evaOpen, setEvaOpen] = useState(false);
  if (pathname === "/login") return children;
  return (
    <div className="app-shell">
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
      {pathname !== "/ai" && <button className="eva-wake-desktop" onClick={() => setEvaOpen(true)} aria-label="Wake Eva"><Icon name="ai" /><span>Eva</span></button>}
      <nav className="mobile-nav" aria-label="移动端导航">
        <Link href="/" className={pathname === "/" ? "active" : ""}><Icon name="home" variant="nav" /><span>Home</span></Link>
        <Link href="/settings" className={pathname.startsWith("/settings") ? "active" : ""}><Icon name="settings" variant="nav" /><span>Settings</span></Link>
      </nav>
      <EvaWakePanel open={evaOpen} onClose={() => setEvaOpen(false)} />
    </div>
  );
}
