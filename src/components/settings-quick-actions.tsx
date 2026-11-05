"use client";

import {useState} from "react";
import {SettingsDirectory} from "@/app/settings/settings-directory";
import {useBottomLog} from "./bottom-log-core";
import {FormSheet} from "./form-sheet";
import {useLocale} from "./locale-controller";
import {QuickLogTrigger} from "./quick-log-picker";

export function SettingsQuickActions({onNavigate,local=false}:{onNavigate:(path:string)=>void;local?:boolean}) {
  const {english}=useLocale(),action=useBottomLog();
  const [open,setOpen]=useState(false);
  const label=english?"Settings shortcuts":"设置快捷操作";
  return <>
    <QuickLogTrigger label={action?.onClick?action.label:label} disabled={action?.disabled} onClick={()=>{
      if(action?.onClick){action.onClick();return;}
      setOpen(true);
    }}/>
    {open&&<FormSheet title={label} onClose={()=>setOpen(false)}><SettingsDirectory compact localMode={local} onNavigate={path=>{setOpen(false);onNavigate(path);}}/></FormSheet>}
  </>;
}
