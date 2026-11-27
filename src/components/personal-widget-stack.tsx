"use client";
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MoreH } from "reicon-react";
import { emptyWidgetStack, initialWidgetStack, parseWidgetStack, type WidgetStackConfig } from "@/lib/personal-widgets";
import { parseStackIds } from "@/lib/home-tracker-stack";
import { useLocale } from "./locale-controller";
import { ErrorNotice } from "./error-notice";
import { WidgetProvider, useWidgetEnvironment, type WidgetEnvironment } from "./widgets/widget-context";
import { WidgetStackEditor } from "./widgets/widget-stack-editor";
import { widgetDefinition } from "./widgets/widget-registry";
import styles from "./personal-widget-stack.module.css";

export function PersonalWidgetStack({ cacheScope, environment }: { cacheScope: string; environment: WidgetEnvironment }) {
  return <WidgetProvider key={cacheScope} environment={environment}><WidgetStack key={cacheScope} cacheScope={cacheScope}/></WidgetProvider>;
}
function WidgetStack({ cacheScope }: { cacheScope: string }) {
  const { english } = useLocale(), environment = useWidgetEnvironment();
  const key = `eo:personal-widget-stack:${cacheScope}`;
  const [config,setConfig] = useState<WidgetStackConfig | null>(null), [editing,setEditing] = useState(false), [error,setError] = useState("");
  const viewport = useRef<HTMLDivElement>(null), railThumb = useRef<HTMLSpanElement>(null), navigating = useRef(false), previous = useRef<string[]>([]);
  const spring = useRef<number | null>(null), settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null), touching = useRef(false), railPointer = useRef(false);
  const stopSpring = useCallback(() => {
    if(spring.current !== null)cancelAnimationFrame(spring.current);
    spring.current=null;
    if(settleTimer.current !== null)clearTimeout(settleTimer.current);
  },[]);
  const scrollToWidget = useCallback((target:number,animate:boolean) => {
    stopSpring();const element=viewport.current;if(!element)return;
    if(!animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches){element.scrollTop=target;return;}
    let position=element.scrollTop,velocity=0,last=performance.now();const started=last;
    const step=(now:number) => {
      // A damped spring (mass 1, stiffness 100, damping 10); accelerated time keeps capture responsive.
      const dt=Math.min((now-last)/1000,.025)*2;last=now;
      velocity+=(-100*(position-target)-10*velocity)*dt;position+=velocity*dt;
      if(now-started>600 || Math.abs(position-target)<.25 && Math.abs(velocity)<1){element.scrollTop=target;spring.current=null;return;}
      element.scrollTop=position;spring.current=requestAnimationFrame(step);
    };
    spring.current=requestAnimationFrame(step);
  },[stopSpring]);
  useEffect(() => stopSpring,[stopSpring]);
  const moveRail = useCallback((position:number,count:number) => {
    const thumb=railThumb.current;
    if(!thumb?.parentElement)return;
    const fraction=count>1 ? Math.max(0,Math.min(1,position/(count-1))) : 0;
    thumb.style.transform=`translateY(${fraction*(thumb.parentElement.clientHeight-thumb.offsetHeight)}px)`;
  },[]);
  const [attempt,setAttempt] = useState(0);
  const [instant,setInstant] = useState(false);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const saved = parseWidgetStack(localStorage.getItem(key));
        if (saved) { if(alive){setConfig(saved);setError("");} return; }
        const legacy = localStorage.getItem(`eo:home-tracker-stack:${cacheScope}`);
        const initial = initialWidgetStack(parseStackIds(legacy) !== null ? [] : await environment.trackerList(),legacy);
        if(!alive)return;
        localStorage.setItem(key,JSON.stringify(initial));setConfig(initial);setError("");
      } catch(reason) { if(alive) {setConfig(emptyWidgetStack());setError(reason instanceof Error ? reason.message : String(reason));} }
    })();
    return () => {alive=false;};
  // Data refreshes must not reset the selected widget or a live edit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[key,cacheScope,attempt]);
  const commit = useCallback((next: WidgetStackConfig) => {
    setConfig(next);
    try {localStorage.setItem(key,JSON.stringify(next));setError("");}
    catch {setError(english ? "Could not save this stack on this device." : "无法在当前设备保存叠放配置。");}
  },[key,english]);
  useEffect(() => {
    const changed = (event:StorageEvent) => {
      if(event.key !== key)return;const next=parseWidgetStack(event.newValue);if(!next)return;
      navigating.current=true;
      const index=Math.max(0,next.widgets.findIndex(widget => widget.id === next.activeId));
      if(viewport.current)viewport.current.scrollTop=index*viewport.current.clientHeight;
      moveRail(index,next.widgets.length);
      setConfig(next);requestAnimationFrame(() => {navigating.current=false;});
    };
    window.addEventListener("storage",changed);return () => window.removeEventListener("storage",changed);
  },[key,moveRail]);
  const widgets = config?.widgets, ids = useMemo(() => widgets?.map(widget => widget.id) ?? [],[widgets]), active = Math.max(0,ids.indexOf(config?.activeId ?? ""));
  const order = ids.join("|"), hasWidgets = Boolean(widgets?.length);
  useLayoutEffect(() => {
    if(!viewport.current || !widgets?.length)return;
    if(previous.current.join("|") !== order) {
      stopSpring();
      navigating.current=true;viewport.current.scrollTop=active * viewport.current.clientHeight;previous.current=ids;
      moveRail(active,ids.length);
      const frame=requestAnimationFrame(() => {navigating.current=false;});return () => cancelAnimationFrame(frame);
    }
  },[order,active,ids,widgets,moveRail,stopSpring]);
  const alignViewport = useEffectEvent(() => {
    const element=viewport.current;
    if(!element?.clientHeight)return;
    navigating.current=true;element.scrollTop=active*element.clientHeight;
    moveRail(active,ids.length);
    requestAnimationFrame(() => {navigating.current=false;});
  });
  useEffect(() => {
    if(!viewport.current)return;
    const element=viewport.current;
    const resize=new ResizeObserver(() => alignViewport());
    resize.observe(element);return () => resize.disconnect();
  },[hasWidgets]);
  function select(index:number, animate:boolean) {
    if(!viewport.current || !widgets?.[index] || !config)return;
    setInstant(!animate);
    if(!animate)moveRail(index,widgets.length);
    scrollToWidget(index*viewport.current.clientHeight,animate);
    if(!animate)commit({...config,activeId:widgets[index].id});
  }
  function settle() {
    if(spring.current !== null || touching.current)return;
    if(settleTimer.current !== null)clearTimeout(settleTimer.current);
    settleTimer.current=setTimeout(() => {
      const element=viewport.current;if(!element || touching.current)return;
      const target=Math.round(element.scrollTop/element.clientHeight)*element.clientHeight;
      if(Math.abs(target-element.scrollTop)>.5)scrollToWidget(target,true);
    },90);
  }
  return <section className={styles.stack} aria-label={english ? "Personal Widget Stack" : "日常小组件叠放"}>
    {error && <ErrorNotice>{error}<button type="button" className="text-button" onClick={() => setAttempt(value => value+1)}>{english ? "Retry" : "重试"}</button></ErrorNotice>}
    {!config ? <p role="status">{english ? "Loading your widgets…" : "正在读取小组件…"}</p> : widgets?.length ? <div className={styles.deck} data-instant={instant}>
      <div className={styles.viewport} ref={viewport} data-pull-refresh-disabled onPointerDown={() => {stopSpring();setInstant(false);}} onTouchStart={() => {touching.current=true;}} onTouchEnd={() => {touching.current=false;settle();}} onTouchCancel={() => {touching.current=false;settle();}} onWheel={() => {stopSpring();setInstant(false);}} onScroll={event => {
        if(navigating.current || !config)return;
        const position=event.currentTarget.scrollTop/event.currentTarget.clientHeight;
        moveRail(position,widgets.length);
        for(const [index,card] of Array.from(event.currentTarget.children).entries())(card as HTMLElement).style.opacity=String(1-Math.min(.24,Math.abs(index-position)*.24));
        settle();
        const index=Math.max(0,Math.min(widgets.length-1,Math.round(position)));
        if(widgets[index].id !== config.activeId)commit({...config,activeId:widgets[index].id});
      }} onKeyDown={event => {if(event.target !== event.currentTarget)return;if(event.key === "ArrowDown" || event.key === "ArrowUp"){event.preventDefault();select(Math.max(0,Math.min(widgets.length-1,active+(event.key === "ArrowDown"?1:-1))),false);}}} tabIndex={0} aria-label={english ? "Swipe up or down to change widgets" : "上下滑动切换组件"}>
        {widgets.map((widget,index) => {const Card=widgetDefinition(widget.type).Card;return <article className={styles.card} data-widget-type={widget.type} data-active={index === active} key={widget.id} inert={index !== active} aria-label={`${english ? widgetDefinition(widget.type).en : widgetDefinition(widget.type).zh} ${index+1}/${widgets.length}`}><Card key={JSON.stringify(widget)} widget={widget}/></article>;})}
      </div>
      <button type="button" className={styles.menu} aria-label={english ? "Edit Personal Widget Stack" : "编辑日常小组件叠放"} title={english ? "Edit widgets" : "编辑小组件"} aria-haspopup="dialog" onClick={() => setEditing(true)}><MoreH size={18} weight="Filled" aria-hidden="true"/></button>
      <div className={styles.pagination}>
        <div className={styles.rail}>
          <span className={styles.railTrack} aria-hidden="true"><span ref={railThumb} className={styles.railThumb}/></span>
          <input type="range" className={styles.railInput} min={1} max={widgets.length} step={1} value={active+1} disabled={widgets.length === 1} aria-label={english ? "Choose widget" : "选择小组件"} aria-orientation="vertical" aria-valuetext={english ? `${active+1} of ${widgets.length}` : `第 ${active+1} 个，共 ${widgets.length} 个`} onPointerDown={() => {railPointer.current=true;}} onPointerUp={() => {railPointer.current=false;}} onBlur={() => {railPointer.current=false;}} onChange={event => select(Number(event.target.value)-1,railPointer.current)}/>
        </div>
        <span className={styles.pageCount} aria-hidden="true">{String(active+1).padStart(2,"0")} / {String(widgets.length).padStart(2,"0")}</span>
      </div>
    </div> : <button type="button" className={styles.empty} onClick={() => setEditing(true)}>{english ? "Add a widget. Make this space yours." : "添加小组件，放下你关心的日常。"}</button>}
    {editing && config && <WidgetStackEditor config={config} onChange={commit} onClose={() => setEditing(false)}/>}
  </section>;
}
