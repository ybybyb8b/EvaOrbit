"use client";

import { useEffect,useRef,useState } from "react";
import { Icon } from "@/components/icons";

type ToastTone="success"|"deleted";
type ToastDetail={id:number;message:string;tone:ToastTone};
const toastEvent="evaorbit:action-toast";
let nextToastId=0;
let pendingToast:ToastDetail|null=null;

function toneFor(message:string):ToastTone{return /delete|remove|cancel|archive|删除|移除|取消|归档/i.test(message)?"deleted":"success";}

export function showActionToast(message:string,tone=toneFor(message)){
  if(typeof window==="undefined"||!message.trim())return;
  pendingToast={id:++nextToastId,message:message.trim(),tone};
  window.dispatchEvent(new CustomEvent<ToastDetail>(toastEvent,{detail:pendingToast}));
}

export function ToastNotice({message,onShown}:{message:string;onShown:()=>void}){
  const delivered=useRef(false);
  useEffect(()=>{if(delivered.current)return;delivered.current=true;showActionToast(message);onShown();},[message,onShown]);
  return null;
}

export function ActionToastViewport(){
  const[toast,setToast]=useState<ToastDetail|null>(null),[visible,setVisible]=useState(false);
  const visibleRef=useRef(false),hideTimer=useRef<number|null>(null),removeTimer=useRef<number|null>(null),frame=useRef<number|null>(null);
  useEffect(()=>{
    const clearTimers=()=>{if(hideTimer.current!==null)window.clearTimeout(hideTimer.current);if(removeTimer.current!==null)window.clearTimeout(removeTimer.current);if(frame.current!==null)window.cancelAnimationFrame(frame.current);hideTimer.current=null;removeTimer.current=null;frame.current=null;};
    const hide=()=>{visibleRef.current=false;setVisible(false);removeTimer.current=window.setTimeout(()=>setToast(null),160);};
    const present=(detail:ToastDetail)=>{if(!detail.message)return;pendingToast=null;clearTimers();setToast(detail);if(!visibleRef.current){frame.current=window.requestAnimationFrame(()=>{visibleRef.current=true;setVisible(true);});}hideTimer.current=window.setTimeout(hide,2300);};
    const onToast=(event:Event)=>present((event as CustomEvent<ToastDetail>).detail);
    window.addEventListener(toastEvent,onToast);
    if(pendingToast)present(pendingToast);
    return()=>{window.removeEventListener(toastEvent,onToast);clearTimers();};
  },[]);
  if(!toast)return null;
  return <div className="action-toast-viewport" aria-live="polite" aria-atomic="true"><button type="button" className="action-toast" data-visible={visible} data-tone={toast.tone} onClick={()=>{if(hideTimer.current!==null)window.clearTimeout(hideTimer.current);visibleRef.current=false;setVisible(false);removeTimer.current=window.setTimeout(()=>setToast(null),160);}}><span className="action-toast-icon"><Icon name={toast.tone==="deleted"?"trash":"check"} variant="stroke"/></span><span className="user-content">{toast.message}</span></button></div>;
}
