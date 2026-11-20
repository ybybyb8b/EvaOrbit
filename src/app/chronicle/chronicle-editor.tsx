"use client";

import { useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ChoiceSelect } from "@/components/choice-select";
import { ErrorNotice } from "@/components/error-notice";
import { FormPreviewNotice, useFormPreview } from "@/components/form-preview";
import { scrollFormSheetField } from "@/components/form-sheet";
import { useLocale } from "@/components/locale-controller";
import { MarkdownMessage } from "@/components/markdown-message";
import type { ChronicleEntry, ChronicleSource } from "@/lib/types";
import styles from "./chronicle-editor.module.css";

export type ChronicleDraft = Pick<ChronicleEntry, "date" | "title" | "contentMd" | "source">;

export function ChronicleEditor({ draft, onChange, error }: {
  draft: ChronicleDraft;
  onChange: (value: ChronicleDraft) => void;
  error?: string;
}) {
  const [preview, setPreview] = useState(false);
  const readonly = useFormPreview();
  const { english } = useLocale();
  const textareaId = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const errorNotice = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const notice = errorNotice.current;
    if (error && notice) scrollFormSheetField(notice.closest<HTMLElement>(".form-sheet-body"), notice);
  }, [error]);

  function resumeWriting() {
    if (!preview) return;
    flushSync(() => setPreview(false));
    textarea.current?.focus({ preventScroll: true });
  }

  return <div className={styles.editor}>
    {readonly && <FormPreviewNotice />}
    {error && <ErrorNotice ref={errorNotice} inline>{error}</ErrorNotice>}
    <label className="field">
      <span>{english ? "Title" : "标题"}</span>
      <input required maxLength={300} value={draft.title} onChange={event => onChange({ ...draft, title: event.target.value })} />
    </label>
    <label className={`field ${styles.date}`}>
      <span>{english ? "Date" : "日期"}</span>
      <input required type="date" value={draft.date} onChange={event => onChange({ ...draft, date: event.target.value })} />
    </label>

    <div className={styles.body}>
      <div className={styles.bodyHeader}>
        <label htmlFor={textareaId}>{english ? "Entry" : "正文"}</label>
        <div className={styles.modes} role="group" aria-label={english ? "Entry editor" : "正文编辑器"}>
          <button type="button" aria-pressed={!preview} onClick={resumeWriting}>{english ? "Write" : "撰写"}</button>
          <button type="button" aria-pressed={preview} disabled={!draft.contentMd.trim()} onClick={() => setPreview(true)}>{english ? "Preview" : "预览"}</button>
        </div>
      </div>
      <textarea id={textareaId} ref={textarea} className={styles.paper} aria-label={english ? "Markdown" : "正文（Markdown）"}
        hidden={preview} required maxLength={100000} value={draft.contentMd}
        onChange={event => onChange({ ...draft, contentMd: event.target.value })}
        placeholder={english ? "Write in Markdown…" : "使用 Markdown 撰写…"} />
      {preview && <div className={`${styles.paper} ${styles.preview}`} role="region" aria-label={english ? "Entry preview" : "正文预览"} tabIndex={0}>
        <MarkdownMessage content={draft.contentMd} offlineMedia={readonly} />
      </div>}
    </div>

    <div className={`field ${styles.source}`}>
      <span>{english ? "Source" : "来源"}</span>
      <ChoiceSelect aria-label={english ? "Source" : "来源"} value={draft.source} onChange={event => onChange({ ...draft, source: event.target.value as ChronicleSource })}>
        <option value="manual">{english ? "Manual" : "手动"}</option>
        <option value="chatgpt">ChatGPT</option>
      </ChoiceSelect>
    </div>
  </div>;
}
