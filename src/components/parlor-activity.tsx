"use client";
import {useCallback,useEffect,useRef,useState,type PointerEvent} from "react";
import {evaCall,nativeEvaEvent,type EvaState} from "@/lib/native-eva";
import {useLocale} from "./locale-controller";
import {FormSheet} from "./form-sheet";
import {ParlorErrorNotice} from "./parlor-error-notice";
import {Icon} from "./icons";
import styles from "./parlor-activity.module.css";

export function ParlorActivity({scope,supported,inConversation=false,onNavigate}:{scope:string;supported:boolean;inConversation?:boolean;onNavigate:(path:string)=>void}) {
  const {english}=useLocale(),t=(en:string,zh:string)=>english?en:zh;
  const [data,setData]=useState<EvaState|null>(null),[error,setError]=useState("");
  const [open,setOpen]=useState(false),[covered,setCovered]=useState(false),[hint,setHint]=useState(false);
  const [position,setPosition]=useState({x:0,y:0}),[dragging,setDragging]=useState(false);
  const button=useRef<HTMLButtonElement>(null),alive=useRef(true),revision=useRef(0);
  const drag=useRef<{x:number;y:number;startX:number;startY:number;startedAt:number;moved:boolean}|null>(null),suppress=useRef(false);
  // Keep the existing device-only position preference; no legacy connection is used.
  const storageKey=`eo:hermes-float:${scope}`;
  const refresh=useCallback(async()=>{
    if(!supported||document.hidden)return;
    const ticket=++revision.current;
    try{const next=await evaCall<EvaState>(scope,"ai.getState");if(alive.current&&ticket===revision.current){setData(next);setError("");}}
    catch(reason){if(alive.current&&ticket===revision.current)setError(reason instanceof Error?reason.message:String(reason));}
  },[scope,supported]);
  useEffect(()=>{
    alive.current=true;revision.current++;
    const first=setTimeout(()=>void refresh(),0),resume=()=>void refresh();
    const event=(value:Event)=>{const e=(value as CustomEvent).detail;if(e?.accountId===scope&&(e.eventType!=="progress"||e.seq===1))void refresh();};
    window.addEventListener(nativeEvaEvent,event);window.addEventListener("focus",resume);window.addEventListener("online",resume);window.addEventListener("evaorbit:native-active",resume);document.addEventListener("visibilitychange",resume);
    return()=>{alive.current=false;clearTimeout(first);window.removeEventListener(nativeEvaEvent,event);window.removeEventListener("focus",resume);window.removeEventListener("online",resume);window.removeEventListener("evaorbit:native-active",resume);document.removeEventListener("visibilitychange",resume);};
  },[refresh,scope]);
  useEffect(()=>{if(inConversation){const timer=setTimeout(()=>setOpen(false),0);return()=>clearTimeout(timer);}},[inConversation]);
  useEffect(() => {
    const update = () => setCovered(Boolean(document.querySelector(".form-sheet-layer,.space-drawer-layer")));
    const timer = setTimeout(update, 0), observer = new MutationObserver(records => {
      if (records.some(record => [...record.addedNodes, ...record.removedNodes].some(node => node instanceof Element && (node.matches(".form-sheet-layer,.space-drawer-layer") || node.querySelector(".form-sheet-layer,.space-drawer-layer"))))) update();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { clearTimeout(timer); observer.disconnect(); };
  }, []);
  useEffect(() => {
    const place = () => {
      const v = window.visualViewport, width = v?.width ?? innerWidth, height = v?.height ?? innerHeight, top = v?.offsetTop ?? 0;
      let side = "right", ratio = .5;
      try { const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null"); if (saved?.side === "left") side = "left"; if (Number.isFinite(saved?.ratio)) ratio = Math.max(0, Math.min(1, saved.ratio)); } catch { /* Position storage is optional. */ }
      setPosition({ x: side === "left" ? 12 : width - 64, y: top + Math.max(70, Math.min(height * ratio, height - 160)) });
    };
    const timer = setTimeout(place, 0); window.addEventListener("resize", place); window.visualViewport?.addEventListener("resize", place); window.visualViewport?.addEventListener("scroll", place);
    return () => { clearTimeout(timer); window.removeEventListener("resize", place); window.visualViewport?.removeEventListener("resize", place); window.visualViewport?.removeEventListener("scroll", place); };
  }, [storageKey]);
  function move(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current; if (!current) return;
    const dx = event.clientX - current.x, dy = event.clientY - current.y;
    if (Math.hypot(dx, dy) > 6) current.moved = true;
    if (!current.moved) return;
    const v = window.visualViewport, top = v?.offsetTop ?? 0;
    const x = Math.max(8, Math.min(current.startX + dx, (v?.width ?? innerWidth) - 60));
    const y = top + Math.max(70, Math.min(current.startY + dy - top, (v?.height ?? innerHeight) - 160));
    if (button.current) button.current.style.transform = `translate3d(${x}px,${y}px,0)`;
  }
  function release(event: PointerEvent<HTMLButtonElement>, cancelled = false) {
    const current = drag.current; if (!current) return;
    const held = !cancelled && !current.moved && event.timeStamp - current.startedAt >= 500;
    suppress.current = cancelled || current.moved || held;
    if (held) showStatus();
    const v = window.visualViewport, width = v?.width ?? innerWidth, height = v?.height ?? innerHeight, top = v?.offsetTop ?? 0;
    const side = current.startX + event.clientX - current.x < width / 2 ? "left" : "right";
    const next = { x: side === "left" ? 12 : width - 64, y: top + Math.max(70, Math.min(current.startY + event.clientY - current.y - top, height - 160)) };
    if (current.moved) { try { localStorage.setItem(storageKey, JSON.stringify({ side, ratio: (next.y - top) / height })); } catch { /* Position storage is optional. */ } }
    setPosition(next); if (button.current) button.current.style.transform = `translate3d(${next.x}px,${next.y}px,0)`;
    drag.current = null; setDragging(false);
  }

  const thinking=data?.active?.status==="streaming"||Boolean(data?.activeMessages?.length||data?.discussions?.some(d=>d.status==="running"||d.status==="summarizing")),online=Boolean(data?.providers.some(p=>p.enabled&&(p.hasKey||p.connectionType==="subscription")));
  const label=!supported?t("Update Host","需要新版 Host"):error?t("Needs attention","有情况需要查看"):thinking?t("Working…","正在处理…"):!data?t("Checking…","正在检查…"):online?t("Ready","已就绪"):t("Configure a model","配置模型");
  const tone=error?"error":thinking?"thinking":online?"online":"offline";
  useEffect(()=>{const show=setTimeout(()=>setHint(true),0),hide=setTimeout(()=>setHint(false),3800);return()=>{clearTimeout(show);clearTimeout(hide);};},[tone]);
  function showStatus(){setOpen(true);void refresh();}
  function navigate(id?:string){setOpen(false);onNavigate(id?`/ai?conversation=${id}`:"/ai");}
  return <>
    <button ref={button} type="button" className={styles.floating} data-parlor-activity data-native-eva={supported||undefined} data-tone={tone} data-dragging={dragging} hidden={inConversation||covered||!position.x} style={{transform:`translate3d(${position.x}px,${position.y}px,0)`}} aria-label={`Parlor · ${label}`} title={t("Open Parlor. Press and hold for status.","打开 Parlor，长按查看状态。")}
      onPointerDown={event=>{if(event.button!==0)return;drag.current={x:event.clientX,y:event.clientY,startX:position.x,startY:position.y,startedAt:event.timeStamp,moved:false};suppress.current=false;event.currentTarget.setPointerCapture(event.pointerId);setDragging(true);}} onPointerMove={move} onPointerUp={event=>release(event)} onPointerCancel={event=>release(event,true)} onContextMenu={event=>{event.preventDefault();if(!drag.current)showStatus();}} onClick={event=>{if(suppress.current&&event.detail!==0){suppress.current=false;return;}navigate(data?.active?.conversationId??data?.activeMessages?.[0]?.conversationId??data?.discussions?.find(d=>d.status==="running"||d.status==="summarizing")?.conversationId);}}>
      <span className={styles.mark}><Icon name="ai" variant="stroke"/></span><span className={styles.statusDot}/>{thinking&&<span className={styles.dots} aria-hidden="true"><i/><i/><i/></span>}{error&&<span className={styles.badge}>!</span>}<span className={styles.label} data-visible={hint} data-left={position.x<100}>{label}</span>
    </button>
    <span className={styles.live} role="status" aria-live="polite">{inConversation||!thinking?"":`Parlor · ${label}`}</span>
    {open&&!inConversation&&<FormSheet title="Parlor" onClose={()=>setOpen(false)}><div className={styles.detail}><div className={styles.connection}><span data-online={online}/>{label}<button className="text-button" onClick={()=>void refresh()}>{t("Refresh","刷新状态")}</button></div>{error&&<ParlorErrorNotice inline error={error}/>}<button className="button secondary" onClick={()=>navigate()}>{t("Open Parlor","打开 Parlor")}</button><div className={styles.threads}>{data?.conversations.map(c=><button key={c.id} onClick={()=>navigate(c.id)}><strong>{c.title}</strong>{data.active?.conversationId===c.id&&<small>{t("Working…","正在处理…")}</small>}</button>)}</div></div></FormSheet>}
  </>;
}
