"use client";
import type {ReactNode} from "react";
import type {EvaMessage} from "@/lib/native-eva";
import type {ParlorAvatarPlacement} from "@/lib/parlor-appearance";
import {MarkdownMessage} from "./markdown-message";
import styles from "./parlor-chat.module.css";

export function ParlorAssistantLayout({group,hasAvatar,header,children,footer}:{group:boolean;hasAvatar:boolean;header?:ReactNode;children:ReactNode;footer:ReactNode}) {
  return <div className={styles.assistantFrame} data-parlor-assistant-frame data-mode={group?"group":"single"} data-avatar={hasAvatar}>
    {header&&<div className={styles.assistantInfo} data-parlor-message-header>{header}</div>}
    <div className={styles.assistantContent} data-parlor-message-content>{children}</div>
    <div className={styles.assistantInfo} data-parlor-message-info>{footer}</div>
  </div>;
}

export function ParlorMessageBody({message,segmentReplies=false,avatar,avatarPlacement="last",showAvatar=true}:{message:Pick<EvaMessage,"role"|"content">;segmentReplies?:boolean;avatar?:string;avatarPlacement?:ParlorAvatarPlacement;showAvatar?:boolean}) {
  if(!message.content.trim())return null;
  const segmented=segmentReplies&&message.role==="assistant";
  function bubble(children:ReactNode,last:boolean,first:boolean){
    const show=Boolean(avatar&&showAvatar&&(avatarPlacement==="all"||avatarPlacement==="first"&&first||avatarPlacement==="last"&&last));
    return <div className={styles.bubbleRow} data-parlor-bubble-row>
      {show&&(
        // eslint-disable-next-line @next/next/no-img-element -- Device-local resized persona avatar.
        <img className={styles.bubbleAvatar} data-parlor-bubble-avatar src={avatar} width={28} height={28} alt=""/>
      )}
      <div className={styles.bubble} data-chat-bubble data-segment={segmented||undefined}>{children}</div>
    </div>;
  }
  if(message.role==="user")return <div className={styles.bubble} data-chat-bubble><p className={styles.userText}>{message.content}</p></div>;
  return segmented?<MarkdownMessage content={message.content} renderBlock={bubble}/>:bubble(<MarkdownMessage content={message.content}/>,true,true);
}
