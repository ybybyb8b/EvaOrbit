"use client";

import type {ReactNode} from "react";
import {useLocale} from "./locale-controller";

export function TrackerQuickLogButton({name,groupName,quickCapture=false,icon,disabled,onClick}:{
  name:string;groupName?:string;quickCapture?:boolean;icon:ReactNode;disabled?:boolean;onClick:()=>void;
}) {
  const {english}=useLocale();
  const action=quickCapture?(english?"One-tap log":"一键记录"):(english?"Open form":"填写记录");
  return <button type="button" disabled={disabled} title={[name,groupName,action].filter(Boolean).join(" · ")} aria-label={quickCapture?`${english?"Quick record":"快速记录"} ${name}`:name} onClick={onClick}>
    <span className="home-quick-log-icon">{icon}</span>
    <strong>{name}</strong>
  </button>;
}
