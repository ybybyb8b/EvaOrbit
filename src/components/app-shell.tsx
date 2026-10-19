"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import {AppSidebar,SpacesNavigation} from "./app-navigation";
import { Icon } from "./icons";
import { EvaWakePanel } from "./eva-wake-panel";
import { logout } from "@/app/login/actions";
import { NativeNotificationReconciler } from "./native-notification-reconciler";
import { EventKitReconciler } from "./eventkit-reconciler";
import { DataChangeReconciler } from "./data-change-reconciler";
import { NativeHapticController } from "./native-haptic-controller";
import { useLocale } from "./locale-controller";
import { PullToRefresh } from "./pull-to-refresh";
import { PageBackButton } from "./page-back-button";
import { pageNavigationState } from "@/lib/page-navigation";
import {MobileBottomNavigation} from "./mobile-bottom-navigation";
import bottomNav from "./bottom-navigation.module.css";
import { BottomLogProvider } from "./bottom-log";
import { HomeQuickLog } from "@/app/home-quick-log";
import { configureClientCache } from "@/lib/client-data-cache";
import { clearPrivateSnapshots } from "@/lib/home-cache";
import { clearClientJsonCache } from "@/lib/client-json-cache";
import { clearRememberedViews } from "./use-remembered-state";

export function AppShell({ children, cloudMode, cacheScope }: { children: React.ReactNode; cloudMode: boolean; cacheScope: string | null }) {
  useLayoutEffect(() => {
    configureClientCache(cacheScope);
    clearClientJsonCache();
    if (!cacheScope) { clearRememberedViews(); void clearPrivateSnapshots(); }
  }, [cacheScope]);
  return <BottomLogProvider key={cacheScope ?? "anonymous"}><AppShellContent cloudMode={cloudMode} cacheScope={cacheScope}>{children}</AppShellContent></BottomLogProvider>;
}

function AppShellContent({ children, cloudMode, cacheScope }: { children: React.ReactNode; cloudMode: boolean; cacheScope: string | null }) {
  const { english } = useLocale();
  const pathname = usePathname();
  const hasPageBack = pathname !== "/" && pathname !== "/login" && pathname !== "/native" && !pathname.startsWith("/oauth/") && !pathname.startsWith("/lucius");
  const hasGlobalHeader = pathname !== "/login" && !pathname.startsWith("/lucius");
  const previousUrlRef = useRef<string | null>(null);
  const [evaOpen, setEvaOpen] = useState(false);
  const globalHeaderRef = useRef<HTMLElement>(null);
  const [spacesDrawerMounted,setSpacesDrawerMounted]=useState(false);
  useEffect(() => {
    const resetPreviousPage = () => { previousUrlRef.current = null; };
    window.addEventListener("evaorbit:page-back-fallback", resetPreviousPage);
    return () => window.removeEventListener("evaorbit:page-back-fallback", resetPreviousPage);
  }, []);
  useEffect(() => {
    const url = window.location.href;
    if (previousUrlRef.current === url) return;
    window.history.replaceState(pageNavigationState(window.history.state, previousUrlRef.current !== null), "", url);
    previousUrlRef.current = url;
  });
  useEffect(() => {
    const header = globalHeaderRef.current;
    if (!hasGlobalHeader || !header) return;
    let frame: number | null = null;
    const updateHeader = () => {
      frame = null;
      header.style.setProperty("--header-opacity", String(Math.min(1, Math.max(0, window.scrollY / 80))));
    };
    const onScroll = () => {
      if (frame === null) frame = window.requestAnimationFrame(updateHeader);
    };
    updateHeader();
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [hasGlobalHeader, pathname]);

  if (pathname === "/login") return children;
  return (
    <div className={`app-shell ${bottomNav.shell}`}>
      <NativeHapticController />
      <NativeNotificationReconciler />
      <EventKitReconciler />
      <Suspense fallback={null}><DataChangeReconciler cacheScope={cacheScope} /></Suspense>
      <PullToRefresh enabled={!spacesDrawerMounted && !evaOpen} />
      <AppSidebar pathname={pathname} LinkComponent={Link} brandImage={<Image src="/icons/app-icon-192.png" alt="" width={68} height={68} priority />} footer={<>
        <div className="local-status"><span className="status-dot"/><span><strong>{english?cloudMode?"Private cloud":"Local mode":cloudMode?"私人云端":"本地模式"}</strong><small>{english?cloudMode?"Account and RLS enabled":"SQLite development fallback":cloudMode?"登录与行级权限已开启":"SQLite 开发后备"}</small></span></div>
        {cloudMode&&<form action={logout}><button className="sidebar-logout" type="submit">{english?"Sign out":"退出登录"}</button></form>}
      </>}/>
      <main className={`main-content${hasPageBack ? " has-page-back" : ""}`}>
        {hasPageBack && <header className="desktop-page-navigation"><PageBackButton /></header>}
        {children}
      </main>
      <SpacesNavigation pathname={pathname} LinkComponent={Link} onOpenChange={setSpacesDrawerMounted} renderTrigger={trigger=>hasGlobalHeader?<header ref={globalHeaderRef} className="mobile-global-header">{hasPageBack&&<PageBackButton/>}{trigger}</header>:trigger}/>
      {pathname !== "/ai" && <button className="eva-wake-desktop" onClick={() => setEvaOpen(true)} aria-label="Wake Eva"><Icon name="ai" /><span>Eva</span></button>}
      <MobileBottomNavigation pathname={pathname} LinkComponent={Link} />
      <HomeQuickLog key={pathname} />
      <EvaWakePanel open={evaOpen} onClose={() => setEvaOpen(false)} />
    </div>
  );
}
