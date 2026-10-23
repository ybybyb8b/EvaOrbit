"use client";
import {useCallback,useEffect,useRef,useState,type ComponentType,type ComponentProps,type ReactNode} from "react";
import { Activity, Book, Calendar, ChatRoundDots, ClipboardCheck, CupPaper, DirectInbox, Film, Folder, FoodTray, Heart, Home, Menu4, NoteText, Pet, Settings, Sparkles, Users } from "reicon-react";
import {Icon} from "./icons";
import {useLocale} from "./locale-controller";
import {isFoodDrinkPath} from "@/lib/page-navigation";
export type NavigationLinkProps=ComponentProps<"a">&{href:string};
type NavigationProps={pathname:string;LinkComponent:ComponentType<NavigationLinkProps>;allowedPaths?:ReadonlySet<string>};
const navigationGroups = [
  { label: "LIFE", items: [
    { href: "/trackers", label: "Trackers", zh: "观测", icon: "tracker" as const },
    { href: "/food-drink", label: "Food & Drink", zh: "Food & Drink", icon: "foodDrink" as const },
    { href: "/subscriptions", label: "Subscriptions", zh: "订阅", icon: "calendar" as const },
    { href: "/health", label: "Health", zh: "体征", icon: "health" as const },
    { href: "/cats", label: "Cats", zh: "咪子", icon: "cats" as const },
  ] },
  { label: "ARCHIVE", items: [
    { href: "/chronicle", label: "Chronicle", zh: "纪事", icon: "chronicle" as const },
    { href: "/relations", label: "Relations", zh: "她们", icon: "people" as const },
    { href: "/media", label: "Media", zh: "展架", icon: "media" as const },
    { href: "/memo", label: "Memo", zh: "碎片", icon: "memory" as const },
  ] },
  { label: "SPACE", items: [
    { href: "/", label: "Home", zh: "首页", icon: "home" as const },
    { href: "/inbox", label: "Inbox", zh: "散落", icon: "inbox" as const },
    { href: "/tasks", label: "Tasks", zh: "待办", icon: "tasks" as const },
    { href: "/ai", label: "Eva", icon: "ai" as const },
    { href: "/lucius", label: "Lucius", icon: "lucius" as const },
    { href: "/projects", label: "Projects", zh: "工坊", icon: "projects" as const },
  ] },
];

const sidebarIcons = {
  tracker: Activity, food: FoodTray, drink: CupPaper, foodDrink: FoodTray, calendar: Calendar,
  health: Heart, cats: Pet, chronicle: Book, people: Users, media: Film,
  memory: NoteText, home: Home, inbox: DirectInbox, tasks: ClipboardCheck,
  ai: Sparkles, lucius: ChatRoundDots, projects: Folder,
};

type SpacesDrawerPhase = "closed" | "opening" | "open" | "closing";
const SPACES_DRAWER_CLOSE_FALLBACK_MS = 240;

function visibleGroups(allowedPaths?:ReadonlySet<string>){return navigationGroups.map(group=>({...group,items:group.items.filter(item=>!allowedPaths||allowedPaths.has(item.href))})).filter(group=>group.items.length);}
export function AppSidebar({pathname,LinkComponent:Link,allowedPaths,brandImage,footer}:{brandImage:ReactNode;footer?:ReactNode}&NavigationProps){
 const {english}=useLocale();const groups=visibleGroups(allowedPaths);
 return (
      <aside className="sidebar">
        <Link href="/" className="brand" aria-label={english ? "EvaOrbit Home" : "EvaOrbit 首页"}>
          <span className="brand-mark">{brandImage}</span>
          <span><strong>EvaOrbit</strong><small>{english ? "MY QUIET SPACE" : "我的安静空间"}</small></span>
        </Link>
        <nav className="main-nav" aria-label={english ? "Main navigation" : "主导航"}>
          {groups.map((group) => <div className="nav-group" key={group.label}><span className="nav-group-label">{english ? group.label : group.label === "SPACE" ? "空间" : group.label === "LIFE" ? "生活" : "档案"}</span>{group.items.map((item) => {
            const active = item.href === "/food-drink" ? isFoodDrinkPath(pathname) : item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const SidebarIcon = sidebarIcons[item.icon];
            return <Link key={item.href} href={item.href} className={active ? "active" : ""} aria-current={active?"page":undefined} aria-label={english?item.label:item.zh??item.label}><SidebarIcon className="icon" weight="Outline" aria-hidden="true" /><span>{english ? item.label : item.zh ?? item.label}</span></Link>;
          })}</div>)}
        </nav>
        <div className="sidebar-bottom">
          <Link aria-label={english?"Settings":"设置"} href="/settings" className={pathname.startsWith("/settings") ? "active" : ""}><Settings className="icon" weight="Outline" aria-hidden="true" /><span>{english ? "Settings" : "设置"}</span></Link>
          {footer}
        </div>
      </aside>
 );
}

export function SpacesNavigation({pathname,LinkComponent:Link,allowedPaths,renderTrigger,onOpenChange}:NavigationProps&{renderTrigger?:(trigger:ReactNode)=>ReactNode;onOpenChange?:(open:boolean)=>void}){
 const {english}=useLocale();const groups=visibleGroups(allowedPaths);
  const [spacesDrawerPhase, setSpacesDrawerPhase] = useState<SpacesDrawerPhase>("closed");
  const spacesTriggerRef = useRef<HTMLButtonElement>(null);
  const spacesLayerRef = useRef<HTMLDivElement>(null);
  const spacesDrawerRef = useRef<HTMLElement>(null);
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
    const drawer = spacesDrawerRef.current;
    const layer = spacesLayerRef.current;
    const trigger = spacesTriggerRef.current;
    const inertSiblings = Array.from(layer?.parentElement?.children ?? [])
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== layer)
      .map((element) => ({ element, inert: element.inert }));
    const previousOverflow = body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeSpacesDrawer();
        return;
      }
      if (event.key !== "Tab" || !drawer) return;
      const focusable = Array.from(drawer.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])'))
        .filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        drawer.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !drawer.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !drawer.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    inertSiblings.forEach(({ element }) => { element.inert = true; });
    body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => drawer?.querySelector<HTMLElement>("button")?.focus());
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      body.style.overflow = previousOverflow;
      inertSiblings.forEach(({ element, inert }) => { element.inert = inert; });
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", closeOnEscape);
      trigger?.focus();
    };
  }, [closeSpacesDrawer, spacesDrawerMounted]);

  const finishSpacesDrawerClose = (event: React.TransitionEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget || (event.propertyName !== "transform" && event.propertyName !== "opacity")) return;
    setSpacesDrawerPhase((phase) => phase === "closing" ? "closed" : phase);
  };

  useEffect(()=>{onOpenChange?.(spacesDrawerMounted);},[onOpenChange,spacesDrawerMounted]);
  const spacesTrigger = <button ref={spacesTriggerRef} type="button" className={`spaces-drawer-trigger ${spacesDrawerMounted ? "active" : ""}`} aria-label={english ? "Open spaces" : "打开空间导航"} aria-haspopup="dialog" aria-expanded={spacesDrawerMounted} onClick={openSpacesDrawer}><Menu4 className="spaces-drawer-icon" size={20} weight="Outline" strokeWidth={1.25} aria-hidden="true" /></button>;
  return <>{renderTrigger?renderTrigger(spacesTrigger):spacesTrigger}
      {spacesDrawerMounted && <div ref={spacesLayerRef} className="space-drawer-layer" data-state={spacesDrawerPhase} role="presentation">
        <button className="space-drawer-backdrop" type="button" aria-label={english ? "Close spaces" : "关闭空间导航"} onClick={closeSpacesDrawer} />
        <aside ref={spacesDrawerRef} className="space-drawer" role="dialog" aria-modal="true" aria-label={english ? "All spaces" : "总览"} tabIndex={-1} onTransitionEnd={finishSpacesDrawerClose}>
          <header><strong>{english ? "All Spaces" : "总览"}</strong><button type="button" aria-label={english ? "Close spaces" : "关闭空间导航"} onClick={closeSpacesDrawer}><Icon name="close" /></button></header>
          <nav aria-label={english ? "All spaces" : "总览"}>
            {groups.filter(group=>group.items.some(item=>item.href!=="/")).map((group) => <section key={group.label}>
              <span>{english ? group.label : group.label === "SPACE" ? "空间" : group.label === "LIFE" ? "生活" : "档案"}</span>
              {group.items.filter((item) => item.href !== "/").map((item) => {
                const active = item.href === "/food-drink" ? isFoodDrinkPath(pathname) : pathname.startsWith(item.href);
                return <Link href={item.href} className={active ? "active" : ""} onClick={closeSpacesDrawer} aria-current={active?"page":undefined} key={item.href}><Icon name={item.icon} /><strong>{english ? item.label : item.zh ?? item.label}</strong></Link>;
              })}
            </section>)}
          </nav>
        </aside>
      </div>}
</>;
}
