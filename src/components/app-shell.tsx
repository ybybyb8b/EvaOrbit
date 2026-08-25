"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";
import { logout } from "@/app/login/actions";

const navigation = [
  { href: "/", label: "首页", icon: "home" as const },
  { href: "/ai", label: "想想", icon: "ai" as const },
  { href: "/tasks", label: "待办", icon: "tasks" as const },
  { href: "/inbox", label: "Inbox", icon: "inbox" as const },
  { href: "/memory", label: "留下的", icon: "memory" as const },
  { href: "/food", label: "饮食", icon: "food" as const },
  { href: "/drinks", label: "饮品", icon: "drink" as const },
];

const mobileNavigation = [navigation[0],navigation[1],navigation[5],navigation[2],{ href: "/settings", label: "更多", icon: "settings" as const }];

export function AppShell({ children, cloudMode }: { children: React.ReactNode; cloudMode: boolean }) {
  const pathname = usePathname();
  if (pathname === "/login") return children;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand" aria-label="EvaOrbit 首页">
          <span className="brand-mark"><span /></span>
          <span><strong>EvaOrbit</strong><small>MY QUIET SPACE</small></span>
        </Link>
        <nav className="main-nav" aria-label="主导航">
          {navigation.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return <Link key={item.href} href={item.href} className={active ? "active" : ""}><Icon name={item.icon} /><span>{item.label}</span></Link>;
          })}
        </nav>
        <div className="sidebar-bottom">
          <Link href="/settings" className={pathname.startsWith("/settings") ? "active" : ""}><Icon name="settings" /><span>设置</span></Link>
          <div className="local-status"><span className="status-dot" /><span><strong>{cloudMode ? "私人云端" : "本地模式"}</strong><small>{cloudMode ? "登录与行级权限已开启" : "SQLite 开发后备"}</small></span></div>
          {cloudMode && <form action={logout}><button className="sidebar-logout" type="submit">退出登录</button></form>}
        </div>
      </aside>
      <main className="main-content">{children}</main>
      <nav className="mobile-nav" aria-label="移动端导航">
        {mobileNavigation.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return <Link key={item.href} href={item.href} className={active ? "active" : ""}><Icon name={item.icon} /><span>{item.label}</span></Link>;
        })}
      </nav>
    </div>
  );
}
