import {appleReadFirstDay,appleDateInScope} from "./apple-read-scope.ts";
type WorkState={version:2;configuration?:string;cursor:string;checked:string[];excluded:string[];foregroundDone:boolean;retryAt:number;pending:number;retries:Record<string,{attempts:number;after:number}>};
const ownerKey="evaorbit.eventkit.account.v1";
export function eventKitWorkState(installationId:string,scope:string,sources:string[]){
 let owner:string|null=null;
 try{owner=typeof localStorage==="undefined"?null:localStorage.getItem(ownerKey);}catch{/* Storage is optional; successful server bindings remain durable. */}
 const key=owner?`evaorbit.eventkit.work.v1:${owner}:${installationId}:${scope}:${[...sources].sort().join(",")}`:null;
 let state:WorkState={version:2,cursor:appleReadFirstDay,checked:[],excluded:[],foregroundDone:false,retryAt:Date.now()+6*3600_000,pending:0,retries:{}};
 if(key)try{const saved=JSON.parse(localStorage.getItem(key)??"null");if(saved?.version===2&&typeof saved.cursor==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(saved.cursor)&&appleDateInScope(saved.cursor)&&Array.isArray(saved.checked)&&saved.checked.every((value:unknown)=>typeof value==="string"))state={...state,...saved,foregroundDone:saved.foregroundDone===true,retryAt:Number.isFinite(saved.retryAt)?saved.retryAt:state.retryAt,pending:Number.isSafeInteger(saved.pending)&&saved.pending>=0?saved.pending:0,retries:Object.fromEntries(Object.entries(saved.retries??{}).filter(([,v])=>{const r=v as {attempts?:number;after?:number};return r&&Number.isSafeInteger(r.attempts)&&Number.isFinite(r.after);})),excluded:Array.isArray(saved.excluded)?saved.excluded.filter((value:unknown)=>typeof value==="string"):[]};}catch{/* Invalid checkpoints restart without changing business data. */}
 return{state,persistent:Boolean(key),save(){if(!key)return;try{if(localStorage.getItem(ownerKey)!==owner)throw new Error("Account changed. Sync checkpoint was not saved.");localStorage.setItem(key,JSON.stringify(state));}catch(error){if(error instanceof Error&&error.message.startsWith("Account changed."))throw error;}}};
}
