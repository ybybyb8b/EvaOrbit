"use client";
import {useEffect,useState} from "react";
import {evaCall,evaIsBusy,type ConversationContextState,type EvaState} from "@/lib/native-eva";
import {useNativeEva} from "./native-eva-context";
import {useLocale} from "./locale-controller";
import {ParlorErrorNotice} from "./parlor-error-notice";
import {Disclosure} from "./disclosure";
import {showActionToast} from "./action-toast";
import styles from "./parlor-memory.module.css";

export function ParlorContext({accountId,state}:{accountId:string;state:EvaState}) {
  const {english}=useLocale(),t=(en:string,zh:string)=>english?en:zh,{contextSupported}=useNativeEva();
  const choices=state.conversations.filter(c=>c.ownership==="single"||c.ownership==="group"),[selected,setSelected]=useState(choices[0]?.id??"");
  const conversation=choices.find(c=>c.id===selected),group=state.groups?.find(g=>g.id===selected),persona=conversation?.personaId??group?.participants[0]?.id;
  if(!contextSupported)return <p>{t("Update Host to manage conversation context.","更新 Host 后管理会话上下文。")}</p>;
  return <div className={styles.workspace} data-parlor-context><p className={styles.intro}>{t("Context is selected to fit each model. Without a summary, recent complete turns are used. Original messages are always kept.","上下文按模型预算选取；没有摘要时使用近期完整轮次，原始消息始终保留。")}</p>
    <label className="field"><span>{t("Conversation","会话")}</span><select aria-label={t("Conversation","会话")} value={selected} onChange={e=>{if(window.confirm(t("Change conversation? Unsaved context edits will be discarded.","切换会话？尚未保存的上下文修改会丢失。")))setSelected(e.target.value);}}>{choices.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
    {persona&&conversation?<ContextEditor key={`${accountId}:${selected}`} accountId={accountId} conversationId={selected} personaId={persona} busyChat={evaIsBusy(state)} group={Boolean(group)}/>:<p>{t("Start a conversation or confirm its persona in Memory settings first.","请先开始会话，或在 Memory 设置中确认旧会话的人格。")}</p>}
  </div>;
}

function ContextEditor({accountId,conversationId,personaId,busyChat,group}:{accountId:string;conversationId:string;personaId:string;busyChat:boolean;group:boolean}) {
  const {english}=useLocale(),t=(en:string,zh:string)=>english?en:zh;
  const [state,setState]=useState<ConversationContextState|null>(null),[version,setVersion]=useState(0),[content,setContent]=useState(""),[unresolved,setUnresolved]=useState(""),[through,setThrough]=useState(""),[recent,setRecent]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState("");
  function adopt(value:ConversationContextState){const latest=value.versions[0];setState(value);setVersion(latest?.version??0);setContent(latest?.content??"");setUnresolved(latest?.unresolved.join("\n")??"");setRecent(latest?.recentMessageLimit??0);setThrough(latest?.throughMessageId??value.page.messages.filter(m=>m.status!=="streaming").at(-1)?.id??"");}
  useEffect(()=>{let active=true;void evaCall<ConversationContextState>(accountId,"ai.contextGet",{conversationId,personaId}).then(value=>{if(active)adopt(value);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[accountId,conversationId,personaId]);
  const current=state?.versions.find(v=>v.version===version),historical=Boolean(state?.versions[0]&&version!==state.versions[0].version);
  async function save(){
    setBusy(true);setError("");try{
      const topics=unresolved.split("\n").map(s=>s.trim()).filter(Boolean);
      if(topics.length>32||topics.some(s=>new TextEncoder().encode(s).length>1000))throw new Error(t("Keep at most 32 concise unresolved items; split long items.","最多保留 32 项未解决事项，过长内容请拆分。"));
      await evaCall(accountId,"ai.contextSave",{conversationId,personaId,content,unresolved:topics,throughMessageId:content?through:undefined,recentMessageLimit:recent,expectedVersion:state?.versions[0]?.version??0});
      adopt(await evaCall<ConversationContextState>(accountId,"ai.contextGet",{conversationId,personaId}));showActionToast(t("Context saved on this device","上下文已保存到本机"));
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }
  return <form className={styles.editor} onSubmit={e=>{e.preventDefault();void save();}}>
    <p className={styles.hint}>{group?t("This group’s summary and unresolved items are public to every participant.","这段群聊的摘要和未解决事项对所有参与人格可见。"):t("This context belongs to this conversation’s persona.","这些上下文只属于这段会话的人格。")}</p>
    {error&&<ParlorErrorNotice inline error={error}/>}
    {!state?<p role="status">{t("Reading local context…","正在读取本地上下文…")}</p>:<>
      {state.versions.length>0&&<label className="field"><span>{t("Summary version","摘要版本")}</span><select value={version} aria-label={t("Summary version","摘要版本")} disabled={busy} onChange={e=>{const value=state.versions.find(v=>v.version===Number(e.target.value));if(value){setVersion(value.version);setContent(value.content);setUnresolved(value.unresolved.join("\n"));setThrough(value.throughMessageId??"");setRecent(value.recentMessageLimit);}}}>{state.versions.map(v=><option key={v.version} value={v.version}>v{v.version} · {v.status==="active"?t("Active","当前"):v.status==="invalidated"?t("Source changed","来源已改变"):t("Superseded","已替代")}</option>)}</select></label>}
      {busyChat&&<p className={styles.hint}>{t("Finish or pause the response before saving context.","请在回答结束或暂停后保存上下文。")}</p>}
      <fieldset className={styles.fields} disabled={busy||busyChat||historical}>
        <label className="field"><span>{t("Conversation summary","会话摘要")}</span><textarea aria-label={t("Conversation summary","会话摘要")} rows={6} maxLength={8000} value={content} onChange={e=>setContent(e.target.value)}/></label>
        <label className="field"><span>{t("Covered through","摘要覆盖至")}</span><select aria-label={t("Covered through","摘要覆盖至")} value={through} required={Boolean(content)} onChange={e=>setThrough(e.target.value)}><option value="">{t("No messages covered","未覆盖消息")}</option>{through&&!state.page.messages.some(m=>m.id===through)&&<option value={through}>{t("Previously saved message boundary","原摘要消息水位")}</option>}{state.page.messages.filter(m=>m.status!=="streaming").map(m=><option key={m.id} value={m.id}>{m.role==="user"?t("You","你"):m.personaName??"Assistant"} · {m.content.slice(0,55)}</option>)}</select><small>{t("Choose the end of a complete turn. A stale range is refused.","选择完整轮次的结尾。来源改变后，旧摘要不会继续使用。")}</small></label>
        <label className="field"><span>{t("Unresolved topics & tasks","未解决话题与待办")}</span><textarea aria-label={t("Unresolved topics & tasks","未解决话题与待办")} rows={4} maxLength={8000} placeholder={t("One item per line","每行一项")} value={unresolved} onChange={e=>setUnresolved(e.target.value)}/></label>
        <label className="field"><span>{t("Recent message limit (0 = automatic)","近期消息上限（0 为自动预算）")}</span><input type="number" min={0} max={5000} step={1} value={recent} onChange={e=>setRecent(Number(e.target.value))}/><small>{t("Turns stay complete; the model budget always takes precedence.","始终按完整轮次选取，模型预算优先。")}</small></label>
        <button type="submit" className="button primary">{busy?t("Saving…","正在保存…"):t("Save context version","保存上下文版本")}</button>
      </fieldset>
      <p className={styles.hint}>{t("Saving here makes no model request. Automatic summary generation is not enabled.","这里的保存不会调用模型，自动生成摘要尚未启用。")}</p>
      {current&&<Disclosure title={t("Version & coverage","版本与覆盖")}><div className={styles.fields}><p className={styles.hint}>{t("Original messages covered","覆盖的原始消息")} · {current.sourceCount}</p><p className={styles.hint}>{t("Updated","更新于")} {new Date(current.updatedAt).toLocaleString(english?"en-GB":"zh-CN")}</p><p className={styles.hint}>{t("Content hash","内容 Hash")}<br/><code style={{overflowWrap:"anywhere"}}>{current.contentHash}</code></p></div></Disclosure>}
      <button type="button" className="text-button" disabled={busy} onClick={()=>{if(!window.confirm(t("Reload and discard unsaved changes?","重新读取并放弃未保存的修改？")))return;void evaCall<ConversationContextState>(accountId,"ai.contextGet",{conversationId,personaId}).then(adopt).catch(e=>setError(e.message));}}>{t("Reload saved context","重新读取已保存上下文")}</button>
    </>}
  </form>;
}
