"use client";
import {useCallback,useEffect,useLayoutEffect,useRef,useState,type ReactNode} from "react";
import {acceptEvaEvent,evaCall,nativeEvaEvent,sebastianIdentity,type EvaMessage,type EvaState} from "@/lib/native-eva";
import {useLocale} from "./locale-controller";
import {Icon} from "./icons";
import {FormSheet} from "./form-sheet";
import {ParlorMessageBody} from "./parlor-message";
import {ParlorErrorNotice} from "./parlor-error-notice";
import {useParlorAppearance} from "./parlor-appearance-sheet";
import {ChatComposer} from "./chat-composer";
import {useChatViewport} from "./use-chat-viewport";
import parlor from "./parlor.module.css";
import styles from "./parlor-chat.module.css";
const emptyMessages:EvaMessage[]=[];

export function NativeEvaChat({accountId,back,initialConversationId,onSettings}:{accountId:string;back:ReactNode;initialConversationId?:string;onSettings:(section?:string)=>void}) {
  const {english}=useLocale(),t=(en:string,zh:string)=>english?en:zh;
  const [conversation,setConversation]=useState(()=>initialConversationId??localStorage.getItem(`eo:eva:last:${accountId}`)??crypto.randomUUID());
  const [state,setState]=useState<EvaState|null>(null),[draft,setDraft]=useState(""),[error,setError]=useState("");
  const [submitting,setSubmitting]=useState(false),[stopping,setStopping]=useState(false),[history,setHistory]=useState(false),[personaOpen,setPersonaOpen]=useState(false),[usageId,setUsageId]=useState<string|null>(null);
  const [away,setAway]=useState(false);
  const [firstVisit]=useState(()=>!localStorage.getItem(`eo:parlor:introduced:${accountId}`));
  const persona=state?.persona??sebastianIdentity;
  const appearance=useParlorAppearance(accountId);
  const container=useRef<HTMLElement>(null),input=useRef<HTMLTextAreaElement>(null),scroll=useRef<HTMLDivElement>(null),followBottom=useRef(true);
  const identity=useRef<{id:string;conversation:string;content:string;choice:string}|null>(null),sendLock=useRef(false);
  const generation=useRef(0),currentConversation=useRef(conversation),refreshQueued=useRef(false);
  const messages=state?.messages??emptyMessages,running=messages.find(m=>m.status==="streaming");
  useChatViewport(container,input,scroll,followBottom);
  const refresh=useCallback(async()=>{
    const target=conversation,version=generation.current;
    const value=await evaCall<EvaState>(accountId,"ai.getState",{conversationId:target});
    if(version!==generation.current||currentConversation.current!==target)return value;
    setState(current=>({...value,messages:value.messages.map(m=>{const old=current?.messages.find(x=>x.id===m.id);return old&&old.seq>m.seq?old:m;})}));
    return value;
  },[accountId,conversation]);
  useEffect(()=>{
    let alive=true,timer:ReturnType<typeof setTimeout>|undefined;
    generation.current+=1;currentConversation.current=conversation;
    localStorage.setItem(`eo:eva:last:${accountId}`,conversation);
    localStorage.setItem(`eo:parlor:introduced:${accountId}`,"1");
    const load=()=>void refresh().catch(reason=>{if(alive)setError(reason.message);});
    const schedule=()=>{if(refreshQueued.current)return;refreshQueued.current=true;timer=setTimeout(()=>{refreshQueued.current=false;if(alive)load();},60);};
    const receive=(event:Event)=>{
      const detail=(event as CustomEvent).detail;
      if(detail?.accountId!==accountId)return;
      if(detail.eventType==="configuration"){schedule();return;}
      if(detail.conversationId!==conversation){if(detail.eventType==="terminal"||detail.seq===1)schedule();return;}
      setState(current=>{if(!current)return current;const next=acceptEvaEvent(detail,accountId,conversation,current.messages);return next?{...current,messages:next}:current;});
      // Reconcile terminal / initial events and gaps from remounts against durable state.
      if(detail.seq===1||detail.eventType==="terminal")schedule();
    };
    load();window.addEventListener(nativeEvaEvent,receive);window.addEventListener("evaorbit:native-active",load);window.addEventListener("focus",load);
    return()=>{alive=false;generation.current+=1;clearTimeout(timer);refreshQueued.current=false;window.removeEventListener(nativeEvaEvent,receive);window.removeEventListener("evaorbit:native-active",load);window.removeEventListener("focus",load);};
  },[accountId,conversation,refresh]);
  useLayoutEffect(()=>{if(followBottom.current&&scroll.current)scroll.current.scrollTop=scroll.current.scrollHeight;},[messages,conversation,appearance.segmentReplies]);
  useLayoutEffect(()=>{const element=input.current;if(element){element.style.height="auto";element.style.height=`${Math.min(element.scrollHeight,160)}px`;}},[draft]);
  const models=state?.providers.filter(p=>p.enabled).flatMap(p=>p.models.map(m=>({provider:p,model:m,key:JSON.stringify([p.id,m.id])})))??[];
  const boundModel=Boolean(state?.persona?.providerId&&state?.persona?.modelId);
  const selected=boundModel?models.find(m=>m.provider.id===state?.persona?.providerId&&m.model.id===state?.persona?.modelId):models[0];
  const inspected=messages.find(m=>m.id===usageId);
  function select(id?:string){generation.current+=1;const next=id??crypto.randomUUID();currentConversation.current=next;setConversation(next);setState(null);setHistory(false);setDraft("");setError("");identity.current=null;followBottom.current=true;}
  async function send(){
    if(sendLock.current||running||!draft.trim()||!selected)return;
    sendLock.current=true;setSubmitting(true);setError("");
    const content=draft.trim(),target=conversation;
    const previous=identity.current;
    const submission=previous?.content===content&&previous.conversation===target&&previous.choice===selected.key?previous:{id:crypto.randomUUID(),conversation:target,content,choice:selected.key};
    identity.current=submission;
    try{
      await evaCall(accountId,"ai.send",{conversationId:target,requestId:submission.id,providerId:selected.provider.id,modelId:selected.model.id,personaId:persona.id,content});
      setDraft("");identity.current=null;followBottom.current=true;await refresh();
    }catch(reason){
      setError(reason instanceof Error?reason.message:String(reason));
      // Only read after uncertain delivery. Never repeat a possibly billed model call automatically.
      try{const saved=await refresh();if(saved.messages.some(m=>m.requestId===submission.id)){setDraft("");identity.current=null;}}catch{/* Keep text and the stable submission ID for a user-initiated retry. */}
    }finally{setSubmitting(false);sendLock.current=false;}
  }
  async function stop(){if(!running||stopping)return;setStopping(true);try{await evaCall(accountId,"ai.cancel",{requestId:running.requestId});await refresh();}catch(reason){setError(reason instanceof Error?reason.message:String(reason));}finally{setStopping(false);}}
  return <>
    {appearance.images.wallpaper&&<div className={styles.wallpaper} data-parlor-wallpaper aria-hidden="true" style={{backgroundImage:`url("${appearance.images.wallpaper}")`}}/>}
    <section ref={container} className={styles.chat} data-parlor-chat data-native-eva-chat data-wallpaper={Boolean(appearance.images.wallpaper)||undefined} aria-label="Parlor">
      <header className={styles.header}><div className={styles.back}>{back}</div><div className={styles.identity}>
        <button className={parlor.personaTrigger} onClick={()=>setPersonaOpen(true)} aria-label={t("Switch persona","切换人格")} aria-haspopup="dialog">
          {appearance.images.assistant?(
            // eslint-disable-next-line @next/next/no-img-element -- Device-local persona avatar.
            <img className={parlor.avatarImage} src={appearance.images.assistant} alt=""/>
          ):<span className={parlor.avatar} aria-hidden="true">{persona.name.charAt(0)}</span>}
          <div><h1 data-no-translate>{persona.name}</h1><span className={parlor.roomLabel}>Parlor</span></div><Icon name="chevronDown"/>
        </button></div>
        <nav aria-label={t("Conversation actions","对话操作")}><button aria-label={t("Conversation history","历史对话")} onClick={()=>setHistory(true)}><Icon name="history"/></button><button disabled={submitting} aria-label={t("New conversation","新对话")} onClick={()=>select()}><Icon name="plus"/></button><button aria-label={t("Parlor settings","Parlor 设置")} onClick={()=>onSettings()}><Icon name="settings"/></button></nav>
      </header>
      <div ref={scroll} className={styles.scroll} onScroll={()=>{const pane=scroll.current;if(pane){followBottom.current=pane.scrollHeight-pane.scrollTop-pane.clientHeight<48;setAway(!followBottom.current);}}}>
        {!state&&!error&&<p className={styles.activity} role="status">{t("Opening conversation…","正在打开对话…")}</p>}
        {state&&!messages.length&&<div className={parlor.welcome}><span className={parlor.avatar} aria-hidden="true">{persona.name.charAt(0)}</span><h2>{firstVisit?t("Welcome to Parlor","欢迎来到 Parlor"):t("At your service.","今天，有什么需要打点？")}</h2><p>{firstVisit?t(`A pleasure to meet you. I’m ${persona.name}. Whenever something needs attending to, simply ask.`,`初次见面，我是 ${persona.name}。今后有什么需要打点的事，尽管交给我。`):t("What would you like me to take care of today?","今天有什么需要我处理的吗？")}</p>{!selected?.provider.hasKey&&<button className="text-button" onClick={()=>onSettings("providers")}>{t("Connect a model to begin","先连接一个模型")}</button>}</div>}
        <div className={styles.messages}>{messages.map((message,index)=>{
          const tail=messages[index+1]?.role!==message.role,avatar=appearance.images[message.role];
          return <article className={styles.message} data-role={message.role} data-group-end={tail} data-avatar={Boolean(avatar)} key={message.id}>
            {avatar&&tail&&(
              // eslint-disable-next-line @next/next/no-img-element -- Device-local resized avatar.
              <img className={styles.messageAvatar} src={avatar} alt="" width={28} height={28}/>
            )}
            <ParlorMessageBody message={message} showTail={tail} segmentReplies={appearance.segmentReplies}/>
            {message.role==="user"?<footer><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString(english?"en-US":"zh-CN",{hour:"2-digit",minute:"2-digit"})}</time></footer>:<>
              <button className={parlor.meta} onClick={()=>setUsageId(message.id)} aria-label={t("Response usage details","回答用量详情")}>
                <span>{message.model?.name??t("Unknown model","模型未知")}</span><span aria-hidden="true">·</span>
                <span>{message.usage?.inputTokens!==undefined&&message.usage.outputTokens!==undefined?`${(message.usage.inputTokens+message.usage.outputTokens).toLocaleString(english?"en-US":"zh-CN")} tokens`:t("Usage unknown","用量未知")}</span><span aria-hidden="true">·</span>
                <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString(english?"en-US":"zh-CN",{hour:"2-digit",minute:"2-digit"})}</time>
              </button>
              {message.status!=="done"&&<div className={parlor.status} role="status">{message.status==="streaming"?t("Responding…","回复中…"):message.status==="cancelled"?t("Stopped · partial text kept","已停止 · 已保留部分内容"):message.status==="interrupted"?t("Interrupted · partial text kept","已中断 · 已保留部分内容"):t("Response failed","回答未完成")}</div>}
            </>}
            {message.error&&<ParlorErrorNotice inline error={message.error}/>} 
          </article>;
        })}</div>
      </div>
      <div className={styles.composerArea}>
        {state&&boundModel&&!selected&&<div className={styles.notice}><button className="text-button" onClick={()=>onSettings("personas")}>{t("The default model is unavailable. Choose it again in Persona settings.","默认模型不可用，请重新选择默认模型。")}</button></div>}
        {state?.active&&state.active.conversationId!==conversation&&<div className={styles.notice}><button className="text-button" onClick={()=>select(state.active!.conversationId)}>{t("Open the active conversation","打开正在回答的对话")}</button></div>}
        {away&&<button className={styles.latestButton} onClick={()=>{followBottom.current=true;setAway(false);scroll.current?.scrollTo({top:scroll.current.scrollHeight});}}><Icon name="chevronDown"/>{t("Back to latest","回到最新")}</button>}
        {error&&<div className={styles.notice}><ParlorErrorNotice error={error}/><button className="text-button" onClick={()=>void refresh().then(()=>setError("")).catch(reason=>setError(reason.message))}>{t("Reload saved state","重新读取已保存状态")}</button><button className="text-button" onClick={()=>setError("")}>{t("Dismiss","关闭")}</button></div>}
        <ChatComposer inputRef={input} draft={draft} english={english} placeholder={t("Say something…","说点什么……")} disabled={submitting||!state} stop={Boolean(running)} stopLabel={stopping?t("Stopping…","正在停止…"):t("Stop response","停止生成")} buttonDisabled={running?stopping:submitting||!draft.trim()||!selected?.provider.hasKey||!state} onDraftChange={setDraft} onSend={()=>void send()} onStop={()=>void stop()}/>
      </div>
      {history&&<FormSheet title={t("Conversations on this device","本机历史对话")} onClose={()=>setHistory(false)}><div className={styles.history}>{state?.conversations.map(c=><div key={c.id}><button onClick={()=>select(c.id)}>{c.title}</button><button className="text-button" disabled={state?.active?.conversationId===c.id} onClick={async()=>{if(!window.confirm(t("Delete this local conversation?","删除这段本机对话？")))return;try{await evaCall(accountId,"ai.deleteConversation",{conversationId:c.id});if(c.id===conversation)select();else await refresh();}catch(reason){setError(reason instanceof Error?reason.message:String(reason));}}}>{t("Delete","删除")}</button></div>)}{!state?.conversations.length&&<p>{t("No conversations yet.","还没有对话。")}</p>}<p><small>{t("Latest 200 conversations on this device.","显示本机最近 200 段对话。")}</small></p></div></FormSheet>}
      {personaOpen&&<FormSheet title={t("Personas","人格")} onClose={()=>setPersonaOpen(false)}><button className={parlor.personaOption} onClick={()=>setPersonaOpen(false)}><span className={parlor.avatar}>{persona.name.charAt(0)}</span><span><strong>{persona.name}</strong><small>{t("Personal Butler · Default","私人执事 · 默认")}</small></span><Icon name="check"/></button><p className={parlor.caption}>{t("Other personas will be added here when supported.","后续新增的人格将在这里切换。")}</p><button className="text-button" onClick={()=>{setPersonaOpen(false);onSettings("personas");}}>{t("Manage persona","管理人格")}</button></FormSheet>}
      {inspected&&<FormSheet title={t("Response details","回答详情")} onClose={()=>setUsageId(null)}><div className={parlor.usage}><dl>
        {[[t("Persona","人格"),inspected.personaName??"Eva"],[t("Provider","服务商"),inspected.providerName],[t("Model","模型"),inspected.model?.id],[t("Requests","请求次数"),inspected.requestCount],[t("Input tokens","输入 Token"),inspected.usage?.inputTokens],[t("Output tokens","输出 Token"),inspected.usage?.outputTokens],[t("Cache tokens","缓存 Token"),inspected.usage?.cachedTokens],[t("Estimated cost","估算费用"),inspected.cost===undefined?undefined:`${inspected.currency} ${inspected.cost.toFixed(6)}`],[t("Usage source","用量来源"),inspected.usage?.source==="provider"?t("Provider","服务商"):undefined]].map(([label,value])=><div key={String(label)} style={{display:"contents"}}><dt>{label}</dt><dd>{value??t("Unknown","未知")}</dd></div>)}
      </dl>{inspected.priceUpdatedAt&&<p className={parlor.caption}>{t("User price snapshot","用户价格快照")} · {inspected.priceUpdatedAt}</p>}</div></FormSheet>}
    </section>
  </>;
}
