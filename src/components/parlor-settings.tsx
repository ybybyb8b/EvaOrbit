"use client";
import {useEffect,useState,type ReactNode} from "react";
import {evaCall,type EvaState,type ParlorPersona} from "@/lib/native-eva";
import {useLocale} from "./locale-controller";
import {useNativeEva} from "./native-eva-context";
import {NativeEvaSettings} from "./native-eva-settings";
import {ParlorErrorNotice} from "./parlor-error-notice";
import {Icon} from "./icons";
import {ChevronRight,ArrowLeft2} from "reicon-react";
import {showActionToast} from "./action-toast";
import styles from "./parlor.module.css";
import {ParlorAppearanceSheet,useParlorAppearance} from "./parlor-appearance-sheet";
import {Disclosure} from "./disclosure";

const sections=[
  {id:"providers",name:"Providers & Models",zh:"服务商与模型",description:"连接、密钥与文本模型",icon:"ai"},
  {id:"personas",name:"Personas",zh:"人格",description:"Sebastian 的身份与交流偏好",icon:"people"},
  {id:"memory",name:"Memory",zh:"记忆",description:"长期记忆与人格私有范围",icon:"memory"},
  {id:"context",name:"Context",zh:"上下文",description:"历史、摘要与上下文预算",icon:"chronicle"},
  {id:"groups",name:"Group Chat",zh:"群聊",description:"参与人格与讨论轮次",icon:"people"},
  {id:"tools",name:"Tools & Permissions",zh:"工具与权限",description:"生活数据访问与操作授权",icon:"settings"},
  {id:"usage",name:"Usage & Cost",zh:"用量与费用",description:"请求、Token 与价格记录",icon:"insights"},
  {id:"privacy",name:"Data & Privacy",zh:"数据与隐私",description:"本机存储、外观与数据边界",icon:"settings"},
] as const;

export function ParlorSettings({accountId,back,initialSection="",appearance}:{accountId?:string|null;back:ReactNode;initialSection?:string;providerRequest?:(path:string,init?:RequestInit)=>Promise<Response>;appearance?:ReactNode}) {
  const {english}=useLocale(),t=(en:string,zh:string)=>english?en:zh,{supported}=useNativeEva();
  const native=Boolean(supported&&accountId);
  const [section,setSection]=useState(initialSection),[state,setState]=useState<EvaState|null>(null),[error,setError]=useState("");
  useEffect(()=>{let active=true;const load=()=>{if(native&&accountId)void evaCall<EvaState>(accountId,"ai.getState").then(value=>{if(active)setState(value);}).catch(reason=>{if(active)setError(reason.message);});};const update=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail?.accountId===accountId&&detail.eventType!=="progress")load();};load();window.addEventListener("evaorbit:ai",update);return()=>{active=false;window.removeEventListener("evaorbit:ai",update);};},[native,accountId]);
  const selected=sections.find(s=>s.id===section);
  const pending=!["providers","personas","usage","privacy"].includes(section);
  return <section className={styles.settingsPage} data-parlor-settings>
    <header className={styles.settingsHeader}>{section?<button className={styles.back} aria-label={t("All Parlor settings","返回 Parlor 设置")} onClick={()=>setSection("")}><ArrowLeft2 className="icon" weight="Outline"/></button>:back}<div><span className={styles.roomLabel}>Parlor</span><h1 data-no-translate>{selected?selected.name:t("Settings","设置")}</h1></div></header>
    {error&&<ParlorErrorNotice inline error={error}/>}
    {!section?<><p className={styles.settingsIntro}>{t("A private room for conversation. Make it your own.","私人会客厅，按你的习惯打点。")}</p><nav className={styles.settingsDirectory} aria-label={t("Parlor settings","Parlor 设置")}>
      {sections.map(s=><button key={s.id} onClick={()=>setSection(s.id)} className={styles.settingsItem}><Icon name={s.icon}/><span><strong data-no-translate>{s.name}</strong><small>{english?s.zh:s.description}</small></span><ChevronRight className="icon" weight="Outline"/></button>)}
    </nav></>:<div className={styles.settingsContent}>
      {section==="providers"&&(native&&accountId?<NativeEvaSettings accountId={accountId}/>:<p>{t("Install the updated Native Host to configure local providers.","请安装新版 Native Host，再配置本机服务商。")}</p>)}
      {section==="personas"&&(native&&accountId?(state?<PersonaEditor key={state.persona.id} accountId={accountId} initial={state.persona} providers={state.providers} busyRequest={Boolean(state.active)}/>:<p role="status">{t("Loading persona…","正在读取人格…")}</p>):<p>{t("Sebastian is available with the updated local Host. This version does not connect to a computer agent.","Sebastian 将由新版本地 Host 提供。当前版本不再连接电脑 Agent。")}</p>)}
      {pending&&<div className={styles.future}><Icon name={selected?.icon??"settings"}/><h2>{selected?.zh}</h2><p>{section==="memory"?t("Automatic memory is off. This version does not save facts or access your Memory Graph.","自动记忆尚未启用。当前对话不会整理长期记忆或读取正式 Memory Graph。"):section==="context"?t("Original messages stay on device. Automatic summaries and token budgeting will be added in a later stage.","原始消息保存在本机。自动摘要与 Token 预算将在后续阶段接入。"):section==="groups"?t("This version supports one persona per conversation. Shared discussions will live here when available.","当前版本支持单人格对话。多人讨论接通后，将在这里管理。"):t("No EO tools are connected to this conversation yet. Persona descriptions do not grant data access.","当前聊天尚未接通 EO 工具。人格描述不会授予生活数据访问或写入权限。")}</p><span>{t("Not enabled in this version","此版本尚未启用")}</span></div>}
      {section==="usage"&&<div className={styles.info}><h2>{t("Usage stays with each response","每条回答保留自己的账目")}</h2><p>{t("Tap a response’s model / token line to inspect requests, input, output, cache and estimated cost. Missing usage or prices are shown as unknown.","点击回答下方的模型 / Token 小字，可查看请求次数、输入、输出、缓存及费用估算。未返回的用量和未配置的价格保持未知。")}</p><p>{t("Saving settings, switching a persona and reading history never call a model. A cross-conversation usage report is not available yet.","保存设置、切换人格、读取历史均不调用模型。跨会话的用量报表尚未接入。")}</p></div>}
      {section==="privacy"&&<div className={styles.info}><h2>{native?t("On this device","保存在本机"):t("Current connection","当前连接")}</h2><p>{native?t("Conversations and persona preferences stay in local SQLite. API Keys stay in Keychain. They are excluded from regular exports. No AI cloud sync is enabled.","对话与人格偏好保存在本机 SQLite，API Key 存入 Keychain，不进入普通导出。尚未启用 AI 云同步。"):t("This page does not store Native conversations or API Keys. Install the local Host to use Parlor.","当前页面不保存 Native 对话或密钥。请在本地 Host 中使用 Parlor。")}</p><p>{t("Delete individual conversations from History. Removing Parlor conversations does not remove Task, Memo or Graph records.","在历史对话中删除单段聊天，不会删除 Task、Memo 或 Graph 业务记录。")}</p>{appearance??(accountId?<ParlorAppearance accountId={accountId}/>:null)}</div>}
    </div>}
  </section>;
}

function ParlorAppearance({accountId}:{accountId:string}){const {english}=useLocale(),appearance=useParlorAppearance(accountId);const [open,setOpen]=useState(false);return <><button className="button secondary" onClick={()=>setOpen(true)}>{english?"Chat appearance & avatar":"聊天外观与头像"}</button>{open&&<ParlorAppearanceSheet appearance={appearance} english={english} onClose={()=>setOpen(false)}/>}</>;}

function PersonaEditor({accountId,initial,providers,busyRequest}:{accountId:string;initial:ParlorPersona;providers:EvaState["providers"];busyRequest:boolean}) {
  const {english}=useLocale(),t=(en:string,zh:string)=>english?en:zh;
  const [persona,setPersona]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const binding=persona.providerId&&persona.modelId?JSON.stringify([persona.providerId,persona.modelId]):"";
  const availableBindings=providers.filter(p=>p.enabled).flatMap(p=>p.models.map(m=>({key:JSON.stringify([p.id,m.id]),name:`${p.name} · ${m.name}`})));
  return <form className={styles.personaForm} data-no-translate onSubmit={async event=>{event.preventDefault();setBusy(true);setError("");try{await evaCall(accountId,"ai.savePersona",{persona});window.dispatchEvent(new CustomEvent("evaorbit:ai",{detail:{accountId,eventType:"configuration"}}));showActionToast(t("Persona saved on this device","人格已保存到本机"));}catch(reason){setError(reason instanceof Error?reason.message:String(reason));}finally{setBusy(false);}}}>
    <div className={styles.personaProfile}><span className={styles.avatar} aria-hidden="true">S</span><div><h2>{persona.name}</h2><p>{persona.chineseName} · {persona.nickname}</p><small>{t("Personal Butler · Default persona","私人执事 · 默认人格")}</small></div></div>
    <p>{t("Calm, perceptive and quietly witty. A persona in Parlor, independent of its model.","从容、敏锐，偶尔有一点狡黠。Sebastian 是 Parlor 的一位人格，与模型独立。")}</p>
    {error&&<ParlorErrorNotice inline error={error}/>}
    {busyRequest&&<p>{t("Finish the active response before saving persona changes.","请等待当前回答结束，再保存人格修改。")}</p>}
    <fieldset disabled={busy||busyRequest} className={styles.fields}>
      <label className="field"><span>{t("Name","名称")}</span><input value={persona.name} required maxLength={80} onChange={e=>setPersona({...persona,name:e.target.value})}/></label>
      <label className="field"><span>{t("How to address you","如何称呼你")}</span><input value={persona.preferredAddress} maxLength={80} placeholder={t("A natural form of address","自然称呼，不使用固定敬称")} onChange={e=>setPersona({...persona,preferredAddress:e.target.value})}/></label>
      <div className={styles.preferences}>{([['humor',t("Humor","幽默程度"),[['none',t("None","克制")],['subtle',t("Subtle","一点冷幽默")],['playful',t("Playful","轻松诙谐")]]],['formality',t("Formality","正式程度"),[['casual',t("Casual","随意")],['natural',t("Natural","自然有礼")],['formal',t("Formal","正式")]]],['closeness',t("Closeness","亲近程度"),[['reserved',t("Reserved","保持分寸")],['warm',t("Warm","温暖熟悉")],['familiar',t("Familiar","亲近")]]]] as const).map(([field,label,options])=><label className="field" key={field}><span>{label}</span><select value={persona[field]} onChange={e=>setPersona({...persona,[field]:e.target.value})}>{options.map(([value,text])=><option value={value} key={value}>{text}</option>)}</select></label>)}</div>
      <label className="field"><span>{t("Default model","默认模型")}</span><select value={binding} onChange={e=>{const pair=e.target.value?JSON.parse(e.target.value) as [string,string]:undefined;setPersona({...persona,providerId:pair?.[0],modelId:pair?.[1]});}}><option value="">{t("Use the first available model","使用首个可用模型")}</option>{binding&&!availableBindings.some(m=>m.key===binding)&&<option value={binding} disabled>{t("Bound model unavailable — choose again","绑定模型不可用，请重新选择")}</option>}{availableBindings.map(m=><option key={m.key} value={m.key}>{m.name}</option>)}</select></label>
      <Disclosure title={t("Identity & system prompt","身份与系统提示词")}><label className="field"><span>{t("Persona prompt","人格提示词")}</span><textarea rows={12} value={persona.systemPrompt} required maxLength={16000} onChange={e=>setPersona({...persona,systemPrompt:e.target.value})}/></label></Disclosure>
      <p className={styles.caption}>{t("This version includes Sebastian only. New personas, private memory scopes and tool permissions will be added separately. Changing this profile does not rewrite past replies.","首期提供 Sebastian。新增人格、私有记忆范围及工具授权后续独立接入。修改此配置不会改写历史回答的署名。")}</p>
      <button type="submit" className="button primary">{busy?t("Saving…","保存中…"):t("Save persona","保存人格")}</button>
    </fieldset>
  </form>;
}
