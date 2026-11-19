"use client";
import {useCallback,useEffect,useLayoutEffect,useRef,useState,type ReactNode} from "react";
import {acceptEvaEvent,mergeEvaMessages,evaCall,evaIsBusy,evaModelBinding,nativeEvaEvent,nativeOrbitSendMethod,sebastianIdentity,type EvaMessage,type EvaState,type MessagePage} from "@/lib/native-eva";
import {useLocale} from "./locale-controller";
import {Icon} from "./icons";
import {Refresh} from "reicon-react";
import {FormSheet} from "./form-sheet";
import {ParlorMessageBody,ParlorAssistantLayout,ParlorFailedReply} from "./parlor-message";
import {ParlorErrorNotice} from "./parlor-error-notice";
import {useParlorAppearance} from "./parlor-appearance-sheet";
import {useNativeEva} from "./native-eva-context";
import {ParlorConversationModels} from "./parlor-conversation-models";
import {ParlorGroupSheet} from "./parlor-group-sheet";
import {ChatComposer} from "./chat-composer";
import {useChatViewport} from "./use-chat-viewport";
import parlor from "./parlor.module.css";
import styles from "./parlor-chat.module.css";
const emptyMessages:EvaMessage[]=[];

export function NativeEvaChat({accountId,back,initialConversationId,onSettings}:{accountId:string;back:ReactNode;initialConversationId?:string;onSettings:(section?:string)=>void}) {
  const {english}=useLocale(),t=(en:string,zh:string)=>english?en:zh;
  const [conversation,setConversation]=useState(()=>initialConversationId??localStorage.getItem(`eo:eva:last:${accountId}`)??crypto.randomUUID());
  const [state,setState]=useState<EvaState|null>(null),[draft,setDraft]=useState(""),[error,setError]=useState("");
  const [useOrbit,setUseOrbit]=useState(false);
  const [submitting,setSubmitting]=useState(false),[stopping,setStopping]=useState(false),[history,setHistory]=useState(false),[personaOpen,setPersonaOpen]=useState(false),[usageId,setUsageId]=useState<string|null>(null);
  const [olderLoading,setOlderLoading]=useState(false);
  const [modelOpen,setModelOpen]=useState(false);
  const [away,setAway]=useState(false);
  const [firstVisit]=useState(()=>!localStorage.getItem(`eo:parlor:introduced:${accountId}`));
  const {memoryProcessingSupported,groupSupported,discussionSupported,modelSwitchSupported,orbitSupported,singleMessageSupported}=useNativeEva();
  const [discussionBusy,setDiscussionBusy]=useState(false),[summaryOpen,setSummaryOpen]=useState(false),[summaryPersona,setSummaryPersona]=useState("");
  const discussionLock=useRef(false),summaryIdentity=useRef<{conversation:string;persona:string;id:string}|null>(null);
  const [groupSheet,setGroupSheet]=useState(false),[newGroup,setNewGroup]=useState(false),[selectedPersona,setSelectedPersona]=useState(()=>localStorage.getItem(`eo:parlor:persona:${accountId}`)??"sebastian");
  const retryIds=useRef(new Map<string,string>()),controlLock=useRef(new Set<string>());
  const [controlling,setControlling]=useState<string[]>([]);
  const [messageAction,setMessageAction]=useState<{id:string;kind:"retry"|"delete"}|null>(null);
  const messageActionLock=useRef(false),deletedMessages=useRef(new Set<string>());
  const singleRetry=useRef<{conversation:string;messageId:string;previousRequestId?:string;requestId:string}|null>(null);
  const group=state?.groups?.find(g=>g.id===conversation);
  const discussion=state?.discussions?.find(d=>d.conversationId===conversation);
  const discussionMode=group?.mode==="discussion";
  const discussing=discussion?.status==="running"||discussion?.status==="summarizing";
  const resumable=discussion?.status==="paused"||discussion?.status==="interrupted";
  const persona=state?.personas?.find(p=>p.id===(state.conversation?.personaId??selectedPersona))??state?.persona??sebastianIdentity;
  const appearance=useParlorAppearance(accountId);
  const container=useRef<HTMLElement>(null),input=useRef<HTMLTextAreaElement>(null),scroll=useRef<HTMLDivElement>(null),followBottom=useRef(true);
  const identity=useRef<{id:string;conversation:string;content:string;choice:string}|null>(null),sendLock=useRef(false);
  const generation=useRef(0),currentConversation=useRef(conversation),refreshQueued=useRef(false);
  const messages=state?.messages??emptyMessages;
  const messageIds=new Set(messages.map(message=>message.id));
  const activeHere=state?.active?.conversationId===conversation&&state.active.status==="streaming"&&!messageIds.has(state.active.id)?state.active:undefined;
  const running=messages.find(m=>m.status==="streaming")??activeHere;
  useChatViewport(container,input,scroll,followBottom);
  const refresh=useCallback(async(deletedCandidate?:string)=>{
    const target=conversation,version=generation.current;
    const attempt=singleRetry.current?.conversation===target?singleRetry.current:null;
    const trackedMessageId=deletedCandidate??attempt?.messageId;
    const value=await evaCall<EvaState>(accountId,"ai.getState",{conversationId:target,...(trackedMessageId?{trackedMessageId}:{})});
    if(version!==generation.current||currentConversation.current!==target)return value;
    if(deletedCandidate&&!value.trackedMessage&&!value.messages.some(m=>m.id===deletedCandidate))deletedMessages.current.add(deletedCandidate);
    setState(current=>{
      const first=value.messages[0]?.ordinal;
      const retained=current?.messages.some(m=>m.ordinal!==undefined&&first!==undefined&&m.ordinal<first);
      const incoming=value.trackedMessage?[...value.messages,value.trackedMessage]:value.messages;
      const merged=mergeEvaMessages(current?.messages??[],incoming).filter(m=>!deletedMessages.current.has(m.id));
      return {...value,messages:merged,messagePage:retained&&current?.messagePage?{...value.messagePage!,hasMore:current.messagePage.hasMore,beforeOrdinal:current.messagePage.beforeOrdinal}:value.messagePage};
    });
    const reply=value.trackedMessage??value.messages.find(m=>m.id===attempt?.messageId);
    if(attempt&&singleRetry.current===attempt&&reply?.requestId===attempt.requestId&&reply.status!=="streaming")singleRetry.current=null;
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
      const retryRequestId=singleRetry.current?.requestId;
      setState(current=>{if(!current)return current;const next=acceptEvaEvent(detail,accountId,conversation,current.messages,retryRequestId);return next?{...current,messages:next}:current;});
      // Reconcile terminal / initial events and gaps from remounts against durable state.
      if(detail.seq===1||detail.eventType==="terminal")schedule();
    };
    load();window.addEventListener(nativeEvaEvent,receive);window.addEventListener("evaorbit:native-active",load);window.addEventListener("focus",load);
    return()=>{alive=false;generation.current+=1;clearTimeout(timer);refreshQueued.current=false;window.removeEventListener(nativeEvaEvent,receive);window.removeEventListener("evaorbit:native-active",load);window.removeEventListener("focus",load);};
  },[accountId,conversation,refresh]);
  useLayoutEffect(()=>{if(followBottom.current&&scroll.current)scroll.current.scrollTop=scroll.current.scrollHeight;},[messages,conversation,appearance.segmentReplies]);
  const boundModel=Boolean(state?.conversationModels?.some(c=>c.personaId===persona.id)||"providerId" in persona&&persona.providerId&&persona.modelId);
  const selected=state?evaModelBinding(state,persona):undefined;
  const activeElsewhere=state?.active??state?.activeMessages?.find(m=>m.conversationId!==conversation)??state?.discussions?.find(d=>d.conversationId!==conversation&&(d.status==="running"||d.status==="summarizing"));
  const inspected=messages.find(m=>m.id===usageId);
  function select(id?:string){
    const next=id??crypto.randomUUID();setOlderLoading(false);setHistory(false);setDraft("");setError("");setUseOrbit(false);identity.current=null;followBottom.current=true;
    if(next===currentConversation.current){void refresh().catch(reason=>setError(reason.message));return;}
    generation.current+=1;currentConversation.current=next;setConversation(next);setState(null);
  }
  const memorySession=useRef({cycle:0,accountId,conversation});
  useEffect(()=>{if(!memoryProcessingSupported)return;const cycle=memorySession.current.cycle+1;memorySession.current={cycle,accountId,conversation};const ended=()=>{void evaCall(accountId,"ai.memoryConversationEnded",{conversationId:conversation}).catch(()=>{});};window.addEventListener("pagehide",ended);return()=>{window.removeEventListener("pagehide",ended);queueMicrotask(()=>{const next=memorySession.current;if(next.cycle===cycle||next.accountId!==accountId||next.conversation!==conversation)ended();});};},[accountId,conversation,memoryProcessingSupported]);
  async function loadOlder(){
    const before=state?.messagePage?.beforeOrdinal;if(!before||olderLoading)return;
    const version=generation.current,target=conversation,pane=scroll.current,height=pane?.scrollHeight??0,top=pane?.scrollTop??0;
    setOlderLoading(true);followBottom.current=false;
    try{const page=await evaCall<MessagePage>(accountId,"ai.messagePage",{conversationId:target,beforeOrdinal:before,limit:100});if(version!==generation.current||target!==currentConversation.current)return;setState(current=>current?{...current,messages:mergeEvaMessages(page.messages,current.messages).filter(m=>!deletedMessages.current.has(m.id)),messagePage:page}:current);requestAnimationFrame(()=>{if(pane&&target===currentConversation.current)pane.scrollTop=top+pane.scrollHeight-height;});}
    catch(reason){if(version===generation.current)setError(reason instanceof Error?reason.message:String(reason));}finally{if(version===generation.current)setOlderLoading(false);}
  }
  async function send(){
    if(sendLock.current||messageActionLock.current||discussionLock.current||(!discussionMode&&running)||!draft.trim()||(!group&&!selected))return;
    sendLock.current=true;setSubmitting(true);setError("");
    const content=draft.trim(),target=conversation;
    const withOrbit=!group&&orbitSupported&&useOrbit;
    const choice=group?.id??selected!.key+(withOrbit?":orbit":"");
    const previous=identity.current;
    const submission=previous?.content===content&&previous.conversation===target&&previous.choice===choice?previous:{id:crypto.randomUUID(),conversation:target,content,choice};
    identity.current=submission;
    try{
      if(group)await evaCall(accountId,discussionMode&&discussion&&["running","paused","interrupted"].includes(discussion.status)?"ai.discussionIntervene":"ai.groupSend",{conversationId:target,requestId:submission.id,content});
      else await evaCall(accountId,withOrbit?nativeOrbitSendMethod:"ai.send",{conversationId:target,requestId:submission.id,providerId:selected!.provider.id,modelId:selected!.model.id,personaId:persona.id,content,...(withOrbit?{english}:{})});
      setDraft("");setUseOrbit(false);identity.current=null;followBottom.current=true;await refresh();
    }catch(reason){
      setError(reason instanceof Error?reason.message:String(reason));
      // Only read after uncertain delivery. Never repeat a possibly billed model call automatically.
      try{const saved=await refresh();if(saved.messages.some(m=>m.requestId===submission.id||m.roundId===submission.id)){setDraft("");identity.current=null;}}catch{/* Keep text and the stable submission ID for a user-initiated retry. */}
    }finally{setSubmitting(false);sendLock.current=false;}
  }
  async function stop(){if(!running||stopping)return;setStopping(true);try{if(group)await evaCall(accountId,"ai.groupCancel",{conversationId:conversation});else await evaCall(accountId,"ai.cancel",{requestId:running.requestId});await refresh();}catch(reason){setError(reason instanceof Error?reason.message:String(reason));}finally{setStopping(false);}}
  async function actOnMessage(message:EvaMessage,kind:"retry"|"delete"){
    if(group||!singleMessageSupported||messageActionLock.current||sendLock.current||running)return;
    if(kind==="delete"&&!window.confirm(t("Delete this message from this conversation?","从这段对话中删除这条消息？")))return;
    messageActionLock.current=true;
    setMessageAction({id:message.id,kind});
    setError("");
    let requestId:string|undefined;
    try{
      const target={conversationId:conversation,messageId:message.id};
      if(kind==="retry"){
        const previous=singleRetry.current;
        const attempt=previous?.messageId===message.id&&previous.previousRequestId===message.requestId
          ?previous:{conversation,messageId:message.id,previousRequestId:message.requestId,requestId:crypto.randomUUID()};
        singleRetry.current=attempt;
        requestId=attempt.requestId;
        await evaCall(accountId,"ai.retryMessage",{...target,requestId,...(attempt.previousRequestId?{previousRequestId:attempt.previousRequestId}:{})});
      }else{
        await evaCall(accountId,"ai.deleteMessage",target);
        deletedMessages.current.add(message.id);
        if(currentConversation.current===conversation)setState(current=>current?{...current,messages:current.messages.filter(m=>m.id!==message.id)}:current);
      }
      await refresh();
    }catch(reason){
      let recovered=false;
      try{
        const saved=await refresh(kind==="delete"?message.id:undefined);
        const persisted=saved.trackedMessage??saved.messages.find(item=>item.id===message.id);
        recovered=kind==="delete"?!persisted:requestId!==undefined&&persisted?.requestId===requestId;
      }catch{/* Keep the attempt identity for uncertain delivery. */}
      if(!recovered&&currentConversation.current===conversation)setError(reason instanceof Error?reason.message:String(reason));
    }finally{
      messageActionLock.current=false;
      setMessageAction(null);
    }
  }
  async function control(message:EvaMessage,regenerate=false){
    if(controlLock.current.has(message.id)||regenerate&&discussing)return;
    controlLock.current.add(message.id);setControlling([...controlLock.current]);setError("");
    try{if(regenerate){const requestId=retryIds.current.get(message.id)??crypto.randomUUID();retryIds.current.set(message.id,requestId);await evaCall(accountId,"ai.groupRegenerate",{conversationId:conversation,messageId:message.id,requestId});retryIds.current.delete(message.id);}else await evaCall(accountId,"ai.groupCancel",{conversationId:conversation,messageId:message.id});await refresh();}
    catch(reason){setError(reason instanceof Error?reason.message:String(reason));try{await refresh();}catch{/* Preserve the explicit retry identity after uncertain delivery. */}}
    finally{controlLock.current.delete(message.id);setControlling([...controlLock.current]);}
  }
  async function discussionAction(action:"pause"|"continue"|"end"|"summary"){
    if(discussionLock.current||sendLock.current)return;
    discussionLock.current=true;setDiscussionBusy(true);setError("");
    try{
      if(action==="summary"){
        const chosen=group?.participants.some(p=>p.id===summaryPersona)?summaryPersona:group?.participants[0]?.id;
        if(!chosen)return;
        const previous=summaryIdentity.current;
        const request=previous?.conversation===conversation&&previous.persona===chosen?previous:{conversation,persona:chosen,id:crypto.randomUUID()};summaryIdentity.current=request;
        await evaCall(accountId,"ai.discussionSummarize",{conversationId:conversation,personaId:chosen,requestId:request.id});
        summaryIdentity.current=null;setSummaryOpen(false);followBottom.current=true;
      }else await evaCall(accountId,"ai.discussionControl",{conversationId:conversation,action});
      await refresh();
    }catch(reason){setError(reason instanceof Error?reason.message:String(reason));try{await refresh();}catch{/* Retain explicit action identity. */}}
    finally{discussionLock.current=false;setDiscussionBusy(false);}
  }
  return <>
    {appearance.images.wallpaper&&<div className={styles.wallpaper} data-parlor-wallpaper aria-hidden="true" style={{backgroundImage:`url("${appearance.images.wallpaper}")`}}/>}
    <section ref={container} className={styles.chat} data-parlor-chat data-native-eva-chat data-bubble-style={appearance.bubbleStyle} data-wallpaper={Boolean(appearance.images.wallpaper)||undefined} aria-label="Parlor">
      <header className={styles.header}><div className={styles.back}>{back}</div><div className={`${styles.identity} ${parlor.chatIdentity}`}>
          {!group&&(persona as {avatarDataURL?:string}).avatarDataURL? <span className={parlor.avatar} style={{backgroundImage:`url("${(persona as {avatarDataURL?:string}).avatarDataURL}")`}}/>:!group&&persona.id==="sebastian"&&appearance.images.assistant?(
            // eslint-disable-next-line @next/next/no-img-element -- Device-local persona avatar.
            <img className={parlor.avatarImage} src={appearance.images.assistant} alt=""/>
          ):<span className={parlor.avatar} aria-hidden="true">{group?group.participants.length:persona.name.charAt(0)}</span>}
          <div className={parlor.identityLabels}>
            <button className={parlor.personaTrigger} onClick={()=>{setNewGroup(false);if(group)setGroupSheet(true);else setPersonaOpen(true);}} aria-label={group?t("Group members","群聊成员"):t("Switch persona","切换人格")} aria-haspopup="dialog"><h1 data-no-translate>{group?.title??persona.name}</h1><Icon name="chevronDown"/></button>
            {group?<span className={parlor.roomLabel}>{`${group.participants.length} · ${group.mode==="discussion"?"Discussion":"Parallel"}`}</span>:<button className={parlor.modelTrigger} disabled={!state||!modelSwitchSupported} onClick={()=>setModelOpen(true)} aria-haspopup="dialog" aria-label={t("Switch conversation model","切换会话模型")} aria-describedby={`parlor-current-model-${conversation}`} title={selected?.model.name}><span id={`parlor-current-model-${conversation}`} data-no-translate>{selected?.model.name??(boundModel?t("Model unavailable","模型不可用"):t("Select model","选择模型"))}</span>{modelSwitchSupported&&<Icon name="chevronDown"/>}</button>}
          </div>
        </div>
        <nav aria-label={t("Conversation actions","对话操作")}>{groupSupported&&<button disabled={submitting||Boolean(state&&evaIsBusy(state))} aria-label={t("New group","创建群聊")} onClick={()=>{setNewGroup(true);setGroupSheet(true);}}><Icon name="people"/></button>}<button aria-label={t("Conversation history","历史对话")} onClick={()=>setHistory(true)}><Icon name="history"/></button><button disabled={submitting} aria-label={t("New conversation","新对话")} onClick={()=>select()}><Icon name="plus"/></button><button aria-label={t("Parlor settings","Parlor 设置")} onClick={()=>onSettings()}><Icon name="settings"/></button></nav>
      </header>
      <div ref={scroll} className={styles.scroll} onScroll={()=>{const pane=scroll.current;if(pane){followBottom.current=pane.scrollHeight-pane.scrollTop-pane.clientHeight<48;setAway(!followBottom.current);}}}>
        {state?.messagePage?.hasMore&&<button type="button" className="text-button" disabled={olderLoading} onClick={()=>void loadOlder()}>{olderLoading?t("Loading…","正在读取…"):t("Load earlier messages","读取更早消息")}</button>}
        {!state&&!error&&<p className={styles.activity} role="status">{t("Opening conversation…","正在打开对话…")}</p>}
        {state&&!group&&!messages.length&&<div className={parlor.welcome}><span className={parlor.avatar} style={appearance.images.assistant?{backgroundImage:`url("${appearance.images.assistant}")`}:undefined} aria-hidden="true">{!appearance.images.assistant&&persona.name.charAt(0)}</span><h2>{firstVisit?t("Welcome to Parlor","欢迎来到 Parlor"):t("At your service.","今天，有什么需要打点？")}</h2><p>{firstVisit?t(`I’m ${persona.name}.`,`初次见面，我是 ${persona.name}。`):t("What would you like me to take care of today?","今天有什么需要我处理的吗？")}</p>{!(selected?.provider.connectionType==="subscription"||selected?.provider.hasKey)&&<button className="text-button" onClick={()=>onSettings("providers")}>{t("Connect a model to begin","先连接一个模型")}</button>}</div>}
        <div className={styles.messages}>{messages.map((message,index)=>{
          const previous=messages[index-1],next=messages[index+1],hasContent=Boolean(message.content.trim());
          const samePersona=(other:EvaMessage|undefined)=>other?.role===message.role&&other.personaId===message.personaId;
          const tail=!samePersona(next),first=!samePersona(previous);
          const avatar=message.role==="assistant"?(message.personaAvatar??(message.personaId==="sebastian"||!message.personaId?appearance.images.assistant:undefined)):hasContent?appearance.images.user:undefined;
          const showAvatar=appearance.avatarPlacement==="all"||appearance.avatarPlacement==="first"&&first||appearance.avatarPlacement==="last"&&tail;
          const canAct=!group&&singleMessageSupported&&message.status!=="streaming";
          const promptMayBeEarlier=index===0&&state?.messagePage?.hasMore;
          const hasPrompt=message.replyToMessageId?messageIds.has(message.replyToMessageId)||promptMayBeEarlier:previous?.role==="user"||promptMayBeEarlier;
          const failedReply=!group&&message.role==="assistant"&&["failed","interrupted"].includes(message.status);
          const pending=messageAction?.id===message.id?messageAction.kind:null;
          const actionDisabled=Boolean(running||submitting||messageAction);
          const deleteAction=canAct&&<button type="button" className={`text-button ${styles.messageAction}`} disabled={actionDisabled} aria-label={t("Delete message","删除消息")} title={t("Delete message","删除消息")} onClick={()=>void actOnMessage(message,"delete")}>{pending==="delete"?<span role="status">{t("Deleting…","正在删除…")}</span>:<Icon name="trash"/>}</button>;
          return <article className={styles.message} data-role={message.role} data-group-end={tail} data-avatar={message.role==="user"&&!group&&Boolean(avatar)} data-group-persona={group&&message.role==="assistant"?group.participants.findIndex(p=>p.id===message.personaId)%2:undefined} data-message-id={message.id} data-status={message.status} key={message.id}>
            {message.role==="user"?<>
              {hasContent&&<ParlorMessageBody message={message} avatar={!group?avatar:undefined} avatarPlacement={appearance.avatarPlacement} showAvatar={showAvatar}/>}
              <footer className={styles.messageActions}><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString(english?"en-US":"zh-CN",{hour:"2-digit",minute:"2-digit"})}</time>{deleteAction}</footer>
              {message.error&&<ParlorErrorNotice inline error={message.error}/>}
            </>:<ParlorAssistantLayout group={Boolean(group)} hasAvatar={!group&&Boolean(avatar)} header={group?<header className={parlor.speaker}><span className={parlor.avatar} style={avatar||message.personaAvatar?{backgroundImage:`url("${message.personaAvatar||avatar}")`}:undefined} aria-hidden="true">{!avatar&&!message.personaAvatar&&(message.personaName??"?").charAt(0)}</span><strong>{message.personaName}</strong><small>{message.purpose==="summary"?t("Summary","总结"):message.discussionRound?t(`Round ${message.discussionRound}`,`第 ${message.discussionRound} 轮`):message.model?.name}</small></header>:undefined} footer={failedReply?
              <ParlorFailedReply error={message.error} interrupted={message.status==="interrupted"} avatar={!hasContent&&showAvatar?avatar:undefined} disabled={actionDisabled} pending={pending}
                onRetry={canAct&&hasPrompt?()=>void actOnMessage(message,"retry"):undefined} onDelete={canAct?()=>void actOnMessage(message,"delete"):undefined} onSettings={()=>onSettings("providers")}/>
              :<>
              <div className={group?parlor.responseActions:styles.messageActions} data-parlor-response-actions={group||undefined}>
              {group&&message.status==="streaming"?<span className={parlor.meta} role="status" data-parlor-waiting={!hasContent||undefined}><span>{message.model?.name??t("Unknown model","模型未知")}</span><span aria-hidden="true">·</span><span>{t("Generating","正在生成")}</span></span>:(hasContent||group)&&message.status!=="streaming"&&<button className={parlor.meta} onClick={()=>setUsageId(message.id)} aria-label={t("Response usage details","回答用量详情")}>
                <span>{message.model?.name??t("Unknown model","模型未知")}</span><span aria-hidden="true">·</span>
                <span>{message.usage?.inputTokens!==undefined&&message.usage.outputTokens!==undefined?`${(message.usage.inputTokens+message.usage.outputTokens).toLocaleString(english?"en-US":"zh-CN")} tokens`:t("Usage unknown","用量未知")}</span><span aria-hidden="true">·</span>
                <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString(english?"en-US":"zh-CN",{hour:"2-digit",minute:"2-digit"})}</time>
              </button>}
              {deleteAction}
              {group&&message.role==="assistant"&&<div className={parlor.generationControls}>{message.status==="streaming"?<button className={`${parlor.meta} ${parlor.generationAction} ${parlor.stopAction}`} disabled={controlling.includes(message.id)} onClick={()=>void control(message)} aria-label={t(`Stop ${message.personaName}`,`停止 ${message.personaName}`)} title={t("Stop","停止")}><svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg></button>:<button className={`${parlor.meta} ${parlor.generationAction}`} disabled={submitting||discussing||controlling.includes(message.id)||messages.some(m=>m.supersedesId===message.id||m.personaId===message.personaId&&m.status==="streaming")} onClick={()=>void control(message,true)} aria-label={t(`Regenerate ${message.personaName}`,`重新生成 ${message.personaName}`)} title={t("Regenerate","重新生成")}><Refresh className="icon" weight="Outline" aria-hidden="true"/></button>}</div>}
              </div>
              {((!group&&message.status==="streaming"&&!hasContent)||!["streaming","done"].includes(message.status))&&<div className={parlor.status} data-parlor-waiting={message.status==="streaming"||undefined} role="status">{message.status==="streaming"?t("Thinking…","思考中…"):message.status==="cancelled"?t(hasContent?"Stopped · partial text kept":"Stopped",hasContent?"已停止 · 已保留部分内容":"已停止"):message.status==="interrupted"?t(hasContent?"Interrupted · partial text kept":"Interrupted",hasContent?"已中断 · 已保留部分内容":"已中断"):t("Response failed","回答未完成")}</div>}

              {message.error&&<ParlorErrorNotice inline error={message.error}/>}
            </>}>
              {hasContent&&<ParlorMessageBody message={message} segmentReplies={appearance.segmentReplies} avatar={!group?avatar:undefined} avatarPlacement={appearance.avatarPlacement} showAvatar={showAvatar}/>}
            </ParlorAssistantLayout>}
          </article>;
        })}</div>
      </div>
      <div className={styles.composerArea}>
        {state?.conversation?.ownership==="unresolved"&&<div className={styles.notice}><button type="button" className="text-button" onClick={()=>onSettings("memory")}>{t("Confirm this conversation’s persona in Memory settings","在记忆设置中确认这段会话的人格")}</button></div>}
        {state&&!group&&boundModel&&!selected&&<div className={styles.notice}><button className="text-button" onClick={()=>{if(modelSwitchSupported)setModelOpen(true);else onSettings("personas");}}>{t("Model unavailable · choose again","模型不可用 · 重新选择")}</button></div>}
        {activeElsewhere&&activeElsewhere.conversationId!==conversation&&<div className={styles.notice}><button className="text-button" onClick={()=>select(activeElsewhere.conversationId)}>{t("Open the active conversation","打开正在回答的对话")}</button></div>}
        {away&&<button type="button" className={styles.latestButton} aria-label={t("Back to bottom","回到底部")} onClick={()=>{followBottom.current=true;setAway(false);scroll.current?.scrollTo({top:scroll.current.scrollHeight});}}><Icon name="chevronDown"/></button>}
        {error&&<div className={styles.notice}><ParlorErrorNotice error={error}/><button className="text-button" onClick={()=>void refresh().then(()=>setError("")).catch(reason=>setError(reason.message))}>{t("Reload saved state","重新读取已保存状态")}</button><button className="text-button" onClick={()=>setError("")}>{t("Dismiss","关闭")}</button></div>}
        {group&&modelSwitchSupported&&<div className={parlor.conversationTools}><button type="button" className="text-button" disabled={submitting||discussionBusy||!state} onClick={()=>setModelOpen(true)}><Icon name="ai"/>{t("Models","模型")}<Icon name="chevronDown"/></button></div>}
        {discussionMode&&<div className={parlor.discussionBar} data-parlor-discussion data-discussion-status={discussion?.status??"ready"}>
          <button type="button" className="text-button" disabled={discussionBusy||discussing} onClick={()=>{setNewGroup(false);setGroupSheet(true);}}>Discussion · {discussion?`${Math.min(discussion.roundsStarted,discussion.maxRounds)}/${discussion.maxRounds}`:`${group.maxRounds??3} ${t("rounds","轮")}`}</button>
          <span role="status">{discussion?.status==="paused"?t("Paused","已暂停"):discussion?.status==="interrupted"?t("Interrupted","已中断"):discussion?.status==="completed"?t("Complete","已完成"):discussion?.status==="ended"?t("Ended","已结束"):discussion?.status==="summarizing"?t("Summarizing","正在总结"):discussion?.status==="running"?t("Discussing","讨论中"):""}</span>
          <div>{discussion?.status==="running"&&<button type="button" className="text-button" disabled={discussionBusy} onClick={()=>void discussionAction("pause")}>{t("Pause","暂停")}</button>}
          {resumable&&discussion.roundsStarted<discussion.maxRounds&&<button type="button" className="text-button" disabled={discussionBusy||Boolean(running)} onClick={()=>void discussionAction("continue")}>{t("Continue","继续")}</button>}
          {(discussing||resumable)&&<button type="button" className="text-button" disabled={discussionBusy} onClick={()=>void discussionAction("end")}>{t("End","结束讨论")}</button>}
          {discussion&&<button type="button" className="text-button" disabled={discussionBusy||discussion.status==="summarizing"} onClick={()=>{setSummaryPersona(group.participants[0]?.id??"");setSummaryOpen(true);}}>{t("Summarize","总结")}</button>}</div>
        </div>}
        {discussion?.error&&<ParlorErrorNotice inline error={discussion.error}/>}
        {discussionMode&&!discussionSupported&&<p className={styles.notice}>{t("Update Host for Discussion","更新 Host 后使用 Discussion")}</p>}
        {!group&&orbitSupported&&state&&<div className={parlor.conversationTools}>
          <button type="button" className="text-button" aria-pressed={useOrbit} disabled={submitting||Boolean(running)} onClick={()=>setUseOrbit(value=>!value)}><Icon name={useOrbit?"check":"ai"}/>{t("Use EvaOrbit","使用 EvaOrbit")}</button>
          {useOrbit&&<small>{t("Lookup results go to the selected model. Saving requires confirmation.","查询结果会发给当前模型，保存前需确认。")}</small>}
        </div>}
        <ChatComposer inputRef={input} draft={draft} english={english} placeholder={discussionMode&&discussing?t("Guide the discussion…","插话或引导讨论……"):t("Say something…","说点什么……")} disabled={state?.conversation?.ownership==="unresolved"||submitting||discussionBusy||!state||discussionMode&&!discussionSupported||discussion?.status==="summarizing"} stop={!discussionMode&&Boolean(running)} stopLabel={stopping?t("Stopping…","正在停止…"):group?t("Stop all","停止全部"):t("Stop response","停止生成")} buttonDisabled={!discussionMode&&running?stopping:state?.conversation?.ownership==="unresolved"||submitting||Boolean(messageAction)||discussionBusy||discussionMode&&!discussionSupported||discussion?.status==="summarizing"||!draft.trim()||(!group&&!(selected?.provider.connectionType==="subscription"||selected?.provider.hasKey))||!state} onDraftChange={setDraft} onSend={()=>void send()} onStop={()=>void stop()}/>
      </div>
      {history&&<FormSheet title={t("Conversations on this device","本机历史对话")} onClose={()=>setHistory(false)}><div className={styles.history}>{state?.conversations.map(c=><div key={c.id}><button onClick={()=>select(c.id)}>{c.title}</button><button className="text-button" disabled={state?.active?.conversationId===c.id||state?.activeMessages?.some(m=>m.conversationId===c.id)||state?.discussions?.some(d=>d.conversationId===c.id&&(d.status==="running"||d.status==="summarizing"))} onClick={async()=>{if(!window.confirm(t("Delete this local conversation and memories derived from it?","删除这段本机对话及其衍生记忆？")))return;try{await evaCall(accountId,"ai.deleteConversation",{conversationId:c.id});if(c.id===conversation)select();else await refresh();}catch(reason){setError(reason instanceof Error?reason.message:String(reason));}}}>{t("Delete","删除")}</button></div>)}{!state?.conversations.length&&<p>{t("No conversations yet.","还没有对话。")}</p>}<p><small>{t("Recent 200","最近 200 段")}</small></p></div></FormSheet>}
      {personaOpen&&<FormSheet title={t("Personas","人格")} onClose={()=>setPersonaOpen(false)}><div className={parlor.personaChoices} data-persona-choices>{(state?.personas??(state?.persona?[state.persona]:[])).map(p=><button key={p.id} className={parlor.personaOption} onClick={()=>{if(state?.conversation?.personaId&&state.conversation.personaId!==p.id)select();setSelectedPersona(p.id);localStorage.setItem(`eo:parlor:persona:${accountId}`,p.id);setPersonaOpen(false);}}><span className={parlor.avatar} aria-hidden="true" style={p.avatarDataURL?{backgroundImage:`url("${p.avatarDataURL}")`}:p.id==="sebastian"&&appearance.images.assistant?{backgroundImage:`url("${appearance.images.assistant}")`}:undefined}>{!p.avatarDataURL&&!(p.id==="sebastian"&&appearance.images.assistant)&&p.name.charAt(0)}</span><span><strong>{p.name}</strong><small>{state?evaModelBinding(state,p)?.model.name??t("Model unavailable","模型不可用"):""}</small></span>{persona.id===p.id&&<Icon name="check"/>}</button>)}<button className="text-button" onClick={()=>{setPersonaOpen(false);onSettings("personas");}}>{t("Manage persona","管理人格")}</button></div></FormSheet>}
      {state&&modelOpen&&<ParlorConversationModels key={conversation} accountId={accountId} conversationId={conversation} state={state} group={group} persona={persona} english={english} onClose={()=>setModelOpen(false)} onSaved={refresh}/> }
      {state&&groupSheet&&<ParlorGroupSheet accountId={accountId} state={state} group={newGroup?undefined:group} english={english} onClose={()=>{setGroupSheet(false);setNewGroup(false);}} onSaved={id=>{setGroupSheet(false);setNewGroup(false);select(id);}} onPersonas={()=>{setGroupSheet(false);setNewGroup(false);onSettings("personas");}}/>}
      {summaryOpen&&group&&<FormSheet title={t("Summarize with","选择总结人格")} onClose={()=>{if(!discussionBusy)setSummaryOpen(false);}}><div className={parlor.groupForm}>{group.participants.map(p=><button key={p.id} type="button" className={parlor.personaOption} aria-pressed={summaryPersona===p.id} disabled={discussionBusy} onClick={()=>setSummaryPersona(p.id)}><span className={parlor.avatar} aria-hidden="true" style={p.avatarDataURL?{backgroundImage:`url("${p.avatarDataURL}")`}:undefined}>{!p.avatarDataURL&&p.name.charAt(0)}</span><strong>{p.name}</strong>{summaryPersona===p.id&&<Icon name="check"/>}</button>)}<button type="button" className="button primary" disabled={discussionBusy||!summaryPersona} onClick={()=>void discussionAction("summary")}>{t("Summarize discussion","整理讨论结论")}</button></div></FormSheet>}
      {inspected&&<FormSheet title={t("Response details","回答详情")} onClose={()=>setUsageId(null)}><div className={parlor.usage}><dl>
        {[[t("Persona","人格"),inspected.personaName??"Eva"],[t("Provider","服务商"),inspected.providerName],[t("Model","模型"),inspected.model?.id],[t("Requests","请求次数"),inspected.requestCount],[t("Input tokens","输入 Token"),inspected.usage?.inputTokens],[t("Output tokens","输出 Token"),inspected.usage?.outputTokens],[t("Cache tokens","缓存 Token"),inspected.usage?.cachedTokens],[t("Estimated cost","估算费用"),inspected.cost===undefined?undefined:`${inspected.currency} ${inspected.cost.toFixed(6)}`],[t("Usage source","用量来源"),inspected.usage?.source==="provider"?t("Provider","服务商"):undefined]].map(([label,value])=><div key={String(label)} style={{display:"contents"}}><dt>{label}</dt><dd>{value??t("Unknown","未知")}</dd></div>)}
      </dl>{inspected.contextBudget&&<><p className={parlor.caption}>{t("Context estimates · not provider usage","上下文估算 · 与服务商实际用量分开")}</p><dl>{[[t("Context window","上下文窗口"),`${inspected.contextBudget.contextWindow}${inspected.contextBudget.windowKnown?"":t(" (conservative default)","（保守默认）")}`],[t("Estimated input","预计输入 Token"),inspected.contextBudget.estimatedInputTokens],[t("Memory input estimate","记忆输入估算"),inspected.contextBudget.memoryTokens],[t("Echo input estimate","Echo 输入估算"),inspected.contextBudget.echoTokens??0],[t("Output reserve estimate","输出预留估算"),inspected.contextBudget.outputTokens],[t("Recent messages included","带入的近期消息"),inspected.contextCoverage?.includedMessages]].map(([label,value])=><div key={String(label)} style={{display:"contents"}}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{Boolean(inspected.contextCoverage?.notices.length)&&<p className={parlor.caption}>{t("Some earlier context may be omitted or unavailable; original messages are preserved.","部分较早上下文可能未带入或不可用，原始消息仍然保留。")}</p>}</>}{inspected.priceUpdatedAt&&<p className={parlor.caption}>{inspected.model?.priceSource==="openrouter"?t("OpenRouter directory quote","OpenRouter 目录报价"):t("User price snapshot","用户价格快照")} · {inspected.priceUpdatedAt}</p>}{inspected.model?.priceEstimateLimited&&<p className={parlor.caption}>{t("Conditional or extra charges: total cost unknown.","存在条件或额外计费，总费用未知。")}</p>}</div></FormSheet>}
    </section>
  </>;
}
