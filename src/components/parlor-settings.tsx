"use client";
import {useEffect,useRef,useState,type ReactNode} from "react";
import {evaCall,evaIsBusy,type EvaState,type ParlorPersona} from "@/lib/native-eva";
import {useLocale} from "./locale-controller";
import {useNativeEva} from "./native-eva-context";
import {NativeEvaSettings} from "./native-eva-settings";
import {ParlorErrorNotice} from "./parlor-error-notice";
import {Icon} from "./icons";
import {ChevronRight,ArrowLeft2} from "reicon-react";
import {showActionToast} from "./action-toast";
import styles from "./parlor.module.css";
import {ParlorAppearanceSheet,ParlorAppearanceControls,useParlorAppearance} from "./parlor-appearance-sheet";
import {ParlorContext} from "./parlor-context";
import {ParlorMemory,ParlorBackup} from "./parlor-memory";
import {Disclosure} from "./disclosure";

const sections=[
  {id:"appearance",name:"Chat Appearance",zh:"聊天外观",description:"头像、背景与分段气泡",icon:"settings"},
  {id:"providers",name:"Providers & Models",zh:"服务商与模型",description:"连接、密钥与文本模型",icon:"ai"},
  {id:"personas",name:"Personas",zh:"人格",description:"Sebastian 的身份与交流偏好",icon:"people"},
  {id:"memory",name:"Memory",zh:"记忆",description:"长期记忆与人格私有范围",icon:"memory"},
  {id:"context",name:"Context",zh:"上下文",description:"历史、摘要与上下文预算",icon:"chronicle"},
  {id:"groups",name:"Group Chat",zh:"群聊",description:"参与人格与讨论轮次",icon:"people"},
  {id:"tools",name:"Tools & Permissions",zh:"工具与权限",description:"生活数据访问与操作授权",icon:"settings"},
  {id:"usage",name:"Usage & Cost",zh:"用量与费用",description:"请求、Token 与价格记录",icon:"insights"},
  {id:"privacy",name:"Data & Privacy",zh:"数据与隐私",description:"本机存储、外观与数据边界",icon:"settings"},
] as const;

export function ParlorSettings({accountId,back,initialSection="",appearance,onConversation}:{accountId?:string|null;back:ReactNode;initialSection?:string;providerRequest?:(path:string,init?:RequestInit)=>Promise<Response>;appearance?:ReactNode;onConversation?:(id:string)=>void}) {
  const {english}=useLocale(),t=(en:string,zh:string)=>english?en:zh,{supported,memoryProcessingSupported}=useNativeEva();
  const native=Boolean(supported&&accountId);
  const [section,setSection]=useState(initialSection),[state,setState]=useState<EvaState|null>(null),[error,setError]=useState("");
  useEffect(()=>{let active=true;const load=()=>{if(native&&accountId)void evaCall<EvaState>(accountId,"ai.getState").then(value=>{if(active)setState(value);}).catch(reason=>{if(active)setError(reason.message);});};const update=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail?.accountId===accountId&&detail.eventType!=="progress")load();};load();window.addEventListener("evaorbit:ai",update);return()=>{active=false;window.removeEventListener("evaorbit:ai",update);};},[native,accountId]);
  const selected=sections.find(s=>s.id===section);
  const pending=!["appearance","providers","personas","memory","context","groups","usage","privacy"].includes(section);
  return <section className={styles.settingsPage} data-parlor-settings>
    <header className={styles.settingsHeader}>{section?<button className={styles.back} aria-label={t("All Parlor settings","返回 Parlor 设置")} onClick={()=>setSection("")}><ArrowLeft2 className="icon" weight="Outline"/></button>:back}<div><span className={styles.roomLabel}>Parlor</span><h1 data-no-translate>{selected?(selected.id==="appearance"?t(selected.name,selected.zh):selected.name):t("Settings","设置")}</h1></div></header>
    {error&&<ParlorErrorNotice inline error={error}/>}
    {!section?<><nav className={styles.settingsDirectory} aria-label={t("Parlor settings","Parlor 设置")}>
      {sections.map(s=><button key={s.id} onClick={()=>setSection(s.id)} className={styles.settingsItem}><Icon name={s.icon}/><span><strong data-no-translate>{s.id==="appearance"?t(s.name,s.zh):s.name}</strong></span><ChevronRight className="icon" weight="Outline"/></button>)}
    </nav></>:<div className={styles.settingsContent}>
      {section==="appearance"&&accountId&&<ParlorAppearancePage accountId={accountId}/>}
      {section==="providers"&&(native&&accountId?<NativeEvaSettings accountId={accountId}/>:<p>{t("Update Host to connect models","更新 Host 后连接模型")}</p>)}
      {section==="personas"&&(native&&accountId?(state?<PersonaManager accountId={accountId} state={state}/>:<p role="status">{t("Loading persona…","正在读取人格…")}</p>):<p>{t("Update Host to edit personas","更新 Host 后编辑人格")}</p>)}
      {section==="groups"&&<div className={styles.groupParticipants}>{state?.groups?.map(group=><button className="button secondary" key={group.id} onClick={()=>onConversation?.(group.id)} disabled={!onConversation}>{group.title} · {group.participants.length} · {group.mode==="discussion"?"Discussion":"Parallel"}</button>)}{!state?.groups?.length&&<p className={styles.caption}>{t("No groups yet","还没有群聊")}</p>}</div>}
      {section==="memory"&&(native&&accountId&&state?<ParlorMemory accountId={accountId} state={state} onConversation={onConversation}/>:<p>{t("Update Host to manage memories","更新 Host 后管理记忆")}</p>)}
      {section==="context"&&native&&accountId&&state&&<ParlorContext accountId={accountId} state={state}/>}
      {pending&&<p className={styles.caption}>{t("Not available yet","尚未开放")}</p>}
      {section==="usage"&&<p className={styles.caption}>{memoryProcessingSupported?t("Chat usage is in response details; memory processing usage is in Memory settings.","聊天用量见回答详情；记忆整理用量见 Memory 设置。"):t("Usage is in response details","用量见回答详情")}</p>}
      {section==="privacy"&&<div className={styles.info}><dl className={styles.storage}><div><dt>{t("Chats & personas","聊天与人格")}</dt><dd>{t("On device","本机")}</dd></div><div><dt>{t("Credentials","凭据")}</dt><dd>Keychain</dd></div></dl>{appearance}{native&&accountId&&state&&<ParlorBackup accountId={accountId} state={state}/>}</div>}
    </div>}
  </section>;
}

function ParlorAppearancePage({accountId}:{accountId:string}){const {english}=useLocale(),appearance=useParlorAppearance(accountId);return <ParlorAppearanceControls appearance={appearance} english={english}/>;}

function PersonaManager({accountId,state}:{accountId:string;state:EvaState}) {
  const {english}=useLocale(),t=(en:string,zh:string)=>english?en:zh,{groupSupported}=useNativeEva();
  const [selected,setSelected]=useState(state.persona.id),[created,setCreated]=useState<ParlorPersona|null>(null);
  const personas=state.personas??[state.persona],current=personas.find(p=>p.id===selected)??created??state.persona;
  return <><div className={styles.personaDirectory}>{personas.map(p=><button className="button secondary" aria-pressed={selected===p.id} key={p.id} onClick={()=>{setSelected(p.id);setCreated(null);}}>{p.name}</button>)}{groupSupported&&<button className="button secondary" onClick={()=>{const next={...state.persona,id:crypto.randomUUID(),name:t("New persona","新的人格"),chineseName:"",nickname:"",avatarDataURL:undefined,systemPrompt:"",providerId:undefined,modelId:undefined};setCreated(next);setSelected(next.id);}}>{t("Add persona","添加人格")}</button>}</div><PersonaEditor key={current.id} accountId={accountId} initial={current} providers={state.providers} busyRequest={evaIsBusy(state)}/></>;
}

function PersonaEditor({accountId,initial,providers,busyRequest}:{accountId:string;initial:ParlorPersona;providers:EvaState["providers"];busyRequest:boolean}) {
  const {english}=useLocale(),t=(en:string,zh:string)=>english?en:zh;
  const [persona,setPersona]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const appearance=useParlorAppearance(accountId);
  const [avatarOpen,setAvatarOpen]=useState(false);
  const avatarInput=useRef<HTMLInputElement>(null);
  const {groupSupported}=useNativeEva();
  const binding=persona.providerId&&persona.modelId?JSON.stringify([persona.providerId,persona.modelId]):"";
  const availableBindings=providers.filter(p=>p.enabled).flatMap(p=>p.models.map(m=>({key:JSON.stringify([p.id,m.id]),name:`${p.name} · ${m.name}`})));
  return <form className={styles.personaForm} data-no-translate onSubmit={async event=>{event.preventDefault();setBusy(true);setError("");try{await evaCall(accountId,"ai.savePersona",{persona});window.dispatchEvent(new CustomEvent("evaorbit:ai",{detail:{accountId,eventType:"configuration"}}));showActionToast(t("Persona saved on this device","人格已保存到本机"));}catch(reason){setError(reason instanceof Error?reason.message:String(reason));}finally{setBusy(false);}}}>
    <div className={styles.personaProfile}><button type="button" className={styles.personaAvatar} aria-label={t("Change persona avatar","更换人格头像")} onClick={()=>{if(groupSupported&&persona.id!=="sebastian")avatarInput.current?.click();else setAvatarOpen(true);}}><span className={styles.avatar} style={(persona.avatarDataURL||(persona.id==="sebastian"?appearance.images.assistant:undefined))?{backgroundImage:`url("${persona.avatarDataURL||appearance.images.assistant}")`}:undefined} aria-hidden="true">{!(persona.avatarDataURL||(persona.id==="sebastian"&&appearance.images.assistant))&&persona.name.charAt(0)}</span><small>{t("Change avatar","更换头像")}</small></button><div><h2>{persona.name}</h2><p>{persona.chineseName} · {persona.nickname}</p></div></div>
    {error&&<ParlorErrorNotice inline error={error}/>}
    <input ref={avatarInput} type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label={t("Persona avatar image","人格头像图片")} onChange={async event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value="";if(!file)return;setBusy(true);setError("");try{const {prepareParlorAppearanceImage}=await import("@/lib/parlor-appearance");const blob=await prepareParlorAppearanceImage(file,"assistant");const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error(t("Image could not be read","无法读取图片")));reader.readAsDataURL(blob);});if(data.length>256*1024)throw new Error(t("Choose a smaller image","请选择更小的图片"));setPersona(p=>({...p,avatarDataURL:data}));}catch(reason){setError(reason instanceof Error?reason.message:String(reason));}finally{setBusy(false);}}}/>
    {busyRequest&&<p>{t("Response in progress","正在生成回答")}</p>}
    <fieldset disabled={busy||busyRequest} className={styles.fields}>
      <label className="field"><span>{t("Name","名称")}</span><input value={persona.name} required maxLength={80} onChange={e=>setPersona({...persona,name:e.target.value})}/></label>
      <label className="field"><span>{t("How to address you","如何称呼你")}</span><input value={persona.preferredAddress} maxLength={80}  onChange={e=>setPersona({...persona,preferredAddress:e.target.value})}/></label>
      <div className={styles.preferences}>{([['humor',t("Humor","幽默程度"),[['none',t("None","克制")],['subtle',t("Subtle","一点冷幽默")],['playful',t("Playful","轻松诙谐")]]],['formality',t("Formality","正式程度"),[['casual',t("Casual","随意")],['natural',t("Natural","自然有礼")],['formal',t("Formal","正式")]]],['closeness',t("Closeness","亲近程度"),[['reserved',t("Reserved","保持分寸")],['warm',t("Warm","温暖熟悉")],['familiar',t("Familiar","亲近")]]]] as const).map(([field,label,options])=><label className="field" key={field}><span>{label}</span><select value={persona[field]} onChange={e=>setPersona({...persona,[field]:e.target.value})}>{options.map(([value,text])=><option value={value} key={value}>{text}</option>)}</select></label>)}</div>
      <label className="field"><span>{t("Default model","默认模型")}</span><select value={binding} onChange={e=>{const pair=e.target.value?JSON.parse(e.target.value) as [string,string]:undefined;setPersona({...persona,providerId:pair?.[0],modelId:pair?.[1]});}}><option value="">{t("Automatic","自动")}</option>{binding&&!availableBindings.some(m=>m.key===binding)&&<option value={binding} disabled>{t("Bound model unavailable — choose again","绑定模型不可用，请重新选择")}</option>}{availableBindings.map(m=><option key={m.key} value={m.key}>{m.name}</option>)}</select></label>
      <Disclosure title={t("Identity & system prompt","身份与系统提示词")}><label className="field"><span>{t("Persona prompt","人格提示词")}</span><textarea rows={12} value={persona.systemPrompt} required maxLength={16000} onChange={e=>setPersona({...persona,systemPrompt:e.target.value})}/></label></Disclosure>
      <button type="submit" className="button primary">{busy?t("Saving…","保存中…"):t("Save persona","保存人格")}</button>
    </fieldset>
    {avatarOpen&&<ParlorAppearanceSheet appearance={appearance} english={english} onClose={()=>setAvatarOpen(false)}/>}
  </form>;
}
