"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icons";
import { useLocale } from "@/components/locale-controller";

type Notice = { id: string; content: ReactNode; signature: string; dismissed?: boolean };
type Registry = { put: (notice: Notice) => void; remove: (id: string) => void };
const ErrorFeedbackContext = createContext<Registry | null>(null);
const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

function messageText(content: ReactNode): string {
  if (content === null || typeof content === "boolean" || content === undefined) return "";
  if (typeof content === "string" || typeof content === "number") return String(content);
  if (Array.isArray(content)) return content.map(messageText).join("");
  if (typeof content === "object" && "props" in content) return messageText((content.props as { children?: ReactNode }).children);
  return "";
}

/** One persistent banner shared by Web and the bundled React app. No expiry timer. */
export function ErrorFeedbackProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const { english } = useLocale();
  const put = useCallback((notice: Notice) => setNotices(current => {
    const previous = current.find(item => item.id === notice.id);
    const next = { ...notice, dismissed: previous?.signature === notice.signature ? previous.dismissed : false };
    return [...current.filter(item => item.id !== notice.id), next];
  }), []);
  const remove = useCallback((id: string) => setNotices(current => current.filter(item => item.id !== id)), []);
  const registry = useMemo(() => ({ put, remove }), [put, remove]);
  const visible = notices.filter(item => !item.dismissed).at(-1);
  const dismiss = () => { if (visible) setNotices(current => current.map(item => item.signature === visible.signature ? { ...item, dismissed: true } : item)); };
  return <ErrorFeedbackContext.Provider value={registry}>{children}{visible && createPortal(<ErrorBanner key={visible.id} onDismiss={dismiss} closeLabel={english ? "Dismiss error" : "收起错误提示"}>{visible.content}</ErrorBanner>, document.body)}</ErrorFeedbackContext.Provider>;
}

function ErrorBanner({ children, onDismiss, closeLabel }: { children: ReactNode; onDismiss: () => void; closeLabel: string }) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [offset, setOffset] = useState(0);
  return <section id="evaorbit-error-banner" data-feedback-layer className="error-banner" aria-label={closeLabel} onFocusCapture={event => { if (event.relatedTarget instanceof HTMLElement && !event.currentTarget.contains(event.relatedTarget)) previousFocus.current = event.relatedTarget; }} style={{ transform: `translateY(${offset}px)` }} onPointerDown={event => {
    if (!event.isPrimary || event.button !== 0 || (event.target as Element).closest("button,a,input,select,textarea")) return;
    start.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }} onPointerMove={event => {
    if (!start.current) return;
    const dy = event.clientY - start.current.y;
    setOffset(Math.abs(dy) > Math.abs(event.clientX - start.current.x) ? Math.min(0, dy) : 0);
  }} onPointerUp={event => {
    if (!start.current) return;
    const dy = event.clientY - start.current.y, dx = event.clientX - start.current.x;
    start.current = null; setOffset(0);
    if (dy < -40 && Math.abs(dy) > Math.abs(dx)) onDismiss();
  }} onPointerCancel={() => { start.current = null; setOffset(0); }}>
    <span className="error-banner-symbol" aria-hidden="true">!</span><div className="error-banner-content form-error" role="alert" aria-atomic="true">{children}</div><button type="button" className="error-banner-close" aria-label={closeLabel} onClick={() => { onDismiss(); previousFocus.current?.focus({ preventScroll: true }); }}><Icon name="close" /></button>
  </section>;
}

export function RegisteredErrorNotice({ inline, className, role = "alert", children, ...props }: ComponentProps<"p"> & { inline?: boolean }) {
  const registry = useContext(ErrorFeedbackContext);
  const id = useId();
  const hydrated = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  useEffect(() => {
    if (registry) {
      if (inline || !messageText(children).trim()) registry.remove(id);
      else registry.put({ id, content: children, signature: messageText(children) });
    }
  }, [registry, id, children, inline]);
  useEffect(() => () => registry?.remove(id), [registry, id]);
  if (registry && !inline && hydrated) return null;
  return <p {...props} className={["form-error", className].filter(Boolean).join(" ")} role={role}>{children}</p>;
}
