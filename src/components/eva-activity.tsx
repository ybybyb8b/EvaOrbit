"use client";
import { ErrorNotice } from "@/components/error-notice";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import type { EvaJob } from "@/lib/eva";
import { evaActivityLabel } from "@/lib/eva-feedback";
import { responseError } from "@/lib/response-error";
import { clearClientJsonCache } from "@/lib/client-json-cache";
import { dataChangedEvent } from "@/lib/data-changed";
import { useBusinessRequest } from "./business-request-context";
import { useLocale } from "./locale-controller";
import { FormSheet } from "./form-sheet";
import { Icon } from "./icons";
import { EvaFeedbackDetails } from "./eva-feedback-details";
import styles from "./eva-activity.module.css";

type Phase = "sending" | "unknown" | "rejected";
type Entry = { id: string; job?: EvaJob; phase?: Phase; error?: string; startedAt: number; stalled?: boolean };
type Activity = { begin: (id: string) => void; accepted: (job: EvaJob) => void; failed: (id: string, error: string, rejected: boolean) => void };
const Context = createContext<Activity | null>(null);
export function useEvaActivity() { return useContext(Context); }
const pending = (entry: Entry) => entry.phase === "unknown" || !entry.job || ["queued", "running"].includes(entry.job.status);

export function EvaActivityProvider({ scope, enabled = true, onNavigate, children }: { scope: string; enabled?: boolean; onNavigate: (href: string) => void; children: ReactNode }) {
  const request = useBusinessRequest(), { english } = useLocale();
  const [entries, setEntries] = useState<Entry[]>([]), [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [connectionError, setConnectionError] = useState("");
  const [expanded, setExpanded] = useState(true), [otherModal, setOtherModal] = useState(false), [activeId, setActiveId] = useState<string>();
  const [position, setPosition] = useState({ x: 0, y: 0 }), [dragging, setDragging] = useState(false);
  const latest = useRef(entries), alive = useRef(true), inFlight = useRef(false), button = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ x: number; y: number; originX: number; originY: number; moved: boolean } | null>(null), suppressClick = useRef(false);
  const storageKey = `evaorbit:eva-activity:${scope}`;
  const t = (en: string, zh: string) => english ? en : zh;
  const update = useCallback((fn: (current: Entry[]) => Entry[]) => setEntries(current => { const next = fn(current); latest.current = next; return next; }), []);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      let stored: Entry[] = [];
      try { const ids = JSON.parse(sessionStorage.getItem(storageKey) ?? "[]"); if (Array.isArray(ids)) stored = ids.filter(id => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)).slice(0, 20).map(id => ({ id, startedAt: Date.now() })); } catch { /* Storage is optional. */ }
      update(current => [...current, ...stored.filter(old => !current.some(e => e.id === old.id))]); setReady(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [storageKey, update]);
  useEffect(() => { if (ready) try { sessionStorage.setItem(storageKey, JSON.stringify(entries.map(e => e.id))); } catch { /* IDs only; no paper content stored. */ } }, [entries, ready, storageKey]);
  const activity: Activity = {
    begin(id) { update(current => [{ id, phase: "sending" as const, startedAt: Date.now() }, ...current.filter(e => e.id !== id)].slice(0, 20)); setActiveId(id); setExpanded(true); },
    accepted(job) { update(current => current.map(e => e.id === job.id ? { ...e, job, phase: undefined, error: undefined } : e)); },
    failed(id, error, rejected) { update(current => current.map(e => e.id === id ? { ...e, phase: rejected ? "rejected" : "unknown", error } : e)); setExpanded(true); },
  };
  const refresh = useCallback(async () => {
    const targets = latest.current.filter(e => e.phase !== "sending" && e.phase !== "rejected");
    if (!enabled || !targets.length || inFlight.current || document.visibilityState === "hidden") return;
    inFlight.current = true;
    try {
      const response = await request(`/api/eva?view=jobs&ids=${targets.map(e => e.id).join(",")}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response, english ? "Could not refresh Eva status." : "暂时无法刷新 Eva 状态。"));
      const value = await response.json() as { jobs: EvaJob[] };
      if (!alive.current) return;
      update(current => current.map(entry => {
        if (entry.phase === "sending" || entry.phase === "rejected") return entry;
        const job = value.jobs.find(job => job.id === entry.id);
        if (!job) return { ...entry, phase: "unknown", error: entry.error || (english ? "No saved paper was found. Delivery is unconfirmed; check your original form before sending again." : "尚未找到已保存的纸条，无法确认提交结果。请先检查原表单，再决定是否重发。") };
        if (entry.job?.updatedAt !== job.updatedAt && job.taskIds.some(Boolean)) {
          clearClientJsonCache(); window.dispatchEvent(new CustomEvent(dataChangedEvent, { detail: { domains: ["tasks", "reminders"], source: "eva" } }));
        }
        return { ...entry, job, phase: undefined, error: undefined, stalled: job.status === "running" && Boolean(job.leaseUntil) && Date.parse(job.leaseUntil!) < Date.now() || job.status === "queued" && Date.now() - entry.startedAt > 120000 };
      })); setConnectionError("");
    } catch (error) { if (alive.current) setConnectionError(error instanceof Error ? error.message : "Could not refresh Eva status."); }
    finally { inFlight.current = false; }
  }, [enabled, request, english, update]);
  const signature = entries.map(e => `${e.id}:${e.phase ?? e.job?.status ?? "unknown"}:${e.job?.attempts ?? 0}`).join("|");
  useEffect(() => {
    if (!ready || !enabled) return;
    const start = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => { if (latest.current.some(e => pending(e) && e.phase !== "rejected" && Date.now() - e.startedAt < 180000)) void refresh(); }, 2500);
    const resume = () => void refresh(); window.addEventListener("focus", resume); window.addEventListener("online", resume); document.addEventListener("visibilitychange", resume);
    return () => { clearTimeout(start); clearInterval(timer); window.removeEventListener("focus", resume); window.removeEventListener("online", resume); document.removeEventListener("visibilitychange", resume); };
  }, [ready, enabled, signature, refresh]);
  const stateSignature = entries.map(e => `${e.id}:${e.phase}:${e.job?.status}:${e.job?.feedback?.stage}`).join("|");
  useEffect(() => { const show = setTimeout(() => setExpanded(true), 0), hide = setTimeout(() => setExpanded(false), 5500); return () => { clearTimeout(show); clearTimeout(hide); }; }, [stateSignature]);
  useEffect(() => {
    const observer = new MutationObserver(() => setOtherModal(Boolean(document.querySelector(".form-sheet-layer,.space-drawer-layer"))));
    observer.observe(document.body, { childList: true }); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const place = () => {
      const v = window.visualViewport, width = v?.width ?? window.innerWidth, height = v?.height ?? window.innerHeight;
      setPosition(p => ({ x: p.x === 0 || p.x > width / 2 ? width - 68 : 12, y: Math.max((v?.offsetTop ?? 0) + 60, Math.min(p.y || height * .55, (v?.offsetTop ?? 0) + height - 150)) }));
    };
    const timer = setTimeout(place, 0); window.addEventListener("resize", place); window.visualViewport?.addEventListener("resize", place); window.visualViewport?.addEventListener("scroll", place);
    return () => { clearTimeout(timer); window.removeEventListener("resize", place); window.visualViewport?.removeEventListener("resize", place); window.visualViewport?.removeEventListener("scroll", place); };
  }, []);
  function move(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current; if (!current) return;
    const dx = event.clientX - current.x, dy = event.clientY - current.y;
    if (Math.hypot(dx, dy) > 6) current.moved = true;
    if (!current.moved) return;
    const v = window.visualViewport;
    const x = Math.max(8, Math.min(current.originX + dx, (v?.width ?? window.innerWidth) - 64));
    const y = Math.max((v?.offsetTop ?? 0) + 60, Math.min(current.originY + dy, (v?.offsetTop ?? 0) + (v?.height ?? window.innerHeight) - 150));
    if (button.current) button.current.style.transform = `translate3d(${x}px,${y}px,0)`;
  }
  function release(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current; if (!current) return;
    suppressClick.current = current.moved;
    const v = window.visualViewport, width = v?.width ?? window.innerWidth;
    const x = current.originX + event.clientX - current.x;
    const next = { x: x < width / 2 ? 12 : width - 68, y: Math.max((v?.offsetTop ?? 0) + 60, Math.min(current.originY + event.clientY - current.y, (v?.offsetTop ?? 0) + (v?.height ?? window.innerHeight) - 150)) };
    setPosition(next);
    // A horizontal drag can snap to the unchanged React position; reconcile the direct DOM movement too.
    if (current.moved) requestAnimationFrame(() => { if (button.current) button.current.style.transform = `translate3d(${next.x}px,${next.y}px,0)`; });
    drag.current = null; setDragging(false);
  }
  const needsAttention = entries.find(e => e.stalled || e.phase === "rejected" || e.phase === "unknown" || e.job?.status === "failed" || e.job?.status === "review");
  const selected = entries.find(e => e.id === activeId);
  const entry = open ? selected ?? needsAttention ?? entries[0] : needsAttention ?? selected ?? entries[0];
  const phase = entry?.phase, job = entry?.job;
  const label = connectionError ? t("Eva status unavailable", "Eva 状态暂不可用") : entry?.stalled ? t("Eva may have been interrupted", "后台处理可能中断") : evaActivityLabel(job, phase, english);
  const tone = connectionError || entry?.stalled || phase === "unknown" || phase === "rejected" || job?.status === "failed" ? "error" : job?.status === "review" ? "review" : job?.status === "done" || job?.status === "held" ? "done" : job?.feedback?.requestStartedAt ? "thinking" : "sending";
  function dismiss(id: string) { update(current => current.filter(e => e.id !== id)); }
  async function retry(approve = false) {
    if (!job || busy) return; setBusy(true); setConnectionError(""); if (!approve) activity.begin(job.id);
    let rejected = false;
    try { const response = await request("/api/eva", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: approve ? "approve" : job.status === "queued" || job.status === "running" ? "resume" : "retry", id: job.id }) }); if (!response.ok) { rejected = [400, 401, 403, 404, 405, 409, 413, 422].includes(response.status); throw new Error(await responseError(response, t("Could not retry.", "未能重试。"))); } const value = await response.json(); activity.accepted(value.id ? value : job); }
    catch (error) { if (approve) setConnectionError(error instanceof Error ? error.message : "Approval failed"); else activity.failed(job.id, error instanceof Error ? error.message : "Retry failed", rejected); }
    finally { if (alive.current) setBusy(false); }
  }
  return <Context.Provider value={enabled ? activity : null}>{children}
    {ready && enabled && entry && !open && !otherModal && <button ref={button} type="button" className={styles.floating} data-eva-activity data-tone={tone} data-dragging={dragging} style={{ transform: `translate3d(${position.x}px,${position.y}px,0)` }} aria-label={`${label}${entries.length > 1 ? ` · ${entries.length}` : ""}`} aria-haspopup="dialog"
      onPointerDown={event => { if (event.button !== 0) return; drag.current = { x: event.clientX, y: event.clientY, originX: position.x, originY: position.y, moved: false }; suppressClick.current = false; event.currentTarget.setPointerCapture(event.pointerId); setDragging(true); }} onPointerMove={move} onPointerUp={release} onPointerCancel={event => { release(event); suppressClick.current = true; }}
      onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } setActiveId(entry.id); setOpen(true); }}>
      <span className={styles.orbit} aria-hidden="true" /><span className={styles.mark}><Icon name={tone === "done" ? "check" : tone === "review" || tone === "error" ? "notifications" : "ai"} variant="stroke" /></span>
      {tone === "thinking" && <span className={styles.dots} aria-hidden="true"><i/><i/><i/></span>}
      <span className={styles.badge}>{entries.length > 1 ? entries.length : tone === "error" || tone === "review" ? "!" : tone === "done" ? "✓" : ""}</span>
      <span className={styles.label} data-visible={expanded} data-side={position.x < 100 ? "left" : "right"}>{label}</span>
    </button>}
    <span className={styles.live} role="status" aria-live="polite">{entries.length ? label : ""}</span>
    {open && entry && <FormSheet title="Eva" onClose={() => { setOpen(false); if (job?.status === "done" || job?.status === "held") dismiss(entry.id); }} busy={busy}>
      <div className={styles.detail}>
        {entries.length > 1 && <div className={styles.list}>{entries.map(e => <button type="button" key={e.id} aria-pressed={entry.id === e.id} onClick={() => setActiveId(e.id)}>{e.job?.content.slice(0, 42) || evaActivityLabel(e.job, e.phase, english)}</button>)}</div>}
        <h3>{label}</h3>
        {job?.content && <p className={styles.original}>{job.content}</p>}
        {entry.error && <ErrorNotice inline className={styles.error}>{entry.error}</ErrorNotice>}
        {connectionError && <ErrorNotice inline className={styles.error}>{connectionError}</ErrorNotice>}
        {job && <EvaFeedbackDetails job={job} />}
        {job?.result && <><p>{job.result.summary}</p><ul>{job.result.tasks.map((task, i) => <li key={i}>{job.taskIds[i] ? <button className="text-button" onClick={() => { setOpen(false); dismiss(entry.id); onNavigate(`/tasks?taskId=${job.taskIds[i]}`); }}>{task.title}</button> : <strong>{task.title} · {t("Needs confirmation", "待确认")}</strong>}<small>{[task.dueDate, task.dueTime, task.remind ? t("Reminder", "提醒") : ""].filter(Boolean).join(" · ")}</small></li>)}</ul>{job.result.remaining && <p>{t("Kept in Inbox: ", "留在散落：")}{job.result.remaining}</p>}</>}
        {phase === "unknown" && <p>{t("The save result is unknown. Your original form keeps the text. Refresh status before sending again.", "提交结果尚未确认，原表单仍保留文字。请先刷新状态，避免重复发送。")}</p>}
        <div className={styles.actions}>
          <button className="button secondary" disabled={busy} onClick={() => void refresh()}>{t("Refresh status", "刷新状态")}</button>
          {job && (["failed", "held", "queued"].includes(job.status) || entry.stalled) && <button className="button primary" disabled={busy} onClick={() => void retry()}>{t("Try again", "重新处理")}</button>}
          {job?.status === "review" && <button className="button primary" disabled={busy} onClick={() => void retry(true)}>{t("Create remaining tasks", "确认创建余下待办")}</button>}
          <button className="text-button" onClick={() => { setOpen(false); onNavigate("/ai"); }}>{t("Open Eva", "打开 Eva")}</button>
          <button className="text-button" onClick={() => { dismiss(entry.id); if (entries.length === 1) setOpen(false); }}>{t("Dismiss status", "收起此状态")}</button>
        </div><p className={styles.note}>{t("Dismissing status does not cancel processing. The paper remains in Eva.", "收起状态不会取消后台处理，纸条仍保留在 Eva 中。")}</p>
      </div>
    </FormSheet>}
  </Context.Provider>;
}
