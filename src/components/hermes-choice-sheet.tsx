"use client";
import { useState } from "react";
import type { HermesMessage } from "@/lib/hermes";
import { useHermesDraft } from "@/lib/hermes-draft";
import { FormSheet } from "./form-sheet";
import { HermesErrorNotice } from "./hermes-error-notice";
import { MarkdownMessage } from "./markdown-message";
import { Icon } from "./icons";
import styles from "./hermes-chat.module.css";

export function HermesChoiceSheet({ scope, message, open, english, busy, online, error, onDismissError, onClose, onAnswer }: {
  scope: string | null; message: HermesMessage; open: boolean; english: boolean; busy: boolean; online: boolean | undefined; error: string;
  onDismissError: () => void;
  onClose: () => void; onAnswer: (message: HermesMessage, content: string) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useHermesDraft(scope, message.id, "answer");
  const t = (en: string, zh: string) => english ? en : zh;
  const presentation = message.presentation, pending = presentation?.state === "pending", disabled = busy || online === false || !pending;
  async function answer(content: string) { if (!disabled && await onAnswer(message, content)) { setDraft(""); onClose(); } }
  if (!open) return null;
  return <FormSheet title={t("Hermes is asking", "Hermes 在问")} className={styles.choiceSheet} onClose={onClose} busy={busy} dirty={false}>
    <div className={styles.question}><MarkdownMessage content={message.content} /></div>
    <div className={styles.popupOptions} role="group" aria-label={t("Reply options", "回复选项")}>
      {presentation?.options?.map((option, index) => <button key={index} type="button" disabled={disabled} aria-pressed={presentation.multi ? selected.includes(option) : undefined} onClick={() => {
        if (presentation.multi) setSelected(previous => previous.includes(option) ? previous.filter(value => value !== option) : [...previous, option]);
        else void answer(option);
      }}><span className={styles.optionLetter}>{String.fromCharCode(65 + index)}</span><span>{option}</span><Icon name={presentation.multi && selected.includes(option) ? "check" : "chevronDown"} /></button>)}
    </div>
    {presentation?.multi && pending && <button className={`button secondary ${styles.confirmOptions}`} disabled={disabled || !selected.length} onClick={() => void answer(JSON.stringify(selected))}>{t("Confirm selection", "确认选择")}{selected.length ? ` · ${selected.length}` : ""}</button>}
    {pending ? <form className={styles.answerInput} onSubmit={event => { event.preventDefault(); if (draft.trim()) void answer(draft); }}>
      <textarea aria-label={t("Your answer", "填写回答")} placeholder={t("Write your own answer…", "自己说一个答案……")} rows={1} maxLength={20000} value={draft} disabled={disabled} onChange={event => setDraft(event.target.value)} />
      <button type="submit" aria-label={t("Send answer", "发送回答")} disabled={disabled || !draft.trim()}><Icon name="arrow" /></button>
    </form> : <p className={styles.choiceState} role="status">{presentation?.state === "answered" ? t("Answered", "已回复") : t("This question has ended.", "这个提问已结束。")}</p>}
    {online === false && pending && <p className={styles.choiceState} role="status">{t("Hermes is offline. You can reply when it reconnects.", "Hermes 离线，重新连接后可回答。")}</p>}
    {error && <><HermesErrorNotice inline className={styles.diagnostic} error={error} fallback={t("Your selection could not be confirmed.", "选择尚未确认，可以重试。")} />
      <button type="button" className="text-button" onClick={onDismissError}>{t("Dismiss notice", "关闭提示")}</button></>}
  </FormSheet>;
}
