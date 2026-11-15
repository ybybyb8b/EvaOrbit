"use client";
import {useId} from "react";
import type {EvaMessage} from "@/lib/native-eva";
import {MarkdownMessage} from "./markdown-message";
import styles from "./parlor-chat.module.css";

export function ParlorMessageBody({message,showTail=true,segmentReplies=false}:{message:Pick<EvaMessage,"role"|"content">;showTail?:boolean;segmentReplies?:boolean}) {
  const tailMask=useId();
  const tail = showTail && <svg className={styles.tail} data-bubble-tail viewBox="0 0 26 22" aria-hidden="true" focusable="false">
    <defs><mask id={tailMask} maskUnits="userSpaceOnUse" x="-1" y="-1" width="28" height="24"><rect x="-1" y="-1" width="28" height="24" fill="white" /><rect x="6" y="-100" width="1000" height="122" rx="18" fill="black" /></mask></defs>
    <g mask={`url(#${tailMask})`}>
      <path className={styles.tailFill} d="M26 0C22 10 15 19 0 22C7 16 9 9 7 0Z" />
      <path className={styles.tailEdge} d="M26 0C22 10 15 19 0 22C7 16 9 9 7 0" />
    </g>
  </svg>;

  const segmented=segmentReplies&&message.role==="assistant";
  return segmented?<MarkdownMessage content={message.content} renderBlock={(children,last)=><div className={styles.bubble} data-segment>{last&&tail}{children}</div>}/>:<div className={styles.bubble}>{tail}{message.role==="assistant"?<MarkdownMessage content={message.content}/>:<p className={styles.userText}>{message.content}</p>}</div>;
}
