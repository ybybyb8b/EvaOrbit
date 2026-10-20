import type {Memo} from "./types";

export type MemoReadonlySnapshot={format:"eo-memo-readonly-v1";accountId:string;capturedAt:string;items:Memo[];complete:boolean};
const validDay=(day:unknown)=>typeof day==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day;
const timestamp=(value:unknown)=>typeof value==="string"&&Number.isFinite(Date.parse(value));
export function validateMemoSnapshot(value:MemoReadonlySnapshot,accountId:string){
  const fail=()=>{throw new Error("Invalid or incomplete Memo snapshot; previous cache preserved");};
  if(!value||value.format!=="eo-memo-readonly-v1"||value.accountId!==accountId||!timestamp(value.capturedAt)||!Array.isArray(value.items)||value.items.length>100||value.complete!==(value.items.length<100))fail();
  const ids=new Set<number>();
  for(const item of value.items){
    if(!item||!Number.isSafeInteger(item.id)||item.id<=0||ids.has(item.id)||typeof item.title!=="string"||!item.title.trim()||item.title.length>300||typeof item.content!=="string"||!item.content.trim()||item.content.length>100000||!["basic","supplement","event","note"].includes(item.type)||!["active","merged","archived","historical"].includes(item.status)||!Array.isArray(item.tags)||item.tags.some(tag=>typeof tag!=="string")||item.eventDate!==null&&!validDay(item.eventDate)||item.confirmedAt!==null&&!timestamp(item.confirmedAt)||item.mergedIntoId!==null&&(!Number.isSafeInteger(item.mergedIntoId)||item.mergedIntoId<=0)||!timestamp(item.createdAt)||!timestamp(item.updatedAt))fail();
    ids.add(item.id);
  }
  if(new TextEncoder().encode(JSON.stringify(value)).length>8*1024*1024)throw new Error("Memo snapshot exceeds the acceptance limit; previous cache preserved");
  return value;
}
export function buildMemoSnapshot(accountId:string,items:Memo[]){
  return validateMemoSnapshot({format:"eo-memo-readonly-v1",accountId,capturedAt:new Date().toISOString(),items,complete:Array.isArray(items)&&items.length<100},accountId);
}
export function readMemoSnapshot(value:MemoReadonlySnapshot,path:string,init?:RequestInit){
  if(init?.method&&init.method!=="GET")throw new Error("Memo read-only adapter refused a write");
  const match=/^\/api\/memos(?:\/([1-9][0-9]*))?(?:\?([^#]*))?$/.exec(path);
  if(!match||match[1]&&match[2])throw new Error("Memo read-only path refused");
  const params=new URLSearchParams(match[2]??"");
  for(const key of params.keys())if(!["q","limit","tag","type","status"].includes(key)||params.getAll(key).length>1)throw new Error("Memo read-only query refused");
  if(params.has("limit")&&!["100","200"].includes(params.get("limit")!))throw new Error("Memo read-only limit refused");
  const query=(params.get("q")??"").trim().toLocaleLowerCase(),tag=params.get("tag"),type=params.get("type"),status=params.get("status");
  const data=match[1]?value.items.find(item=>item.id===Number(match[1])):value.items.filter(item=>(!query||item.title.toLocaleLowerCase().includes(query)||item.content.toLocaleLowerCase().includes(query))&&(!tag||item.tags.includes(tag))&&(!type||item.type===type)&&(!status||item.status===status));
  return new Response(JSON.stringify(data??{error:"Not in downloaded Memo snapshot"}),{status:data===undefined?404:200,headers:{"Content-Type":"application/json"}});
}
