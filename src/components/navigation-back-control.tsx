"use client";
import {ArrowLeft2} from "reicon-react";
import {useLocale} from "./locale-controller";
export function NavigationBackControl({onClick,disabled=false}:{onClick:()=>void;disabled?:boolean}){
 const {english}=useLocale();
 return <button type="button" className="page-back-button" disabled={disabled} aria-label={english?"Back to previous page":"返回上一页"} onClick={onClick}><ArrowLeft2 size={20} weight="Outline" aria-hidden="true"/><span>{english?"Back":"返回"}</span></button>;
}
