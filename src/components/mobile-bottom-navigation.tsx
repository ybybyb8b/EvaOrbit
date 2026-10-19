"use client";
import type {ComponentType,ReactNode} from "react";
import {Icon} from "./icons";
import {useLocale} from "./locale-controller";
export type BottomNavigationLinkProps={href:string;className?:string;"aria-current"?:"page";children:ReactNode};
export function MobileBottomNavigation({pathname,LinkComponent:Link}:{pathname:string;LinkComponent:ComponentType<BottomNavigationLinkProps>}){
  const {english}=useLocale();
  return <nav className="mobile-nav" data-active-tab={pathname==="/"?0:pathname.startsWith("/settings")?1:undefined} aria-label={english?"Mobile navigation":"移动端导航"}>
    <Link href="/" className={pathname==="/"?"active":""} aria-current={pathname==="/"?"page":undefined}><Icon name="home" variant="nav"/><span>{english?"Home":"首页"}</span></Link>
    <Link href="/settings" className={pathname.startsWith("/settings")?"active":""} aria-current={pathname.startsWith("/settings")?"page":undefined}><Icon name="settings" variant="nav"/><span>{english?"Settings":"设置"}</span></Link>
  </nav>;
}
