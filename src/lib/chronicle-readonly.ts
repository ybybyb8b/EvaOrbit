import type {ChronicleEntry} from "./types";

export type ChronicleReadonlySnapshot={format:"eo-chronicle-readonly-v1";accountId:string;capturedAt:string;items:ChronicleEntry[];complete:boolean};
const validDay=(day:unknown)=>typeof day==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day;
const timestamp=(value:unknown)=>typeof value==="string"&&Number.isFinite(Date.parse(value));
export function validateChronicleSnapshot(value:ChronicleReadonlySnapshot,accountId:string){
  const fail=()=>{throw new Error("Invalid or incomplete Chronicle snapshot; previous cache preserved");};
  if(!value||value.format!=="eo-chronicle-readonly-v1"||value.accountId!==accountId||!timestamp(value.capturedAt)||!Array.isArray(value.items)||value.items.length>100||value.complete!==(value.items.length<100))fail();
  const ids=new Set<number>();
  for(const item of value.items){
    if(!item||!Number.isSafeInteger(item.id)||item.id<=0||ids.has(item.id)||!validDay(item.date)||typeof item.title!=="string"||!item.title.trim()||item.title.length>300||typeof item.contentMd!=="string"||!item.contentMd.trim()||item.contentMd.length>100000||!["manual","chatgpt"].includes(item.source)||!timestamp(item.createdAt)||!timestamp(item.updatedAt))fail();
    ids.add(item.id);
  }
  if(new TextEncoder().encode(JSON.stringify(value)).length>8*1024*1024)throw new Error("Chronicle snapshot exceeds the acceptance limit; previous cache preserved");
  return value;
}
export function buildChronicleSnapshot(accountId:string,items:ChronicleEntry[]){
  return validateChronicleSnapshot({format:"eo-chronicle-readonly-v1",accountId,capturedAt:new Date().toISOString(),items,complete:Array.isArray(items)&&items.length<100},accountId);
}
export function readChronicleSnapshot(value:ChronicleReadonlySnapshot,path:string,init?:RequestInit){
  if(init?.method&&init.method!=="GET")throw new Error("Chronicle read-only adapter refused a write");
  const match=/^\/api\/chronicle(?:\/([1-9][0-9]*))?(?:\?q=([^&]*)&limit=100)?$/.exec(path);
  if(!match||match[1]&&match[2]!==undefined)throw new Error("Chronicle read-only path refused");
  const query=decodeURIComponent(match[2]??"").toLocaleLowerCase();
  const data=match[1]?value.items.find(item=>item.id===Number(match[1])):value.items.filter(item=>!query||item.title.toLocaleLowerCase().includes(query)||item.contentMd.toLocaleLowerCase().includes(query));
  return new Response(JSON.stringify(data??{error:"Not in downloaded Chronicle snapshot"}),{status:data===undefined?404:200,headers:{"Content-Type":"application/json"}});
}
