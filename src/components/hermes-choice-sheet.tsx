"use client";
import { useState } from "react";
import type { HermesMessage } from "@/lib/hermes";
import { FormSheet } from "./form-sheet";
import { MarkdownMessage } from "./markdown-message";
import { Icon } from "./icons";
import styles from "./hermes-chat.module.css";

export function HermesChoiceSheet({ message, open, english, busy, online, error, onClose, onAnswer }: {
  message: HermesMessage; open: boolean; english: boolean; busy: boolean; online: boolean; error: string;
  onClose: () => void; onAnswer: (message: HermesMessage, content: string) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState<string[]>([]), [draft, setDraft] = useState("");
  const t = (en: string, zh: string) => english ? en : zh;
  const presentation = message.presentation, pending = presentation?.state === "pending", disabled = busy || !online || !pending;
  async function answer(content: string) { if (!disabled && await onAnswer(message, content)) onClose(); }
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
    {pending ? <form className={styles.answerInput} onSubmit={event => { event.preventDefault(); if (draft.trim()) void answer(draft.trim()); }}>
      <textarea aria-label={t("Your answer", "填写回答")} placeholder={t("Write your own answer…", "自己说一个答案……")} rows={1} maxLength={20000} value={draft} disabled={disabled} onChange={event => setDraft(event.target.value)} />
      <button type="submit" aria-label={t("Send answer", "发送回答")} disabled={disabled || !draft.trim()}><Icon name="arrow" /></button>
    </form> : <p className={styles.choiceState} role="status">{presentation?.state === "answered" ? t("Answered", "已回复") : t("This question has ended.", "这个提问已结束。")}</p>}
    {!online && pending && <p className={styles.choiceState} role="status">{t("Hermes is offline. You can reply when it reconnects.", "Hermes 离线，重新连接后可回答。")}</p>}
    {error && <p className={styles.diagnostic} role="alert">{error}</p>}
  </FormSheet>;
}
