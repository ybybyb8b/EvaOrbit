import {rawNativeCall,type NativeHostInfo} from "./native-bridge.ts";

export const nativeEvaEvent="evaorbit:ai";
export const nativeEvaMethods=["ai.getState","ai.saveProvider","ai.deleteProvider","ai.send","ai.cancel","ai.deleteConversation","ai.savePersona"] as const;
export const supportsNativeEva=(info:NativeHostInfo|null)=>nativeEvaMethods.every(method=>info?.methods?.includes(method));
export type EvaModel={id:string;name:string;inputPrice?:number;outputPrice?:number;cachedInputPrice?:number};
export type EvaProvider={id:string;name:string;baseURL:string;models:EvaModel[];enabled:boolean;currency:string;priceUpdatedAt:string;hasKey?:boolean};
export type ParlorPersona={id:string;name:string;chineseName:string;nickname:string;systemPrompt:string;preferredAddress:string;humor:"none"|"subtle"|"playful";formality:"casual"|"natural"|"formal";closeness:"reserved"|"warm"|"familiar";providerId?:string;modelId?:string};
export const sebastianIdentity={id:"sebastian",name:"Sebastian",chineseName:"塞巴斯蒂安",nickname:"赛巴斯酱"} as const;
export type EvaMessage={id:string;conversationId:string;role:"user"|"assistant";content:string;status:"streaming"|"done"|"failed"|"cancelled"|"interrupted";createdAt:string;requestId?:string;providerId?:string;providerName?:string;personaId?:string;personaName?:string;model?:EvaModel;currency?:string;priceUpdatedAt?:string;usage?:{inputTokens?:number;outputTokens?:number;cachedTokens?:number;source:string};cost?:number;error?:string;seq:number;requestCount:number};
export type EvaState={providers:EvaProvider[];persona:ParlorPersona;conversations:{id:string;title:string;updatedAt:string}[];messages:EvaMessage[];active?:EvaMessage};
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

export function evaCall<T>(accountId:string,method:typeof nativeEvaMethods[number],params:Record<string,unknown>={}) {
  return rawNativeCall<T>(method,{...params,accountId});
}
