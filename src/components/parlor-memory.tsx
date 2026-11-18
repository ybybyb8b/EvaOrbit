"use client";

import {useEffect,useRef,useState} from "react";
import {evaCall,evaIsBusy,type EvaConversation,type EvaMessage,type EvaState,type PersonaMemory,type PersonaMemoryKind,type PersonaMemoryNature,type PersonaMemorySource} from "@/lib/native-eva";
import {useLocale} from "./locale-controller";
import {useNativeEva} from "./native-eva-context";
import {ParlorErrorNotice} from "./parlor-error-notice";
import {ParlorEcho,EchoShareForm} from "./parlor-echo";
import {ParlorMemoryProcessing} from "./parlor-memory-processing";
import {Disclosure} from "./disclosure";
import {showActionToast} from "./action-toast";
import styles from "./parlor-memory.module.css";

const kinds: [PersonaMemoryKind,string,string][]=[
  ["experience","Experiences","经历"],["understanding","Understanding","理解"],["observation","Observations","观察"],["commitment","Commitments","承诺"],["ongoingTopic","Ongoing topics","持续话题"],
];
const natures: [PersonaMemoryNature,string,string][]=[
  ["userStatement","User statement","用户陈述"],["sharedExperience","Shared experience","共同经历"],["personaObservation","Persona observation","人格观察"],["promise","Promise","承诺"],
];
const notify=(accountId:string)=>window.dispatchEvent(new CustomEvent("evaorbit:ai",{detail:{accountId,eventType:"configuration"}}));

export function ParlorMemory({accountId,state,onConversation}:{accountId:string;state:EvaState;onConversation?:(id:string)=>void}) {
  const {english}=useLocale(),t=(en:string,zh:string)=>english?en:zh;
  const {memorySupported,contextSupported,memoryProcessingSupported}=useNativeEva();
  const personas=state.personas??[state.persona];
  const [persona,setPersona]=useState(state.persona.id),[locked,setLocked]=useState(false);
  if(!memorySupported)return <p>{t("Update Host to manage local persona memories.","更新 Host 后管理本地人格记忆。")}</p>;
  return <div className={styles.workspace} data-parlor-memory>
    <p className={styles.intro}>{contextSupported?t("A private notebook for each persona. Saved on this device; relevant memories can be included in conversations.","每个人格都有独立的记忆簿。保存在本机，聊天时会按相关性使用记忆。"):t("A private notebook saved on this device. Update Host to use it in conversations.","独立记忆簿保存在本机，更新 Host 后可在聊天中使用。")}</p>
    <label className="field"><span>{t("Persona","人格")}</span><select aria-label={t("Persona","人格")} value={persona} disabled={locked} onChange={e=>setPersona(e.target.value)}>{personas.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <ParlorEcho key={`echo:${accountId}:${persona}`} accountId={accountId} personaId={persona} state={state} onConversation={onConversation}/>
    <ParlorMemoryProcessing key={`processing:${accountId}:${persona}`} accountId={accountId} personaId={persona} state={state}/>
    {memoryProcessingSupported&&<h2 className={styles.subheading}>{t("Saved memories","已保存记忆")}</h2>}
    <MemoryNotebook state={state} key={`${accountId}:${persona}`} accountId={accountId} personaId={persona} busyChat={evaIsBusy(state)} onLock={setLocked} onConversation={onConversation}/>
    {Boolean(state.unassignedConversations?.length)&&<Disclosure title={t("Conversations awaiting a persona","待确认人格的旧会话")}>
      <p className={styles.hint}>{t("Only conversations with a complete, unique persona identity were assigned automatically. Review the history before assigning all of a conversation to the selected persona.","仅人格证据完整且唯一的会话已自动归属。请先查看历史，再将整段会话归属给当前所选人格。")}</p>
      {state.unassignedConversations?.map(c=><UnassignedConversation key={c.id} accountId={accountId} conversation={c} personaId={persona} disabled={locked||evaIsBusy(state)} onConversation={onConversation}/>)}
    </Disclosure>}
  </div>;
}

function UnassignedConversation({accountId,conversation,personaId,disabled,onConversation}:{accountId:string;conversation:EvaConversation;personaId:string;disabled:boolean;onConversation?: (id:string)=>void}) {
  const {english}=useLocale(),t=(en:string,zh:string)=>english?en:zh;
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  return <div className={styles.unassigned}><strong>{conversation.title}</strong><div className={styles.actions}>
    {onConversation&&<button type="button" className="text-button" onClick={()=>onConversation(conversation.id)}>{t("View conversation","查看会话")}</button>}
    <button type="button" className="text-button" disabled={disabled||busy} onClick={async()=>{
      if(!window.confirm(t("Assign this entire conversation to the selected persona? Original messages will be kept.","将整段会话归属给当前所选人格？原始消息会保留。")))return;
      setBusy(true);setError("");try{await evaCall(accountId,"ai.assignConversationPersona",{conversationId:conversation.id,personaId});notify(accountId);showActionToast(t("Persona assigned","已确认会话人格"));}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
    }}>{t("Assign to selected persona","归属给所选人格")}</button>
    </div>{error&&<ParlorErrorNotice inline error={error}/>}</div>;
}

function MemoryNotebook({accountId,personaId,busyChat,onLock,onConversation,state}:{state:EvaState;accountId:string;personaId:string;busyChat:boolean;onLock:(value:boolean)=>void;onConversation?:(id:string)=>void}) {
  const {english}=useLocale(),t=(en:string,zh:string)=>english?en:zh;
  const {contextSupported,echoSupported}=useNativeEva();
  const [sharing,setSharing]=useState(false);
  const [kind,setKind]=useState<PersonaMemoryKind|"">(""),[items,setItems]=useState<PersonaMemory[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [draft,setDraft]=useState<PersonaMemory|null>(null),[versions,setVersions]=useState<PersonaMemory[]>([]),[revision,setRevision]=useState(0);
  const alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{const changed=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail?.accountId===accountId&&["memory","configuration"].includes(detail.eventType))setRevision(v=>v+1);};window.addEventListener("evaorbit:ai",changed);return()=>window.removeEventListener("evaorbit:ai",changed);},[accountId]);
  const editing=draft!==null;
  useEffect(()=>{onLock(busy||editing);return()=>onLock(false);},[busy,editing,onLock]);
  useEffect(()=>{
    let active=true;
    void evaCall<PersonaMemory[]>(accountId,"ai.memoryList",{personaId,...(kind?{kind}:{})}).then(result=>{if(active)setItems(result);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[accountId,personaId,kind,revision]);
  async function open(id:string){
    setBusy(true);setError("");try{const result=await evaCall<PersonaMemory[]>(accountId,"ai.memoryDetail",{personaId,id});if(!alive.current)return;if(!result.length||result[0].status!=="active")throw new Error(t("Memory no longer available. Refresh the list.","记忆已不可用，请刷新列表。"));setVersions(result);setDraft(result[0]);}catch(e){if(alive.current)setError(e instanceof Error?e.message:String(e));}finally{if(alive.current)setBusy(false);}
  }
  async function save(){
    if(!draft)return;setBusy(true);setError("");
    try{await evaCall(accountId,"ai.memorySave",{personaId,memory:{...draft,version:Math.max(1,draft.version)},expectedVersion:draft.version});if(!alive.current)return;setDraft(null);setVersions([]);setLoading(true);setRevision(v=>v+1);showActionToast(t("Memory saved on this device","记忆已保存到本机"));}catch(e){if(alive.current)setError(e instanceof Error?e.message:String(e));}finally{if(alive.current)setBusy(false);}
  }
  async function remove(){
    if(!draft||!window.confirm(t("Delete this memory and erase the content and evidence in every version? Exported backup files outside the App are not changed.","删除这条记忆，并清除所有版本的正文与证据？已导出到 App 外的备份文件不会改变。")))return;
    setBusy(true);setError("");try{await evaCall(accountId,"ai.memoryDelete",{personaId,id:draft.id,expectedVersion:draft.version});if(!alive.current)return;setDraft(null);setVersions([]);setLoading(true);setRevision(v=>v+1);showActionToast(t("Memory deleted","记忆已删除"));}catch(e){if(alive.current)setError(e instanceof Error?e.message:String(e));}finally{if(alive.current)setBusy(false);}
  }
  return <>
    {error&&<ParlorErrorNotice inline error={error}/>}
    {busyChat&&<p className={styles.hint}>{t("You can browse while chatting. Stop the response before changing memories.","聊天时可以浏览记忆；修改前请先停止回答。")}</p>}
    {draft?<form className={styles.editor} data-memory-editor onSubmit={e=>{e.preventDefault();void save();}}>
      <div className={styles.editorHeading}><h2>{draft.version?t("Memory details","记忆详情"):t("New memory","新增记忆")}</h2><button type="button" className="text-button" disabled={busy} onClick={()=>{if(!window.confirm(t("Leave without saving your changes?","放弃尚未保存的修改并返回？")))return;setDraft(null);setVersions([]);setError("");}}>{t("Back to memories","返回记忆列表")}</button></div>
      <fieldset disabled={busy||busyChat} className={styles.fields}>
        <div className={styles.filters}><label className="field"><span>{t("Memory type","记忆类型")}</span><select aria-label={t("Memory type","记忆类型")} value={draft.kind} onChange={e=>setDraft({...draft,kind:e.target.value as PersonaMemoryKind})}>{kinds.map(([key,en,zh])=><option key={key} value={key}>{t(en,zh)}</option>)}</select></label>
        <label className="field"><span>{t("Importance","重要程度")}</span><select aria-label={t("Importance","重要程度")} value={draft.importance} onChange={e=>setDraft({...draft,importance:Number(e.target.value)})}>{[1,2,3,4,5].map(v=><option key={v} value={v}>{v} · {v===1?t("Low","低"):v===2?t("Moderate","较低"):v===3?t("Normal","普通"):v===4?t("Important","重要"):t("Very important","非常重要")}</option>)}</select></label></div>
        <label className="field"><span>{t("Memory content","记忆正文")}</span><textarea aria-label={t("Memory content","记忆正文")} required rows={6} maxLength={8000} value={draft.content} onChange={e=>setDraft({...draft,content:e.target.value})}/></label>
        <label className="field"><span>{t("Nature of knowledge","认知性质")}</span><select aria-label={t("Nature of knowledge","认知性质")} value={draft.nature} onChange={e=>setDraft({...draft,nature:e.target.value as PersonaMemoryNature})}>{natures.map(([key,en,zh])=><option key={key} value={key}>{t(en,zh)}</option>)}</select></label>
        {contextSupported&&<label className={styles.visibility}><span>{t("Use only in single chats","仅在单聊使用")}<small>{t("Turn off to allow this persona to use it in groups.","关闭后，允许该人格在群聊中使用这条记忆。")}</small></span><input type="checkbox" role="switch" className="toggle-switch" aria-label={t("Use only in single chats","仅在单聊使用")} checked={draft.visibility!=="allChats"} onChange={e=>setDraft({...draft,visibility:e.target.checked?"singleChat":"allChats"})}/></label>}
        {draft.expiredAt&&<label className={styles.visibility}><span>{t("Expired — excluded from recall","已过期，不参与召回")}</span><input className="toggle-switch" role="switch" type="checkbox" checked onChange={()=>setDraft({...draft,expiredAt:undefined})}/></label>}
        {draft.provenance&&<p className={styles.hint}>{t("Extracted confidence","提取置信度")} · {Math.round(draft.provenance.confidence*100)}% · {draft.provenance.modelId}{draft.provenance.eventTime?` · ${draft.provenance.eventTime}`:""}</p>}
        <SourceEditor accountId={accountId} personaId={personaId} sources={draft.sources} onChange={sources=>setDraft({...draft,sources})} onConversation={onConversation}/>
        <div className={styles.actions}><button type="submit" className="button primary" disabled={!draft.content.trim()}>{busy?t("Saving…","正在保存…"):draft.version?t("Save replacement version","保存替代版本"):t("Save memory","保存记忆")}</button>{draft.version>0&&<button type="button" className="text-button" onClick={()=>void remove()}>{t("Delete memory","删除记忆")}</button>}</div>
      </fieldset>
      {echoSupported&&draft.version>0&&<><button type="button" className="button secondary" disabled={busy||busyChat||JSON.stringify(draft)!==JSON.stringify(versions[0])} onClick={()=>setSharing(true)}>{t("Share to Echo","分享到 Echo")}</button>{sharing&&<EchoShareForm accountId={accountId} personaId={personaId} state={state} onConversation={onConversation} memory={{id:draft.id,version:draft.version,content:draft.content}} onClose={()=>setSharing(false)}/>}</>}
      {versions.length>0&&<Disclosure title={t("Versions & provenance","版本与来源")}>
        <p className={styles.hint}>{t("Edits create a new version and supersede the previous one.","每次编辑都会创建新版本，原版本标为已替代。")}</p>
        {versions.map(v=><article key={v.version} className={styles.version}><strong>v{v.version} · {v.status==="active"?t("Active","当前版本"):t("Superseded","已替代")}</strong><time dateTime={v.updatedAt}>{new Date(v.updatedAt).toLocaleString(english?"en-GB":"zh-CN")}</time><p>{v.content}</p><SourceList sources={v.sources} onConversation={onConversation}/></article>)}
      </Disclosure>}
    </form>:<>
      <div className={styles.toolbar}><label className="field"><span>{t("Filter by type","按类型筛选")}</span><select aria-label={t("Filter by type","按类型筛选")} value={kind} disabled={busy} onChange={e=>{setLoading(true);setError("");setKind(e.target.value as PersonaMemoryKind|"");}}><option value="">{t("All types","全部类型")}</option>{kinds.map(([key,en,zh])=><option key={key} value={key}>{t(en,zh)}</option>)}</select></label>
        <button type="button" className="button primary" disabled={busy||busyChat} onClick={()=>{const now=new Date().toISOString();setError("");setVersions([]);setDraft({id:crypto.randomUUID(),accountId,personaId,kind:kind||"experience",content:"",importance:3,nature:"userStatement",sources:[],createdAt:now,updatedAt:now,version:0,status:"active"});}}>{t("Add memory","新增记忆")}</button></div>
      {loading?<p role="status">{t("Reading local memories…","正在读取本地记忆…")}</p>:items.length?<div className={styles.list}>{items.map(item=><button type="button" key={item.id} className={styles.entry} disabled={busy} onClick={()=>void open(item.id)}><span className={styles.entryMeta}>{t(...(kinds.find(k=>k[0]===item.kind)?.slice(1) as [string,string]??[item.kind,item.kind]))} · v{item.version} · {t("Importance","重要程度")} {item.importance}{item.expiredAt?` · ${t("Expired","已过期")}`:""}</span><span className={styles.entryContent}>{item.content}</span><time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleDateString(english?"en-GB":"zh-CN")}</time></button>)}</div>:<div className={styles.empty}><h2>{t("A notebook of your own","独属于这个人格的记忆簿")}</h2><p>{t("Save an experience, an observation or a promise worth keeping. Adding a memory does not call a model.","保存值得留住的经历、观察或承诺。手动记忆不会调用模型。")}</p></div>}
      <button type="button" className="text-button" disabled={busy||loading} onClick={()=>{setLoading(true);setError("");setRevision(v=>v+1);}}>{t("Refresh memories","刷新记忆")}</button>
    </>}
  </>;
}

function SourceList({sources,onConversation}:{sources:PersonaMemorySource[];onConversation?:(id:string)=>void}) {
  const {english}=useLocale(),t=(en:string,zh:string)=>english?en:zh;
  return sources.length?<div className={styles.sources}>{sources.map((source,i)=><div key={i}><blockquote>{source.excerpt}</blockquote>{onConversation&&<button type="button" className="text-button" onClick={()=>onConversation(source.conversationId)}>{t("Open source conversation","查看来源会话")}</button>}</div>)}</div>:<p className={styles.hint}>{t("Manually recorded; no conversation linked.","手动记录，未关联会话。")}</p>;
}

function SourceEditor({accountId,personaId,sources,onChange,onConversation}:{accountId:string;personaId:string;sources:PersonaMemorySource[];onChange:(sources:PersonaMemorySource[])=>void;onConversation?:(id:string)=>void}) {
  const {english}=useLocale(),t=(en:string,zh:string)=>english?en:zh;
  const [conversations,setConversations]=useState<EvaConversation[]>([]),[conversation,setConversation]=useState(""),[messages,setMessages]=useState<EvaMessage[]>([]),[message,setMessage]=useState(""),[excerpt,setExcerpt]=useState(""),[error,setError]=useState(""),[loading,setLoading]=useState(false);
  useEffect(()=>{let active=true;void evaCall<EvaConversation[]>(accountId,"ai.memorySources",{personaId}).then(v=>{if(active)setConversations(v);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[accountId,personaId]);
  useEffect(()=>{let active=true;if(conversation){void evaCall<EvaMessage[]>(accountId,"ai.memorySources",{personaId,conversationId:conversation}).then(v=>{if(active)setMessages(v.filter(m=>m.content));}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});}return()=>{active=false;};},[accountId,personaId,conversation]);
  const selected=messages.find(m=>m.id===message),valid=Boolean(selected&&excerpt.trim()&&selected.content.includes(excerpt));
  return <Disclosure title={t("Sources (optional)","来源（可选）")}>
    <SourceList sources={sources} onConversation={onConversation}/>
    {sources.map((_,i)=><button type="button" className="text-button" key={i} onClick={()=>onChange(sources.filter((_,index)=>index!==i))}>{t("Remove source","移除来源")} {i+1}</button>)}
    {error&&<ParlorErrorNotice inline error={error}/>}
    <div className={styles.fields}><label className="field"><span>{t("Source conversation","来源会话")}</span><select aria-label={t("Source conversation","来源会话")} value={conversation} onChange={e=>{setError("");setMessages([]);setMessage("");setExcerpt("");setLoading(Boolean(e.target.value));setConversation(e.target.value);}}><option value="">{t("Choose a conversation","选择会话")}</option>{conversations.map(c=><option value={c.id} key={c.id}>{c.title}</option>)}</select></label>
    {loading&&<p role="status">{t("Reading source messages…","正在读取来源消息…")}</p>}
    {conversation&&!loading&&<><label className="field"><span>{t("Source message","来源消息")}</span><select aria-label={t("Source message","来源消息")} value={message} onChange={e=>{setMessage(e.target.value);setExcerpt(messages.find(m=>m.id===e.target.value)?.content.slice(0,2000)??"");}}><option value="">{t("Choose a message","选择消息")}</option>{messages.map(m=><option key={m.id} value={m.id}>{m.role==="user"?t("You","你"):m.personaName??"Assistant"} · {m.content.slice(0,65)}</option>)}</select></label>
      {message&&<label className="field"><span>{t("Original excerpt","原始摘录")}</span><textarea aria-label={t("Original excerpt","原始摘录")} rows={3} maxLength={2000} value={excerpt} onChange={e=>setExcerpt(e.target.value)}/><small>{valid?t("The excerpt matches the original message.","摘录与原始消息一致。"):t("Keep an exact excerpt from the selected message.","请保留所选消息中的原文摘录。")}</small></label>}
      <button type="button" className="button secondary" disabled={!valid||sources.length>=20} onClick={()=>{if(sources.some(s=>s.messageId===message&&s.excerpt===excerpt))return;onChange([...sources,{conversationId:conversation,messageId:message,excerpt}]);setConversation("");setMessages([]);setMessage("");setExcerpt("");}}>{t("Attach source","关联来源")}</button></>}
    </div>
  </Disclosure>;
}

export function ParlorBackup({accountId,state}:{accountId:string;state:EvaState}) {
  const {english}=useLocale(),t=(en:string,zh:string)=>english?en:zh;
  const {memorySupported}=useNativeEva();
  const input=useRef<HTMLInputElement>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
  if(!memorySupported)return null;
  async function exportData(){
    setBusy(true);setError("");try{await evaCall(accountId,"ai.exportBackup",{share:true});showActionToast(t("Backup share sheet opened","已打开备份分享面板"));}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }
  return <div className={styles.backup} data-parlor-backup><h2>{t("Parlor backup","Parlor 独立备份")}</h2><p className={styles.hint}>{t("Includes this account’s personas, chats, memory versions and sources. Credentials are excluded. Restoring replaces this account’s Parlor data and disables providers until reconnected.","包含当前账户的人格、聊天、记忆版本及来源，不含凭据。恢复会替换当前账户的 Parlor 数据，并停用服务商，重新连接后可用。")}</p>
    {error&&<ParlorErrorNotice inline error={error}/>}<div className={styles.actions}>
      <button type="button" className="button secondary" disabled={busy||evaIsBusy(state)} onClick={()=>void exportData()}>{busy?t("Working…","正在处理…"):t("Export Parlor backup","导出 Parlor 备份")}</button>
      <button type="button" className="text-button" disabled={busy||evaIsBusy(state)} onClick={()=>input.current?.click()}>{t("Restore from file","从文件恢复")}</button>
    </div><input type="file" accept="application/json,.json" hidden ref={input} aria-label={t("Parlor backup file","Parlor 备份文件")} onChange={async e=>{
      const file=e.currentTarget.files?.[0];e.currentTarget.value="";if(!file)return;
      setError("");setBusy(true);try{if(file.size>16*1024*1024)throw new Error(t("Backup exceeds the 16 MiB limit.","备份超过 16 MiB 上限。"));const document=JSON.parse(await file.text());if(document?.format!=="parlor-native-backup"||document?.payload?.accountId!==accountId)throw new Error(t("Choose a Parlor backup belonging to this account.","请选择属于当前账户的 Parlor 备份。"));if(!window.confirm(t("Replace all Parlor data for this account with this backup? API keys must be entered again. Other accounts are preserved.","用此备份替换当前账户的全部 Parlor 数据？API Key 需要重新输入，其他账户不受影响。")))return;await evaCall(accountId,"ai.restoreBackup",{document,confirmReplace:true});notify(accountId);showActionToast(t("Parlor backup restored","Parlor 备份已恢复"));}catch(reason){setError(reason instanceof Error?reason.message:String(reason));}finally{setBusy(false);}
    }}/></div>;
}
