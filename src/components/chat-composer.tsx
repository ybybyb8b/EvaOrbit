"use client";
import type {RefObject,KeyboardEvent,TextareaHTMLAttributes} from "react";
import {Icon} from "./icons";
import styles from "./parlor-chat.module.css";

export function ChatComposer({inputRef,draft,english,placeholder,disabled,stop,stopLabel,buttonDisabled,onDraftChange,onSend,onStop,onKeyDown,textareaProps}: {
  inputRef:RefObject<HTMLTextAreaElement|null>;draft:string;english:boolean;placeholder:string;disabled:boolean;
  stop:boolean;stopLabel:string;buttonDisabled:boolean;onDraftChange:(value:string)=>void;onSend:()=>void;onStop:()=>void;
  onKeyDown?:(event:KeyboardEvent<HTMLTextAreaElement>)=>void;textareaProps?:Pick<TextareaHTMLAttributes<HTMLTextAreaElement>,"aria-controls"|"aria-activedescendant">;
}) {
  return <form className={styles.composer} onSubmit={event=>{event.preventDefault();if(!stop&&!buttonDisabled)onSend();}}>
    <div className={styles.composerInput} data-draft={draft}>
      <textarea {...textareaProps} ref={inputRef} aria-label={english?"Message":"消息内容"} rows={1} maxLength={20000} value={draft} disabled={disabled} placeholder={placeholder}
      onChange={event=>onDraftChange(event.target.value)} onKeyDown={event=>{
        if(event.nativeEvent.isComposing||event.keyCode===229)return;
        onKeyDown?.(event);
        if(!event.defaultPrevented&&!stop&&event.key==="Enter"&&!event.shiftKey&&window.matchMedia("(pointer:fine)").matches){event.preventDefault();event.currentTarget.form?.requestSubmit();}
      }}/>
    </div>
    <button className="button primary" type={stop?"button":"submit"} disabled={buttonDisabled}
      aria-label={stop?stopLabel:english?"Send":"发送"} title={stop?stopLabel:undefined} onClick={stop?onStop:undefined}>
      {stop?<svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>:<Icon name="arrow"/>}
    </button>
  </form>;
}
