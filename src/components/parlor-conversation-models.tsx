"use client";
import {useRef,useState} from "react";
import {evaCall,evaModelBinding,type EvaGroup,type EvaState,type ParlorPersona} from "@/lib/native-eva";
import {FormSheet} from "./form-sheet";
import {Icon} from "./icons";
import {ParlorErrorNotice} from "./parlor-error-notice";
import styles from "./parlor.module.css";

export function ParlorConversationModels({accountId,conversationId,state,group,persona,english,onClose,onSaved}:{accountId:string;conversationId:string;state:EvaState;group?:EvaGroup;persona:Pick<ParlorPersona,"id"|"name"|"providerId"|"modelId"|"avatarDataURL">;english:boolean;onClose:()=>void;onSaved:()=>Promise<unknown>}){
  const t=(en:string,zh:string)=>english?en:zh;
  const [editing,setEditing]=useState<string|null>(group?null:persona.id),[query,setQuery]=useState(""),[pending,setPending]=useState<{providerId:string;modelId:string}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const lock=useRef(false),members=group?.participants??[persona],member=members.find(p=>p.id===editing),discussion=state.discussions?.find(d=>d.conversationId===conversationId);
  const current=member?evaModelBinding(state,member):undefined;
  const streaming=state.messages.some(m=>m.status==="streaming"&&(!group||m.personaId===editing));
  const pause=discussion?.status==="running",stop=streaming||discussion?.status==="summarizing";
  async function apply(providerId:string,modelId:string){
    if(!member||lock.current)return;
    lock.current=true;setBusy(true);setError("");
    try{await evaCall(accountId,"ai.setConversationModel",{conversationId,personaId:member.id,providerId,modelId});await onSaved();onClose();}
    catch(reason){setError(reason instanceof Error?reason.message:String(reason));}
    finally{lock.current=false;setBusy(false);}
  }
  return <FormSheet title={member?t(`${member.name} · Model`,`${member.name} · 模型`):t("Conversation models","群聊模型")} busy={busy} onClose={onClose}><div className={styles.modelSheet} data-conversation-models>
    {error&&<ParlorErrorNotice inline error={error}/>}
    {group&&member&&<button type="button" className="text-button" disabled={busy} onClick={()=>{setEditing(null);setQuery("");setPending(null);setError("");}}>{t("All participants","所有参与人格")}</button>}
    {!member?<div className={styles.personaChoices}>{members.map(p=><button type="button" className={styles.personaOption} key={p.id} onClick={()=>setEditing(p.id)}><span className={styles.avatar} aria-hidden="true" style={p.avatarDataURL?{backgroundImage:`url("${p.avatarDataURL}")`}:undefined}>{!p.avatarDataURL&&p.name.charAt(0)}</span><span><strong>{p.name}</strong><small>{evaModelBinding(state,p)?.model.name??t("Model unavailable","模型不可用")}</small></span><Icon name="chevronDown"/></button>)}</div>:<>
      <label className="field"><input type="search" aria-label={t("Search conversation models","搜索可用模型")} placeholder={t("Search models","搜索模型")} disabled={busy} value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <div className={styles.modelProviders}>{state.providers.filter(p=>p.enabled).map(provider=>{
        const matches=provider.models.filter(m=>`${provider.name} ${m.name} ${m.id}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
        if(!matches.length)return null;
        const ready=provider.connectionType==="subscription"||provider.hasKey;
        return <section className={styles.modelProvider} key={provider.id}><h3>{provider.name}</h3><div className={styles.personaChoices}>{matches.map(model=>{
          const selected=pending?pending.providerId===provider.id&&pending.modelId===model.id:current?.provider.id===provider.id&&current?.model.id===model.id;
          return <button type="button" className={styles.personaOption} aria-label={`${provider.name} · ${model.name}`} aria-pressed={selected} disabled={busy||!ready} key={model.id} onClick={()=>{if(current?.provider.id===provider.id&&current?.model.id===model.id){setPending(null);return;}if(pause||stop)setPending({providerId:provider.id,modelId:model.id});else void apply(provider.id,model.id);}}><span><strong data-no-translate>{model.name}</strong>{model.name!==model.id&&<small data-no-translate>{model.id}</small>}</span>{selected&&<Icon name="check"/>}</button>;
        })}</div></section>;
      })}</div>
      {!state.providers.some(p=>p.enabled&&p.models.some(m=>`${p.name} ${m.name} ${m.id}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))&&<p className={styles.caption}>{t("No matching models","没有匹配的模型")}</p>}
      {pending&&<button type="button" className="button primary" disabled={busy} onClick={()=>void apply(pending.providerId,pending.modelId)}>{busy?t("Switching…","正在切换…"):pause?t("Pause & switch","暂停并切换"):stop?t("Stop & switch","停止并切换"):t("Switch model","切换模型")}</button>}
    </>}
  </div></FormSheet>;
}
