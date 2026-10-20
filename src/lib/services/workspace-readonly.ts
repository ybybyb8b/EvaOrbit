import "server-only";
import {withWorkspaceReadOnlyRepository} from "../repositories";
import {listTasks} from "./task";
import {listProjects,listProjectItems} from "./project";
import {getLuciusState,listLuciusPosts,listLuciusPostComments,listLuciusDiaryEntries,listLuciusCases} from "./lucius";
import {validateWorkspaceSnapshot,type WorkspaceKind,type WorkspaceReadonlySnapshot} from "../workspace-readonly";
export async function getWorkspaceReadonlySnapshot(accountId:string,kind:WorkspaceKind){return withWorkspaceReadOnlyRepository(async()=>{
 const base={format:"eo-workspace-readonly-v1" as const,accountId,capturedAt:new Date().toISOString()};let snapshot:WorkspaceReadonlySnapshot;
 if(kind==="tasks"){const all=await listTasks("all");snapshot={...base,kind,data:{tasks:all.slice(0,1000),complete:all.length<1000}};}
 else if(kind==="projects"){const projects=await listProjects({limit:200}),parts=await Promise.all(projects.map(project=>listProjectItems({projectId:project.id,limit:200})));snapshot={...base,kind,data:{projects,items:parts.flat(),complete:projects.length<200&&parts.every(part=>part.length<200)}};}
 else {const [state,posts,diary,cases]=await Promise.all([getLuciusState(),listLuciusPosts({limit:50}),listLuciusDiaryEntries({limit:100}),listLuciusCases({limit:100})]);const comments=posts.length?await listLuciusPostComments({postIds:posts.map(p=>p.id),limit:500}):[];snapshot={...base,kind,data:{state,posts,diary,cases,comments,complete:posts.length<50&&diary.length<100&&cases.length<100&&comments.length<500}};}
 return validateWorkspaceSnapshot(snapshot,accountId,kind);
});}
