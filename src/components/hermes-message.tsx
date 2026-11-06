"use client";
import { useId } from "react";
import { hermesResponseChoices, type HermesMessage } from "@/lib/hermes";
import { MarkdownMessage } from "./markdown-message";
import { Disclosure } from "./disclosure";
import { Icon } from "./icons";
import styles from "./hermes-chat.module.css";

export function HermesMessageBody({ message, responseQuestion, english, showTail = true, onOpenOptions }: {
  message: HermesMessage; english: boolean; showTail?: boolean;
  responseQuestion?: HermesMessage;
  onOpenOptions: (message: HermesMessage) => void;
}) {
  const tailMask = useId();
  const presentation = message.presentation;
  const selectedChoices = hermesResponseChoices(message, responseQuestion);
  const t = (en: string, zh: string) => english ? en : zh;
  const pending = presentation?.state === "pending";
  return <>
  {message.role === "assistant" && presentation?.reasoning && <Disclosure title={<><Icon name="insights" />{t("Thinking", "思考内容")}</>} className={styles.reasoning}>
    <div className={styles.thoughtContent}><MarkdownMessage content={presentation.reasoning} /></div>
  </Disclosure>}
  <div className={styles.bubble} data-note={presentation?.kind === "note" || undefined}>
    {showTail && presentation?.kind !== "note" && <svg className={styles.tail} data-bubble-tail viewBox="0 0 26 22" aria-hidden="true" focusable="false">
      <defs><mask id={tailMask} maskUnits="userSpaceOnUse" x="-1" y="-1" width="28" height="24"><rect x="-1" y="-1" width="28" height="24" fill="white" /><rect x="6" y="-100" width="1000" height="122" rx="18" fill="black" /></mask></defs>
      <path className={styles.tailFill} d="M26 0C22 10 15 19 0 22C7 16 9 9 7 0Z" />
      <path className={styles.tailEdge} d="M26 0C22 10 15 19 0 22C7 16 9 9 7 0" mask={`url(#${tailMask})`} />
    </svg>}
    {presentation?.kind === "note" && <span className={styles.noteLabel}>{t("Sticky note", "便利贴")}</span>}
    {message.role === "assistant" ? <MarkdownMessage content={message.content} /> : selectedChoices
      ? <ul className={styles.selectedChoices}>{selectedChoices.map((choice, index) => <li key={index}>{choice}</li>)}</ul>
      : <p className={styles.userText}>{message.content}</p>}
    {message.role === "assistant" && presentation?.kind === "choices" && <div className={styles.choiceCard}>
      {pending ? <button className="text-button" aria-haspopup="dialog" onClick={() => onOpenOptions(message)}>{t("View options", "查看选项")}</button> : <small className={styles.choiceState}>{presentation.state === "answered" ? t("Answered", "已回复") : t("Question expired", "提问已结束")}</small>}
    </div>}
  </div></>;
}
