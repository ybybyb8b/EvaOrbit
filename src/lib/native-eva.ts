import {rawNativeCall,type NativeHostInfo} from "./native-bridge.ts";

export const nativeEvaEvent="evaorbit:ai";
export const nativeEvaMethods=["ai.getState","ai.saveProvider","ai.deleteProvider","ai.send","ai.cancel","ai.deleteConversation","ai.savePersona"] as const;
export const supportsNativeEva=(info:NativeHostInfo|null)=>nativeEvaMethods.every(method=>info?.methods?.includes(method));
export const nativeCatalogMethods=["ai.listModels","ai.cancelModelList"] as const;
export const supportsNativeCatalog=(info:NativeHostInfo|null)=>nativeCatalogMethods.every(method=>info?.methods?.includes(method));
export type EvaModel={id:string;name:string;inputPrice?:number;outputPrice?:number;cachedInputPrice?:number;contextWindow?:number;priceSource?:"manual"|"openrouter";priceUpdatedAt?:string;priceEstimateLimited?:boolean};
export type EvaDiscoveredModel={model:EvaModel;family:string;textCapability:"text"|"unknown"};
export type EvaModelCatalog={models:EvaDiscoveredModel[];fetchedAt:string;currency?:string;partial?:boolean};
export const nativeSubscriptionMethods=["ai.subscriptionLogin","ai.subscriptionLogout","ai.subscriptionModels"] as const;
export type EvaProvider={connectionType?:"api"|"subscription";id:string;name:string;baseURL:string;models:EvaModel[];enabled:boolean;currency:string;priceUpdatedAt:string;hasKey?:boolean};
export const nativeGroupMethods=["ai.saveGroup","ai.groupSend","ai.groupCancel","ai.groupRegenerate"] as const;
export const nativeConversationModelMethod="ai.setConversationModel" as const;
export const nativeContextMethods=["ai.messagePage","ai.contextGet","ai.contextSave"] as const;
export type ContextBudget={contextWindow:number;windowKnown:boolean;outputTokens:number;inputLimit:number;systemTokens:number;publicTokens:number;memoryTokens:number;estimatedInputTokens:number;estimateMethod:string;hardByteLimit:number;echoTokens?:number};
export type ContextCoverage={watermark:number;totalMessages:number;includedMessages:number;summarizedThrough:number;notices:string[]};
export type MessagePage={messages:EvaMessage[];hasMore:boolean;beforeOrdinal?:number;watermark:number;total:number};
export type ConversationContext={accountId:string;conversationId:string;scope:string;version:number;content:string;unresolved:string[];fromOrdinal:number;throughOrdinal:number;firstMessageId?:string;throughMessageId?:string;sourceCount:number;sourceHash:string;contentHash:string;updatedAt:string;status:"active"|"superseded"|"invalidated";recentMessageLimit:number;processingTaskId?:string;processingInputHash?:string;processingProviderId?:string;processingModelId?:string};
export type ConversationContextState={scope:string;versions:ConversationContext[];watermark:number;page:MessagePage};
export const nativeEchoMethods=["ai.echoGet","ai.echoConfigure","ai.echoClear","ai.echoEntities","ai.echoSharePrepare","ai.echoShareSubmit","ai.echoShareStatus"] as const;
export type EchoConfig={accountId:string;readEnabled:boolean;writeEnabled:boolean;apiAttempts:number;lastRecallAt?:string;lastStatus?:string;connectionStatus?:string};
export type EchoShare={requestId:string;accountId:string;personaId:string;conversationId:string;memoryId?:string;memoryVersion?:number;payloadJSON?:string;hasPayload?:boolean;payloadHash:string;content?:string;epistemicType:string;status:string;candidateId?:string;candidateStatus?:string;promotedFactId?:string;createdAt:string;updatedAt:string};
export type EchoState={config:EchoConfig;cacheAvailable?:boolean;snapshot?:{id:string;fetchedAt:string;expiresAt:string;status:string;complete:boolean;truncated:boolean;query:string};coverage?:{complete:boolean;truncated:boolean;status:string;reasons:string[];returned_count:number;matched_count:number};shares:EchoShare[]};
export const nativeMemoryProcessingMethods=["ai.memoryProcessingGet","ai.memoryProcessingConfigure","ai.memoryProcess","ai.memoryProcessingRetry","ai.memoryProcessingCancel","ai.memoryProposalReview","ai.memoryConversationEnded"] as const;
export type MemoryProcessingConfig={accountId:string;personaId:string;automatic:boolean;threshold:number;onConversationEnd:boolean;modelMode:"persona"|"dedicated";providerId?:string;modelId?:string};
export type MemoryAttempt={startedAt:string;finishedAt?:string;dispatched:boolean;status:string;usage:{inputTokens?:number;outputTokens?:number;cachedTokens?:number;source?:string};cost?:number};
export type MemoryJob={id:string;conversationId:string;personaId:string;status:string;trigger:string;messages:{id:string;ordinal:number;seq:number;hash:string}[];inputHash:string;provider:EvaProvider;model:EvaModel;providerKind:"api"|"subscription";attempts:MemoryAttempt[];summaryStatus?:string;result?:{summary:string};createdAt:string;updatedAt:string;error?:string};
export type MemoryProposal={id:string;taskId:string;status:string;reason:string;memory?:PersonaMemory;targetId?:string;targetVersion?:number;acceptedMemoryId?:string;updatedAt:string};
export type MemoryProcessingState={config:MemoryProcessingConfig;jobs:MemoryJob[];proposals:MemoryProposal[];requestCount:number;attempts:MemoryAttempt[]};
export const nativeMemoryMethods=["ai.memoryList","ai.memoryDetail","ai.memorySave","ai.memoryDelete","ai.memorySources","ai.assignConversationPersona","ai.exportBackup","ai.restoreBackup"] as const;
export type PersonaMemoryKind="experience"|"understanding"|"observation"|"commitment"|"ongoingTopic";
export type PersonaMemoryNature="userStatement"|"sharedExperience"|"personaObservation"|"promise";
export type PersonaMemorySource={conversationId:string;messageId?:string;excerpt:string};
export type PersonaMemory={id:string;accountId:string;personaId:string;kind:PersonaMemoryKind;content:string;importance:number;nature:PersonaMemoryNature;sources:PersonaMemorySource[];createdAt:string;updatedAt:string;version:number;status:"active"|"superseded"|"deleted";visibility?:"singleChat"|"allChats";expiredAt?:string;provenance?:{taskId:string;proposalId:string;providerId:string;modelId:string;confidence:number;eventTime?:string}};
export type EvaConversation={id:string;title:string;updatedAt:string;ownership?:"single"|"group"|"unresolved";personaId?:string};
export type EvaConversationModel={conversationId:string;personaId:string;providerId:string;modelId:string};
export const nativeDiscussionMethods=["ai.discussionControl","ai.discussionIntervene","ai.discussionSummarize"] as const;
export type EvaDiscussion={id:string;conversationId:string;status:"running"|"paused"|"interrupted"|"completed"|"ended"|"summarizing";roundsStarted:number;maxRounds:number;suspendedPersonaIds:string[];revision:number;error?:string};
export const evaIsBusy=(state:EvaState)=>Boolean(state.active||state.activeMessages?.length||state.discussions?.some(d=>d.status==="running"||d.status==="summarizing"));
export type EvaGroup={id:string;title:string;participants:ParlorPersona[];mode:"parallel"|"discussion";maxRounds?:number};
export type ParlorPersona={avatarDataURL?:string;id:string;name:string;chineseName:string;nickname:string;systemPrompt:string;preferredAddress:string;humor:"none"|"subtle"|"playful";formality:"casual"|"natural"|"formal";closeness:"reserved"|"warm"|"familiar";providerId?:string;modelId?:string};
export const sebastianIdentity={id:"sebastian",name:"Sebastian",chineseName:"塞巴斯蒂安",nickname:"赛巴斯酱"} as const;
export type EvaMessage={ordinal?:number;replyToMessageId?:string;contextSnapshotId?:string;contextBudget?:ContextBudget;contextCoverage?:ContextCoverage;discussionId?:string;discussionRound?:number;purpose?:"discussion"|"summary";roundId?:string;supersedesId?:string;personaAvatar?:string;id:string;conversationId:string;role:"user"|"assistant";content:string;status:"streaming"|"done"|"failed"|"cancelled"|"interrupted";createdAt:string;requestId?:string;providerId?:string;providerName?:string;personaId?:string;personaName?:string;model?:EvaModel;currency?:string;priceUpdatedAt?:string;usage?:{inputTokens?:number;outputTokens?:number;cachedTokens?:number;source:string};cost?:number;error?:string;seq:number;requestCount:number};
export type EvaState={messagePage?:MessagePage;conversation?:EvaConversation;unassignedConversations?:EvaConversation[];conversationModels?:EvaConversationModel[];discussions?:EvaDiscussion[];personas?:ParlorPersona[];groups?:EvaGroup[];activeMessages?:EvaMessage[];subscriptionConnected?:boolean;providers:EvaProvider[];persona:ParlorPersona;conversations:EvaConversation[];messages:EvaMessage[];active?:EvaMessage};
export type EvaEvent={accountId:string;conversationId:string;messageId:string;requestId:string;seq:number;eventType:"progress"|"terminal";message:EvaMessage};

export function acceptEvaEvent(raw:unknown,accountId:string,conversationId:string,messages:readonly EvaMessage[]):EvaMessage[]|null {
  if(!raw||typeof raw!=="object")return null;
  const e=raw as EvaEvent,m=e.message;
  if(e.accountId!==accountId||e.conversationId!==conversationId||!m||m.id!==e.messageId||m.requestId!==e.requestId||m.conversationId!==conversationId||m.role!=="assistant"||typeof m.content!=="string"||!Number.isSafeInteger(e.seq)||e.seq<1||m.seq!==e.seq||!['streaming','done','failed','cancelled','interrupted'].includes(m.status))return null;
  const current=messages.find(item=>item.id===m.id);
  if(current&&(current.requestId!==m.requestId||current.seq>=m.seq||current.status!=="streaming"))return null;
  // A snapshot supplies the user message and request identity before applying progress.
  if(!current)return null;
  return messages.map(item=>item.id===m.id?{...m,ordinal:m.ordinal??item.ordinal}:item);
}

export function evaCall<T>(accountId:string,method:typeof nativeEvaMethods[number]|typeof nativeCatalogMethods[number]|typeof nativeSubscriptionMethods[number]|typeof nativeGroupMethods[number]|typeof nativeDiscussionMethods[number]|typeof nativeConversationModelMethod|typeof nativeMemoryMethods[number]|typeof nativeMemoryProcessingMethods[number]|typeof nativeEchoMethods[number]|typeof nativeContextMethods[number],params:Record<string,unknown>={}) {
  return rawNativeCall<T>(method,{...params,accountId});
}

// Conversation choices take precedence; unavailable bindings never silently fall back.
export function evaModelBinding(state:EvaState,persona:Pick<ParlorPersona,"id"|"providerId"|"modelId">){
  const saved=state.conversationModels?.find(c=>c.personaId===persona.id),providerId=saved?.providerId??persona.providerId,modelId=saved?.modelId??persona.modelId;
  const choices=state.providers.filter(p=>p.enabled).flatMap(provider=>provider.models.map(model=>({provider,model,key:JSON.stringify([provider.id,model.id])})));
  return providerId&&modelId?choices.find(c=>c.provider.id===providerId&&c.model.id===modelId):choices[0];
}

export function mergeEvaMessages(older:readonly EvaMessage[],newer:readonly EvaMessage[]){const items=new Map(older.map(m=>[m.id,m]));for(const message of newer){const old=items.get(message.id);items.set(message.id,old&&old.seq>message.seq?old:{...message,ordinal:message.ordinal??old?.ordinal});}return [...items.values()].sort((a,b)=>(a.ordinal??Number.MAX_SAFE_INTEGER)-(b.ordinal??Number.MAX_SAFE_INTEGER));}
