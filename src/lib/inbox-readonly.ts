import type {InboxItem} from "./types";

export type InboxReadonlySnapshot={format:"eo-inbox-readonly-v1";accountId:string;capturedAt:string;items:InboxItem[]};
const timestamp=(value:unknown)=>typeof value==="string"&&Number.isFinite(Date.parse(value));
export function validateInboxSnapshot(value:InboxReadonlySnapshot,accountId:string){
  const fail=()=>{throw new Error("Invalid or incomplete Inbox snapshot; previous cache preserved");};
  if(!value||value.format!=="eo-inbox-readonly-v1"||value.accountId!==accountId||!timestamp(value.capturedAt)||!Array.isArray(value.items)||value.items.length>500)fail();
  const ids=new Set<number>();
  for(const item of value.items){
    if(!item||!Number.isSafeInteger(item.id)||item.id<=0||ids.has(item.id)||typeof item.content!=="string"||!item.content.trim()||item.content.length>10000||!["inbox","processed","archived"].includes(item.status)||typeof item.source!=="string"||item.processedAt!==null&&!timestamp(item.processedAt)||item.convertedType!==null&&typeof item.convertedType!=="string"||item.convertedId!==null&&(!Number.isSafeInteger(item.convertedId)||item.convertedId<=0)||!timestamp(item.createdAt)||!timestamp(item.updatedAt))fail();
    ids.add(item.id);
  }
  if(new TextEncoder().encode(JSON.stringify(value)).length>8*1024*1024)throw new Error("Inbox snapshot exceeds the acceptance limit; previous cache preserved");
  return value;
}
export function buildInboxSnapshot(accountId:string,items:InboxItem[]){
  if(!Array.isArray(items))throw new Error("Invalid Inbox response; previous cache preserved");
  return validateInboxSnapshot({format:"eo-inbox-readonly-v1",accountId,capturedAt:new Date().toISOString(),items:items.slice(0,500)},accountId);
}
export function readInboxSnapshot(value:InboxReadonlySnapshot,path:string,init?:RequestInit){
  if(init?.method&&init.method!=="GET")throw new Error("Inbox read-only adapter refused a write");
  const match=/^\/api\/inbox\?status=(inbox|processed|archived|all)$/.exec(path);
  if(!match)throw new Error("Inbox read-only path refused");
  const data=value.items.filter(item=>match[1]==="all"||item.status===match[1]);
  return new Response(JSON.stringify(data),{headers:{"Content-Type":"application/json"}});
}
