"use client";
import {useState} from "react";
import {evaCall,evaIsBusy,type EvaGroup,type EvaState} from "@/lib/native-eva";
import {useNativeEva} from "./native-eva-context";
import {FormSheet} from "./form-sheet";
import {ParlorErrorNotice} from "./parlor-error-notice";
import styles from "./parlor.module.css";

export function ParlorGroupSheet({accountId,state,group,english,onClose,onSaved,onPersonas}:{accountId:string;state:EvaState;group?:EvaGroup;english:boolean;onClose:()=>void;onSaved:(id:string)=>void;onPersonas:()=>void}){
  const {discussionSupported}=useNativeEva();
  const [mode,setMode]=useState(group?.mode??"parallel"),[maxRounds,setMaxRounds]=useState(group?.maxRounds??3);
  const t=(en:string,zh:string)=>english?en:zh;
  const [id]=useState(()=>group?.id??crypto.randomUUID()),[title,setTitle]=useState(group?.title??t("New group","新群聊"));
  const [ids,setIds]=useState<string[]>(group?.participants.map(p=>p.id)??[]),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const personas=state.personas??[state.persona],locked=busy||evaIsBusy(state)||Boolean(group&&state.discussions?.some(d=>d.conversationId===group.id&&["paused","interrupted"].includes(d.status)));
  return <FormSheet title={group?t("Group members","群聊成员"):t("New group","创建群聊")} onClose={onClose} dirty={false}><form className={styles.groupForm} data-parlor-group-form data-parlor-settings onSubmit={async event=>{event.preventDefault();if(busy)return;setBusy(true);setError("");try{await evaCall(accountId,"ai.saveGroup",{conversationId:id,title,personaIds:ids,...(discussionSupported?{mode,maxRounds}:{})});onSaved(id);}catch(reason){setError(reason instanceof Error?reason.message:String(reason));}finally{setBusy(false);}}}>
    {error&&<ParlorErrorNotice inline error={error}/>}
    <label className="field"><span>{t("Group name","群聊名称")}</span><input required maxLength={80} value={title} disabled={locked} onChange={e=>setTitle(e.target.value)}/></label>
    <label className="field"><span>{t("Mode","模式")}</span><select aria-label={t("Mode","模式")} value={mode} disabled={locked} onChange={e=>setMode(e.target.value as "parallel"|"discussion")}><option value="parallel">Parallel</option><option value="discussion" disabled={!discussionSupported}>Discussion</option></select></label>
    {mode==="discussion"&&<label className="field"><span>{t("Maximum rounds","最多讨论轮数")}</span><select aria-label={t("Maximum rounds","最多讨论轮数")} value={maxRounds} disabled={locked} onChange={e=>setMaxRounds(Number(e.target.value))}>{[1,2,3,4,5].map(n=><option value={n} key={n}>{n}</option>)}</select></label>}
    <div className={styles.groupHeading}><strong>{t("Participants","参与人格")}</strong><small>{ids.length}/8 · {mode==="discussion"?"Discussion":"Parallel"}</small></div>
    <fieldset className={styles.groupParticipants} disabled={locked}>{personas.map(persona=>{
      const provider=state.providers.find(p=>p.id===persona.providerId),model=provider?.models.find(m=>m.id===persona.modelId),ready=Boolean(provider?.enabled&&model&&(provider.connectionType==="subscription"||provider.hasKey));
      return <label className={styles.groupParticipant} key={persona.id}><input type="checkbox" checked={ids.includes(persona.id)} disabled={!ready||(!ids.includes(persona.id)&&ids.length>=8)} onChange={e=>setIds(value=>e.target.checked?[...value,persona.id]:value.filter(id=>id!==persona.id))}/><span className={styles.avatar} style={persona.avatarDataURL?{backgroundImage:`url("${persona.avatarDataURL}")`}:undefined}>{!persona.avatarDataURL&&persona.name.charAt(0)}</span><span><strong>{persona.name}</strong><small>{ready?`${provider?.name} · ${model?.name}`:t("Connect a model","连接模型")}</small></span></label>;
    })}</fieldset>
    <div className={styles.groupHeading}><button type="button" className="text-button" disabled={locked} onClick={onPersonas}>{t("Manage personas","管理人格")}</button><button className="button primary" type="submit" disabled={locked||ids.length<2||!title.trim()}>{busy?t("Saving…","保存中…"):group?t("Save","保存"):t("Create group","创建群聊")}</button></div>
  </form></FormSheet>;
}
