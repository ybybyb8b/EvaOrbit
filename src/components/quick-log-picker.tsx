"use client";
import type {IconComponent} from "reicon-react";
import {Icon} from "./icons";
import {useLocale} from "./locale-controller";
export type QuickLogOption<K extends string>={kind:K;icon:IconComponent;en:string;zh:string;disabled?:boolean};
export function QuickLogTrigger({label,disabled,onClick}:{label?:string;disabled?:boolean;onClick:()=>void}){
  const {english}=useLocale(),title=label??(english?"Quick Log":"快速记录");
  return <button type="button" className="home-quick-log-trigger" aria-label={title} title={title} aria-haspopup="dialog" disabled={disabled} onClick={onClick}><Icon name="plus" variant="stroke"/></button>;
}
export function QuickLogPicker<K extends string>({options,onChoose,disabled=false}:{options:QuickLogOption<K>[];onChoose:(kind:K)=>void;disabled?:boolean}){
  const {english}=useLocale();
  return <div className="home-quick-log-grid">{options.map(({kind,icon:LogIcon,en,zh,disabled:unavailable})=><button type="button" key={kind} disabled={disabled||unavailable} onClick={()=>onChoose(kind)}><LogIcon className="home-quick-log-icon" size={20} weight="Outline" strokeWidth={1.5}/><strong>{english?en:zh}</strong></button>)}</div>;
}
