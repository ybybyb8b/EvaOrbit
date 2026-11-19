"use client";
import {useId,useRef,useState,type ReactNode} from "react";
import {AlertCircle,ChevronRight,Refresh} from "reicon-react";
import type {EvaMessage} from "@/lib/native-eva";
import type {ParlorAvatarPlacement} from "@/lib/parlor-appearance";
import {parlorReplyFailure} from "@/lib/parlor-reply-failure";
import {FormSheet} from "./form-sheet";
import {Icon} from "./icons";
import {useLocale} from "./locale-controller";
import {MarkdownMessage} from "./markdown-message";
import {SelectDropdown} from "./select-dropdown";
import styles from "./parlor-chat.module.css";

export function ParlorAssistantLayout({group,hasAvatar,header,children,footer}:{group:boolean;hasAvatar:boolean;header?:ReactNode;children:ReactNode;footer:ReactNode}) {
  return <div className={styles.assistantFrame} data-parlor-assistant-frame data-mode={group?"group":"single"} data-avatar={hasAvatar}>
    {header&&<div className={styles.assistantInfo} data-parlor-message-header>{header}</div>}
    <div className={styles.assistantContent} data-parlor-message-content>{children}</div>
    <div className={styles.assistantInfo} data-parlor-message-info>{footer}</div>
  </div>;
}

function ParlorBubbleAvatar({avatar}:{avatar:string}) {
  // eslint-disable-next-line @next/next/no-img-element -- Device-local resized avatar.
  return <img className={styles.bubbleAvatar} data-parlor-bubble-avatar src={avatar} width={28} height={28} alt=""/>;
}

export function ParlorFailedReply({error,interrupted,avatar,onRetry,onDelete,onSettings,disabled,pending}:{
  error?:string;interrupted:boolean;avatar?:string;onRetry?:()=>void;onDelete?:()=>void;onSettings:()=>void;disabled:boolean;pending:"retry"|"delete"|null;
}) {
  const {english}=useLocale(),t=(en:string,zh:string)=>english?en:zh;
  const [detailsOpen,setDetailsOpen]=useState(false);
  const [menuOpen,setMenuOpen]=useState(false);
  const menuAnchor=useRef<HTMLDivElement>(null);
  const menuId=useId();
  const moreLabel=t("More message actions","更多消息操作");
  const failure=parlorReplyFailure(error,english,interrupted);
  const needsSettings=failure.action==="settings";
  const retryLabel=pending==="retry"?t("Retrying…","正在重试…"):t("Retry","重试");
  function closeMenu() {
    if(menuAnchor.current?.contains(document.activeElement))menuAnchor.current.querySelector("button")?.focus({preventScroll:true});
    setMenuOpen(false);
  }
  return <div className={styles.failureCard} data-parlor-failure-card aria-busy={pending!==null||undefined}>
    {avatar&&<ParlorBubbleAvatar avatar={avatar}/>}
    <div className={styles.failureHeader}>
      <span className={styles.failureLabel} role="status"><AlertCircle weight="Outline" aria-hidden="true"/>{t("Reply incomplete","回复未完成")}</span>
      {onDelete&&<div ref={menuAnchor}>
        <button type="button" className={`text-button ${styles.failureMore}`} aria-label={moreLabel} aria-expanded={menuOpen} aria-controls={menuOpen?menuId:undefined} disabled={disabled} onClick={()=>setMenuOpen(open=>!open)}><Icon name="more"/></button>
        {menuOpen&&<SelectDropdown anchor={menuAnchor} id={menuId} label={moreLabel} onClose={closeMenu} minWidth={138}>
          {needsSettings&&onRetry&&<button type="button" className={styles.failureMenuItem} disabled={disabled} onClick={()=>{closeMenu();onRetry();}}><Refresh weight="Outline" aria-hidden="true"/>{retryLabel}</button>}
          <button type="button" className={`${styles.failureMenuItem} ${styles.failureDelete}`} disabled={disabled} onClick={()=>{closeMenu();onDelete();}}><Icon name="trash"/>{t("Delete message","删除消息")}</button>
        </SelectDropdown>}
      </div>}
    </div>
    <p className={styles.failureReason} data-parlor-failure-reason>{failure.reason}</p>
    <div className={styles.failureFooter}>
      <button type="button" className={`text-button ${styles.failureDetails}`} onClick={()=>setDetailsOpen(true)}><ChevronRight weight="Outline" aria-hidden="true"/>{t("View error details","查看错误详情")}</button>
      {needsSettings?<button type="button" className={`button primary ${styles.failurePrimary}`} disabled={pending!==null} onClick={onSettings}>{t("Check settings","检查设置")}</button>
        :onRetry&&<button type="button" className={`button primary ${styles.failurePrimary}`} disabled={disabled} onClick={onRetry}><Refresh weight="Outline" aria-hidden="true"/>{retryLabel}</button>}
    </div>
    {detailsOpen&&<FormSheet className={styles.failureSheet} title={t("Error details","错误详情")} onClose={()=>setDetailsOpen(false)}>
      <pre className={styles.failureError}>{error||t("No error details were recorded.","这条回复没有记录错误详情。")}</pre>
    </FormSheet>}
  </div>;
}

export function ParlorMessageBody({message,segmentReplies=false,avatar,avatarPlacement="last",showAvatar=true}:{message:Pick<EvaMessage,"role"|"content">;segmentReplies?:boolean;avatar?:string;avatarPlacement?:ParlorAvatarPlacement;showAvatar?:boolean}) {
  if(!message.content.trim())return null;
  const segmented=segmentReplies&&message.role==="assistant";
  function bubble(children:ReactNode,last:boolean,first:boolean){
    const show=Boolean(avatar&&showAvatar&&(avatarPlacement==="all"||avatarPlacement==="first"&&first||avatarPlacement==="last"&&last));
    return <div className={styles.bubbleRow} data-parlor-bubble-row>
      {show&&avatar&&<ParlorBubbleAvatar avatar={avatar}/>}
      <div className={styles.bubble} data-chat-bubble data-segment={segmented||undefined}>{children}</div>
    </div>;
  }
  if(message.role==="user")return bubble(<p className={styles.userText}>{message.content}</p>,true,true);
  return segmented?<MarkdownMessage content={message.content} renderBlock={bubble}/>:bubble(<MarkdownMessage content={message.content}/>,true,true);
}
