"use client";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useBusinessRequest } from "./business-request-context";
import { useFormPreview } from "./form-preview";
import { useLocale } from "./locale-controller";
import { ErrorNotice } from "./error-notice";
import { FormSheet } from "./form-sheet";
import { showActionToast } from "./action-toast";
import { responseError } from "@/lib/response-error";
import type { EvaJob, EvaSettings } from "@/lib/eva";
import styles from "./eva.module.css";

export function EvaPaperCapture({ onSaved, onBusyChange, onDirtyChange, compact = false }: { onSaved: () => Promise<void> | void; onBusyChange?: (busy: boolean) => void; onDirtyChange?: (dirty: boolean) => void; compact?: boolean }) {
  const request = useBusinessRequest(), readonly = useFormPreview(), { english } = useLocale();
  const [content, setContent] = useState(""), [settings, setSettings] = useState<EvaSettings | null>(null);
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  const key = useRef<string | null>(null), submitting = useRef(false);
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
    void request("/api/eva?view=status", { signal: abort.signal, cache: "no-store" }).then(async r => {
      if (r.ok) setSettings(await r.json());
    }).catch(() => {});
    return () => abort.abort();
  }, [request, readonly]);
  async function save(process: boolean) {
    if (readonly || submitting.current || !content.trim()) return;
    submitting.current = true; setSaving(true); onBusyChange?.(true); setError(""); key.current ??= crypto.randomUUID();
    try {
      const response = await request("/api/eva", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "capture", key: key.current, content, process }) });
      if (!response.ok) throw new Error(await responseError(response, english ? "Could not save. Your text is still here." : "未能保存，文字还在这里，请重试。"));
      const job = await response.json() as EvaJob;
      setContent("");
      onDirtyChange?.(false);
      showActionToast(job.status === "queued" || job.status === "running" ? (english ? "Paper saved. Eva will sort it." : "纸条收好了，Eva 会在后台整理。") : (english ? "Paper saved to Inbox." : "纸条已存入散落。"));
      key.current = null;
      void Promise.resolve(onSaved()).catch(() => {});
    } catch (reason) { setError(reason instanceof Error ? reason.message : english ? "Could not save paper." : "未能保存纸条，请重试。"); }
    finally { submitting.current = false; setSaving(false); onBusyChange?.(false); }
  }
  return <form className={`${styles.capture} ${compact ? styles.compact : ""}`} onSubmit={(event: FormEvent) => { event.preventDefault(); void save(false); }}>
      <textarea ref={textarea} autoFocus={!compact} aria-label={english ? "Paper content" : "纸条内容"} required maxLength={10000} rows={compact ? 2 : 7} value={content} disabled={saving} onChange={e => { setContent(e.target.value); onDirtyChange?.(Boolean(e.target.value.trim())); }} placeholder={english ? "Anything on your mind…" : "随手写点什么……"} />
      {readonly && <p className={styles.hint}>{english ? "Connect to save." : "连接账户后可保存。"}</p>}
      {!readonly && !settings?.enabled && <p className={styles.hint}>{english ? "Eva is off" : "Eva 未开启"}</p>}
      {error && <ErrorNotice>{error}</ErrorNotice>}
      <div className={styles.captureActions}>
        <button type="submit" className="button secondary eva-paper-action" disabled={saving || readonly || !content.trim()}>{english ? "Save to Inbox" : "存入散落"}</button>
        <button type="button" className="button secondary eva-paper-action" disabled={saving || readonly || !settings?.enabled || !content.trim()} onClick={() => void save(true)}>{saving ? (english ? "Saving…" : "收好纸条中…") : (english ? "Send to Eva" : "交给 Eva")}</button>
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
