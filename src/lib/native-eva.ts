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
export const nativeDiscussionMethods=["ai.discussionControl","ai.discussionIntervene","ai.discussionSummarize"] as const;
export type EvaDiscussion={id:string;conversationId:string;status:"running"|"paused"|"interrupted"|"completed"|"ended"|"summarizing";roundsStarted:number;maxRounds:number;suspendedPersonaIds:string[];revision:number;error?:string};
export const evaIsBusy=(state:EvaState)=>Boolean(state.active||state.activeMessages?.length||state.discussions?.some(d=>d.status==="running"||d.status==="summarizing"));
export type EvaGroup={id:string;title:string;participants:ParlorPersona[];mode:"parallel"|"discussion";maxRounds?:number};
export type ParlorPersona={avatarDataURL?:string;id:string;name:string;chineseName:string;nickname:string;systemPrompt:string;preferredAddress:string;humor:"none"|"subtle"|"playful";formality:"casual"|"natural"|"formal";closeness:"reserved"|"warm"|"familiar";providerId?:string;modelId?:string};
export const sebastianIdentity={id:"sebastian",name:"Sebastian",chineseName:"塞巴斯蒂安",nickname:"赛巴斯酱"} as const;
export type EvaMessage={discussionId?:string;discussionRound?:number;purpose?:"discussion"|"summary";roundId?:string;supersedesId?:string;personaAvatar?:string;id:string;conversationId:string;role:"user"|"assistant";content:string;status:"streaming"|"done"|"failed"|"cancelled"|"interrupted";createdAt:string;requestId?:string;providerId?:string;providerName?:string;personaId?:string;personaName?:string;model?:EvaModel;currency?:string;priceUpdatedAt?:string;usage?:{inputTokens?:number;outputTokens?:number;cachedTokens?:number;source:string};cost?:number;error?:string;seq:number;requestCount:number};
export type EvaState={discussions?:EvaDiscussion[];personas?:ParlorPersona[];groups?:EvaGroup[];activeMessages?:EvaMessage[];subscriptionConnected?:boolean;providers:EvaProvider[];persona:ParlorPersona;conversations:{id:string;title:string;updatedAt:string}[];messages:EvaMessage[];active?:EvaMessage};
export type EvaEvent={accountId:string;conversationId:string;messageId:string;requestId:string;seq:number;eventType:"progress"|"terminal";message:EvaMessage};

export function acceptEvaEvent(raw:unknown,accountId:string,conversationId:string,messages:readonly EvaMessage[]):EvaMessage[]|null {
  if(!raw||typeof raw!=="object")return null;
  const e=raw as EvaEvent,m=e.message;
  if(e.accountId!==accountId||e.conversationId!==conversationId||!m||m.id!==e.messageId||m.requestId!==e.requestId||m.conversationId!==conversationId||m.role!=="assistant"||typeof m.content!=="string"||!Number.isSafeInteger(e.seq)||e.seq<1||m.seq!==e.seq||!['streaming','done','failed','cancelled','interrupted'].includes(m.status))return null;
  const current=messages.find(item=>item.id===m.id);
  if(current&&(current.requestId!==m.requestId||current.seq>=m.seq||current.status!=="streaming"))return null;
  // A snapshot supplies the user message and request identity before applying progress.
  if(!current)return null;
  return messages.map(item=>item.id===m.id?m:item);
}

export function evaCall<T>(accountId:string,method:typeof nativeEvaMethods[number]|typeof nativeCatalogMethods[number]|typeof nativeSubscriptionMethods[number]|typeof nativeGroupMethods[number]|typeof nativeDiscussionMethods[number],params:Record<string,unknown>={}) {
  return rawNativeCall<T>(method,{...params,accountId});
}
