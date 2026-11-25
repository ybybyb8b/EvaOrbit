import type {Task,Project,ProjectItem} from "./types";
export type WorkspaceKind="tasks"|"projects";
type Data={tasks:{tasks:Task[];complete:boolean};projects:{projects:Project[];items:ProjectItem[];complete:boolean}};
export type WorkspaceReadonlySnapshot={[K in WorkspaceKind]:{format:"eo-workspace-readonly-v1";kind:K;accountId:string;capturedAt:string;data:Data[K]}}[WorkspaceKind];
export const workspaceKinds:WorkspaceKind[]=["tasks","projects"];
const id=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>0;
const stamp=(v:unknown)=>typeof v==="string"&&v.length>10&&Number.isFinite(Date.parse(v));
const day=(v:unknown)=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const strings=(v:unknown)=>Array.isArray(v)&&v.every(x=>typeof x==="string");
const nullableText=(v:unknown)=>v===null||typeof v==="string";
function rows<T extends {id:number;createdAt:string;updatedAt:string}>(value:T[],max:number){if(!Array.isArray(value)||value.length>max||new Set(value.map(x=>x?.id)).size!==value.length||value.some(x=>!x||!id(x.id)||!stamp(x.createdAt)||!stamp(x.updatedAt)))throw new Error("Invalid workspace rows; previous cache preserved");}
export function validateWorkspaceSnapshot(value:WorkspaceReadonlySnapshot,accountId:string,kind:WorkspaceKind){
 const fail=()=>{throw new Error("Invalid or incomplete workspace snapshot; previous cache preserved");};
 if(!value||value.format!=="eo-workspace-readonly-v1"||value.accountId!==accountId||value.kind!==kind||!workspaceKinds.includes(kind)||!stamp(value.capturedAt)||!value.data||typeof value.data.complete!=="boolean")fail();
 if(value.kind==="tasks"){
  rows(value.data.tasks,1000);
  const rules=new Set<number>();
  for(const t of value.data.tasks){if(typeof t.title!=="string"||typeof t.notes!=="string"||typeof t.completed!=="boolean"||!strings(t.tags)||!["low","medium","high"].includes(t.priority)||(t.dueDate!==null&&!day(t.dueDate))||(t.dueTime!==null&&(!t.dueDate||!/^([01]\d|2[0-3]):[0-5]\d$/.test(t.dueTime)))||(t.completedAt!==null&&!stamp(t.completedAt))||!Array.isArray(t.reminders))fail();
   for(const r of t.reminders!){if(!id(r.id)||rules.has(r.id)||r.taskId!==t.id||!["absolute","relative"].includes(r.triggerType)||typeof r.repeatWhileOverdue!=="boolean"||!["pwa","apple_reminders"].includes(r.deliveryChannel)||typeof r.timezone!=="string"||!stamp(r.createdAt)||!stamp(r.updatedAt)||(r.absoluteDate!==null&&!day(r.absoluteDate))||(r.absoluteTime!==null&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.absoluteTime)))fail();rules.add(r.id);}
  }
 }else if(value.kind==="projects"){
  rows(value.data.projects,200);rows(value.data.items,5000);const parents=new Map(value.data.projects.map(p=>[p.id,p]));
  for(const p of value.data.projects)if(typeof p.name!=="string"||!nullableText(p.description)||!["active","paused","archived"].includes(p.status)||![p.doingCount,p.toSolveCount,p.ideaCount??0].every(n=>Number.isSafeInteger(n)&&n>=0))fail();
  for(const item of value.data.items){if(!parents.has(item.projectId)||typeof item.title!=="string"||!["feature","bug","ui","migration","research","tech_debt","other"].includes(item.type)||!["idea","to_solve","doing","blocked","done","verified","dropped"].includes(item.status))fail();for(const k of ["description","module","priority","nextStep","resolution"] as const)if(!nullableText(item[k]))fail();for(const k of ["startedAt","completedAt","verifiedAt"] as const)if(item[k]!==null&&!stamp(item[k]))fail();}
  if(value.data.complete)for(const p of value.data.projects){const own=value.data.items.filter(i=>i.projectId===p.id);if(own.filter(i=>i.status==="doing").length!==p.doingCount||own.filter(i=>i.status==="to_solve").length!==p.toSolveCount||own.filter(i=>i.status==="idea").length!==(p.ideaCount??0))fail();}
 }
 if(new TextEncoder().encode(JSON.stringify(value)).length>8*1024*1024)throw new Error("Workspace download exceeds 8 MiB; previous cache preserved");
 if(value.kind==="projects")return {...value,data:{...value.data,projects:value.data.projects.map(p=>({...p,ideaCount:p.ideaCount??0}))}};
 return value;
}
export function readWorkspaceSnapshot(snapshot:WorkspaceReadonlySnapshot,path:string,init?:RequestInit){
 if(init?.method&&init.method!=="GET")throw new Error("Workspace read-only adapter refused a write");
 if(!/^\/api\/[a-z-]+(?:\/[1-9][0-9]*)?/.test(path)||path.includes("#"))throw new Error("Workspace read-only path refused");
 const u=new URL(path,"https://offline.invalid");let data:unknown;const q=u.searchParams,query=q.get("q")?.trim().toLowerCase();
 const allowed=new Set(["status","q","tag","projectId","project","type","module","limit"]);
 const date=q.get("date");if([...q.keys()].some(k=>!allowed.has(k))||(date&&!day(date)))throw new Error("Workspace query refused");
 if(snapshot.kind==="tasks"&&u.pathname==="/api/tasks")data=snapshot.data.tasks.filter(t=>!q.get("status")||q.get("status")==="all"||t.completed===(q.get("status")==="done"));
 else if(snapshot.kind==="projects"){
  const m=/^\/api\/(projects|project-items)(?:\/([1-9][0-9]*))?$/.exec(u.pathname);if(!m)throw new Error("Workspace read-only path refused");
  if(m[1]==="projects")data=m[2]?snapshot.data.projects.find(p=>p.id===Number(m[2])):snapshot.data.projects;
  else data=m[2]?snapshot.data.items.find(i=>i.id===Number(m[2])):snapshot.data.items.filter(i=>(!q.get("projectId")||i.projectId===Number(q.get("projectId")))&&(!q.get("project")||snapshot.data.projects.find(p=>p.id===i.projectId)?.name===q.get("project"))&&(!q.get("status")||i.status===q.get("status"))&&(!q.get("type")||i.type===q.get("type"))&&(!q.get("module")||i.module===q.get("module"))&&(!query||[i.title,i.description,i.resolution].some(v=>v?.toLowerCase().includes(query))));
 }
 else throw new Error("Workspace read-only path refused");
 return new Response(JSON.stringify(data??{error:"Not in downloaded workspace snapshot"}),{status:data===undefined?404:200,headers:{"Content-Type":"application/json"}});
}
