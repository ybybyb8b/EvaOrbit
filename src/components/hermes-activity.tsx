"use client";
import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { hermesActivityEvent, type HermesActivityData, type HermesActivityEvent } from "@/lib/hermes-activity";
import { responseError } from "@/lib/response-error";
import { useBusinessRequest } from "./business-request-context";
import { useLocale } from "./locale-controller";
import { FormSheet } from "./form-sheet";
import { Icon } from "./icons";
import styles from "./hermes-activity.module.css";

export function HermesActivity({ scope, inConversation = false, onNavigate }: { scope: string; inConversation?: boolean; onNavigate: (path: string) => void }) {
  const request = useBusinessRequest(), { english } = useLocale();
  const [data, setData] = useState<HermesActivityData>(), [error, setError] = useState("");
  const [open, setOpen] = useState(false), [covered, setCovered] = useState(false), [hint, setHint] = useState(false);
  const [outgoing, setOutgoing] = useState<Extract<HermesActivityEvent, { id: string }>>();
  const outgoingRef = useRef(outgoing);
  const [position, setPosition] = useState({ x: 0, y: 0 }), [dragging, setDragging] = useState(false);
  const button = useRef<HTMLButtonElement>(null), abort = useRef<AbortController | null>(null), pending = useRef(false), alive = useRef(true);
  const refreshAgain = useRef(false);
  const readMarkers = useRef(new Map<string, number>()), reading = useRef(new Map<string, number>());
  const drag = useRef<{ x: number; y: number; startX: number; startY: number; moved: boolean } | null>(null), suppress = useRef(false);
  const storageKey = `eo:hermes-float:${scope}`;
  useEffect(() => {
    if (!inConversation) return;
    const timer = setTimeout(() => setOpen(false), 0);
    return () => clearTimeout(timer);
  }, [inConversation]);
  const t = (en: string, zh: string) => english ? en : zh;
  const refresh = useCallback(async (): Promise<void> => {
    if (document.visibilityState === "hidden") return;
    if (pending.current) { refreshAgain.current = true; return; }
    pending.current = true;
    try { do { refreshAgain.current = false; try {
      const target = outgoingRef.current;
      const response = await request(`/api/hermes?view=activity${target ? `&receiptId=${encodeURIComponent(target.id)}` : ""}`, { cache: "no-store", signal: abort.current?.signal });
      if (!response.ok) throw new Error(await responseError(response, english ? "Could not read Hermes status." : "暂时无法读取 Hermes 状态。"));
      const value = await response.json() as HermesActivityData;
      value.connection.online = Boolean(value.connection.online && value.connection.lastSeenAt && Date.now() - Date.parse(value.connection.lastSeenAt) < 90000);
      if (alive.current) { setData(value); setError(""); if (value.receipt && value.receipt.id === outgoingRef.current?.id) { outgoingRef.current = undefined; setOutgoing(undefined); } }
    } catch (reason) { if (alive.current && !(reason instanceof Error && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : String(reason)); }
    } while (refreshAgain.current && alive.current && !document.hidden); }
    finally { pending.current = false; }
  }, [request, english]);
  const hasWork = Boolean(outgoing?.state === "sending" || data?.threads.some(thread => thread.pending || thread.question));
  useEffect(() => {
    alive.current = true; abort.current = new AbortController();
    const first = setTimeout(() => void refresh(), 0), interval = setInterval(() => void refresh(), hasWork ? 5000 : 15000);
    const resume = () => void refresh();
    window.addEventListener("focus", resume); window.addEventListener("online", resume); document.addEventListener("visibilitychange", resume);
    return () => { alive.current = false; abort.current?.abort(); clearTimeout(first); clearInterval(interval); window.removeEventListener("focus", resume); window.removeEventListener("online", resume); document.removeEventListener("visibilitychange", resume); };
  }, [refresh, hasWork]);
  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<HermesActivityEvent>).detail;
      if (!detail) return;
      if (detail.state !== "seen") { outgoingRef.current = detail.state === "saved" ? undefined : detail; setOutgoing(outgoingRef.current); void refresh(); return; }
      const { conversationId, seq } = detail;
      if ((readMarkers.current.get(conversationId) ?? 0) >= seq || (reading.current.get(conversationId) ?? 0) >= seq) return;
      reading.current.set(conversationId, seq);
      void request("/api/hermes", { method: "POST", headers: { "Content-Type": "application/json" }, signal: abort.current?.signal, body: JSON.stringify({ action: "seen", conversationId, seq }) }).then(response => {
        if (!response.ok) return;
        readMarkers.current.set(conversationId, Math.max(seq, readMarkers.current.get(conversationId) ?? 0));
        if (alive.current) void refresh();
      }).catch(() => {}).finally(() => { if (reading.current.get(conversationId) === seq) reading.current.delete(conversationId); });
    };
    window.addEventListener(hermesActivityEvent, receive);
    return () => window.removeEventListener(hermesActivityEvent, receive);
  }, [request, refresh]);
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
  function release(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current; if (!current) return;
    suppress.current = current.moved;
    const v = window.visualViewport, width = v?.width ?? innerWidth, height = v?.height ?? innerHeight, top = v?.offsetTop ?? 0;
    const side = current.startX + event.clientX - current.x < width / 2 ? "left" : "right";
    const next = { x: side === "left" ? 12 : width - 64, y: top + Math.max(70, Math.min(current.startY + event.clientY - current.y - top, height - 160)) };
    if (current.moved) { try { localStorage.setItem(storageKey, JSON.stringify({ side, ratio: (next.y - top) / height })); } catch { /* Position storage is optional. */ } }
    setPosition(next); if (button.current) button.current.style.transform = `translate3d(${next.x}px,${next.y}px,0)`;
    drag.current = null; setDragging(false);
  }
  const threads = data?.threads ?? [], unread = threads.reduce((sum, thread) => sum + thread.unread, 0);
  const online = Boolean(!error && data?.connection.online), failed = Boolean(error || outgoing?.state === "uncertain" || threads.some(thread => thread.error));
  const thinking = threads.some(thread => thread.pending === "processing" || thread.pending === "received"), question = threads.some(thread => thread.question);
  const tone = failed ? "error" : outgoing?.state === "sending" ? "sending" : question ? "question" : thinking ? "thinking" : unread ? "reply" : threads.some(thread => thread.pending) ? "queued" : online ? "online" : "offline";
  const label = failed ? t("Needs attention", "有情况需要查看") : tone === "sending" ? t("Sending…", "正在发送…") : question ? t("Waiting for your reply", "等待你回答") : thinking ? t("Working…", "正在处理…") : unread ? t(`${unread} new replies`, `${unread} 条新回复`) : tone === "queued" ? t("Waiting for Hermes", "等待 Hermes 接收") : online ? "online" : "offline";
  useEffect(() => { const show = setTimeout(() => setHint(true), 0), hide = setTimeout(() => setHint(false), 3800); return () => { clearTimeout(show); clearTimeout(hide); }; }, [tone, unread]);
  function navigate(id?: string) { setOpen(false); onNavigate(id ? `/ai?conversation=${id}` : "/ai"); }
  return <>
    <button ref={button} type="button" className={styles.floating} data-hermes-activity data-tone={tone} data-dragging={dragging} hidden={inConversation || covered || !position.x} style={{ transform: `translate3d(${position.x}px,${position.y}px,0)` }} aria-label={`Hermes · ${label}`} aria-haspopup="dialog"
      onPointerDown={event => { if (event.button !== 0) return; drag.current = { x: event.clientX, y: event.clientY, startX: position.x, startY: position.y, moved: false }; suppress.current = false; event.currentTarget.setPointerCapture(event.pointerId); setDragging(true); }} onPointerMove={move} onPointerUp={release} onPointerCancel={event => { release(event); suppress.current = true; }}
      onClick={() => { if (suppress.current) { suppress.current = false; return; } setOpen(true); void refresh(); }}>
      <span className={styles.mark}><Icon name="ai" variant="stroke" /></span><span className={styles.statusDot} />
      {(thinking || tone === "sending") && <span className={styles.dots} aria-hidden="true"><i/><i/><i/></span>}
      {(unread > 0 || failed || question) && <span className={styles.badge}>{failed || question ? "!" : unread > 99 ? "99+" : unread}</span>}
      <span className={styles.label} data-visible={hint} data-left={position.x < 100}>{label}</span>
    </button>
    <span className={styles.live} role="status" aria-live="polite">{inConversation || tone === "online" || tone === "offline" ? "" : `Hermes · ${label}`}</span>
    {open && !inConversation && <FormSheet title="Hermes" onClose={() => setOpen(false)}><div className={styles.detail}>
      <div className={styles.connection}><span data-online={online} />{online ? "online" : "offline"}<button className="text-button" onClick={() => void refresh()}>{t("Refresh", "刷新状态")}</button></div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {outgoing && <div className={styles.localStatus}><p>{outgoing.state === "sending" ? t("Sending to EO…", "正在发送到 EO…") : t("Delivery unconfirmed. Your text stays in the original form.", "发送结果未确认，文字仍保留在原输入框。")}</p>{outgoing.error && <p className={styles.error}>{outgoing.error}</p>}{outgoing.state !== "sending" && <button className="text-button" onClick={() => { outgoingRef.current = undefined; setOutgoing(undefined); }}>{t("Dismiss notice", "收起此提示")}</button>}</div>}
      <button className="button secondary" onClick={() => navigate()}>{t("Open Hermes", "打开 Hermes")}</button>
      <div className={styles.threads}>{threads.map(thread => <button key={thread.id} onClick={() => navigate(thread.id)}><strong>{thread.title}{thread.unread > 0 && <span>{thread.unread > 99 ? "99+" : thread.unread}</span>}</strong><small>{thread.error ? t("Could not finish · view details", "处理未完成 · 查看详情") : thread.question ? t("Waiting for your reply", "等待你回答") : thread.pending === "processing" || thread.pending === "received" ? t("Working…", "正在处理…") : thread.pending ? t("Waiting to be received", "等待接收") : thread.preview}</small>{thread.error && <span className={styles.error}>{thread.error}</span>}</button>)}</div>
    </div></FormSheet>}
  </>;
}
