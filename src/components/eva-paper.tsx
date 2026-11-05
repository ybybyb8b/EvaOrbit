"use client";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useBusinessRequest } from "./business-request-context";
import { useFormPreview } from "./form-preview";
import { useLocale } from "./locale-controller";
import { ErrorNotice } from "./error-notice";
import { FormSheet } from "./form-sheet";
import { showActionToast } from "./action-toast";
import { responseError } from "@/lib/response-error";
import { notifyHermesActivity } from "@/lib/hermes-activity";
import styles from "./eva.module.css";

export function EvaPaperCapture({ onSaved, onBusyChange, onDirtyChange, compact = false }: { onSaved: () => Promise<void> | void; onBusyChange?: (busy: boolean) => void; onDirtyChange?: (dirty: boolean) => void; compact?: boolean }) {
  const request = useBusinessRequest(), readonly = useFormPreview(), { english } = useLocale();
  const [content, setContent] = useState(""), [available, setAvailable] = useState(false);
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  const key = useRef<string | null>(null), submitting = useRef(false);
  const conversation = useRef<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const field = textarea.current;
    if (!field || !compact) return;
    const resize = () => { field.style.height = "0px"; field.style.height = `${field.scrollHeight}px`; };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [content, compact]);
  useEffect(() => {
    if (readonly) return;
    const abort = new AbortController();
    void request("/api/hermes", { signal: abort.signal, cache: "no-store" }).then(r => {
      if (r.ok) setAvailable(true);
    }).catch(() => {});
    return () => abort.abort();
  }, [request, readonly]);
  async function save(process: boolean) {
    if (readonly || submitting.current || !content.trim()) return;
    submitting.current = true; setSaving(true); onBusyChange?.(true); setError(""); key.current ??= crypto.randomUUID();
    const requestKey = key.current;
    const hermes = process;
    try {
      if (hermes) conversation.current ??= crypto.randomUUID();
      if (hermes) notifyHermesActivity({ state: "sending", id: requestKey, conversationId: conversation.current! });
      const response = await request(hermes ? "/api/hermes" : "/api/eva", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(hermes ? { action: "send", id: requestKey, conversationId: conversation.current, content, note: true } : { action: "capture", key: key.current, content, process: false }) });
      if (!response.ok) throw new Error(await responseError(response, english ? "Could not save. Your text is still here." : "未能保存，文字还在这里，请重试。"));
      if (hermes) notifyHermesActivity({ state: "saved", id: requestKey, conversationId: conversation.current! });
      setContent("");
      onDirtyChange?.(false);
      showActionToast(hermes ? (english ? "Note saved. Open Hermes to follow the reply." : "便利贴已保存，打开 Hermes 可查看接收状态和回复。") : (english ? "Saved to Inbox." : "已存入散落。"));
      key.current = null;
      conversation.current = null;
      void Promise.resolve(onSaved()).catch(() => {});
    } catch (reason) { if (hermes) notifyHermesActivity({ state: "uncertain", id: requestKey, conversationId: conversation.current!, error: reason instanceof Error ? reason.message : String(reason) }); setError(reason instanceof Error ? reason.message : english ? "Could not save note." : "未能保存便利贴，请重试。"); }
    finally { submitting.current = false; setSaving(false); onBusyChange?.(false); }
  }
  return <form className={`${styles.capture} ${compact ? styles.compact : ""}`} onSubmit={(event: FormEvent) => { event.preventDefault(); void save(false); }}>
      <textarea ref={textarea} autoFocus={!compact} aria-label={english ? "Paper content" : "纸条内容"} required maxLength={10000} rows={compact ? 2 : 7} value={content} disabled={saving} onChange={e => { setContent(e.target.value); onDirtyChange?.(Boolean(e.target.value.trim())); }} placeholder={english ? "Anything on your mind…" : "随手写点什么……"} />
      {readonly && <p className={styles.hint}>{english ? "Connect to save." : "连接账户后可保存。"}</p>}
      {!readonly && !available && <p className={styles.hint}>{english ? "Message service unavailable" : "消息服务暂不可用"}</p>}
      {error && <ErrorNotice>{error}</ErrorNotice>}
      <div className={styles.captureActions}>
        <button type="submit" className="button secondary eva-paper-action" disabled={saving || readonly || !content.trim()}>{english ? "Save to Inbox" : "存入散落"}</button>
        <button type="button" className="button secondary eva-paper-action" disabled={saving || readonly || !available || !content.trim()} onClick={() => void save(true)}>{saving ? (english ? "Saving…" : "保存中…") : (english ? "Send to Hermes" : "交给 Hermes")}</button>
      </div>
    </form>;
}

export function EvaPaperSheet({ onClose, onSaved }: { onClose: () => void; onSaved?: () => Promise<void> | void }) {
  const { english } = useLocale();
  const [busy, setBusy] = useState(false);
  return <FormSheet title={english ? "Leave a paper" : "写张纸条"} onClose={onClose} busy={busy}>
    <EvaPaperCapture onBusyChange={setBusy} onSaved={() => { onClose(); return onSaved?.(); }} />
  </FormSheet>;
}
