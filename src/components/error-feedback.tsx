"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icons";
import { useLocale } from "@/components/locale-controller";
import { presentError } from "@/lib/error-presentation";

type Notice = { id: string; content: ReactNode; details?: string; signature: string; dismissed?: boolean };
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
  return <ErrorFeedbackContext.Provider value={registry}>{children}{visible && createPortal(<ErrorBanner key={visible.id} details={visible.details} onDismiss={dismiss} closeLabel={english ? "Dismiss error" : "收起错误提示"}>{visible.content}</ErrorBanner>, document.body)}</ErrorFeedbackContext.Provider>;
}

function ErrorDetails({ details, phrasing }: { details: string; phrasing?: boolean }) {
  const { english } = useLocale();
  const [open, setOpen] = useState(false);
  const id = useId();
  const Detail = phrasing ? "code" : "pre";
  return <>
    <button type="button" className="text-button error-details-toggle" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(!open)}>
      {open ? (english ? "Hide details" : "收起报错详情") : (english ? "View error details" : "查看报错详情")}
    </button>
    {open && <Detail id={id} className="error-details" data-error-details data-no-translate tabIndex={0}>{details}</Detail>}
  </>;
}

function ErrorBanner({ children, details, onDismiss, closeLabel }: { children: ReactNode; details?: string; onDismiss: () => void; closeLabel: string }) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [offset, setOffset] = useState(0);
  return <section id="evaorbit-error-banner" data-feedback-layer className="error-banner" aria-label={closeLabel} onFocusCapture={event => { if (event.relatedTarget instanceof HTMLElement && !event.currentTarget.contains(event.relatedTarget)) previousFocus.current = event.relatedTarget; }} style={{ transform: `translateY(${offset}px)` }} onPointerDown={event => {
    if (!event.isPrimary || event.button !== 0 || (event.target as Element).closest("button,a,input,select,textarea,[data-error-details]")) return;
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
    <span className="error-banner-symbol" aria-hidden="true">!</span>
    <div className="error-banner-content form-error">
      <div role="alert" aria-atomic="true">{children}</div>
      {details && <ErrorDetails key={details} details={details} />}
    </div>
    <button type="button" className="error-banner-close" aria-label={closeLabel} onClick={() => { onDismiss(); previousFocus.current?.focus({ preventScroll: true }); }}><Icon name="close" /></button>
  </section>;
}

export function RegisteredErrorNotice({ inline, details, as: Text = "p", className, role = "alert", children, ...props }: ComponentProps<"p"> & { inline?: boolean; details?: string; as?: "p" | "span" }) {
  const registry = useContext(ErrorFeedbackContext);
  const { english } = useLocale();
  const id = useId();
  const hydrated = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const notice = useMemo(() => {
    // An explicit summary/details pair (including Hermes) already has its own wording.
    if (details !== undefined) return { content: children, details };
    const diagnostics: string[] = [];
    function separate(node: ReactNode): ReactNode {
      if (Array.isArray(node)) return node.map(separate);
      if (typeof node !== "string") return node;
      const presentation = presentError(node, english);
      if (presentation.details) diagnostics.push(presentation.details);
      return presentation.summary;
    }
    const content = separate(children);
    return { content, details: diagnostics.length ? diagnostics.join("\n") : undefined };
  }, [children, details, english]);
  const signature = details ? `${messageText(children)}\n${details}` : messageText(children);
  useEffect(() => {
    if (registry) {
      if (inline || !signature.trim()) registry.remove(id);
      else registry.put({ id, ...notice, signature });
    }
  }, [registry, id, notice, inline, signature]);
  useEffect(() => () => registry?.remove(id), [registry, id]);
  if (registry && !inline && hydrated) return null;
  const summary = <Text {...props} className={["form-error", className].filter(Boolean).join(" ")} role={role}>{notice.content}</Text>;
  return notice.details ? <>{summary}<ErrorDetails key={notice.details} details={notice.details} phrasing={Text === "span"} /></> : summary;
}
