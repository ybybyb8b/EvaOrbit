import {useLocalInitialPath} from "./routes";
import {createContext,useContext,useCallback,useEffect,useMemo,useState,type ComponentProps} from "react";
import {TasksContent} from "@/app/tasks/tasks-content";
import {ProjectsView} from "@/app/projects/projects-view";
import {ProjectDetailView} from "@/app/projects/[id]/project-detail-view";
import {ProjectItemDetailView} from "@/app/projects/[id]/items/[itemId]/project-item-detail-view";
import {LuciusProfile} from "@/app/lucius/lucius-profile";
import {DiaryView} from "@/app/lucius/diary/diary-view";
import {DiaryDetailContent} from "@/app/lucius/diary/[id]/diary-detail-content";
import {CasesView} from "@/app/lucius/cases/cases-view";
import {CaseDetailContent} from "@/app/lucius/cases/[id]/case-detail-content";
import {WorkspaceDataProvider,type WorkspaceRead} from "@/components/workspace-data-context";
import {OnlineForms as FormPreview,useOnlineReader,onlineBusinessChanged} from "./online-business";
import {LocalDownloadStatus} from "./download-status";
import {ErrorNotice} from "@/components/error-notice";
import {PageLoading} from "@/components/page-loading";
import {readWorkspaceSnapshot,type WorkspaceKind,type WorkspaceReadonlySnapshot} from "@/lib/workspace-readonly";
import {LocalBackAction} from "./navigation-header";
import type {LocalAccount,TrackerPlatform} from "./platform";
const Navigate=createContext<(path:string)=>void>(()=>{});
function LocalLink({href,onClick,children,...props}:ComponentProps<"a">&{href:string}){const navigate=useContext(Navigate);return <a {...props} href={href} onClick={e=>{onClick?.(e);if(!e.defaultPrevented){e.preventDefault();navigate(href);}}}>{children}</a>;}
function Screen({snapshot,path,navigate}:{snapshot:WorkspaceReadonlySnapshot;path:string;navigate:(path:string)=>void}){
 const url=useMemo(()=>new URL(path,"https://offline.invalid"),[path]);
 const id=Number(url.pathname.split("/")[2]),itemId=Number(url.pathname.split("/")[4]);
 const items=useMemo(()=>snapshot.kind==="projects"?snapshot.data.items.filter(item=>item.projectId===id):[],[snapshot,id]);
 if(snapshot.kind==="tasks")return <TasksContent params={url.searchParams}/>;
 if(snapshot.kind==="projects"){
  const project=snapshot.data.projects.find(p=>p.id===id),item=items.find(i=>i.id===itemId);
  return url.pathname==="/projects"?<ProjectsView initial={snapshot.data.projects}/>:project?itemId?item?<ProjectItemDetailView key={item.id} project={project} initial={item} modules={items.map(i=>i.module)}/>:<p>Item not downloaded.</p>:<ProjectDetailView key={project.id} initialProject={project} initialItems={items}/>:<p>Project not downloaded.</p>;
 }
 const d=snapshot.data;
 if(url.pathname==="/lucius")return <LuciusProfile now={Date.parse(snapshot.capturedAt)} tab={url.searchParams.get("tab")==="diary"?"diary":url.searchParams.get("tab")==="cases"?"cases":"posts"} state={d.state} posts={d.posts} diaryEntries={d.diary} cases={d.cases} comments={d.comments}/>;
 const recordId=Number(url.pathname.split("/")[3]);
 if(url.pathname.startsWith("/lucius/diary")){const item=d.diary.find(e=>e.id===recordId);return recordId?item?<DiaryDetailContent key={item.id} initial={item} navigate={navigate}/>:<p>Diary entry not downloaded.</p>:<DiaryView initial={d.diary}/>;}
 const item=d.cases.find(c=>c.id===recordId);return recordId?item?<CaseDetailContent key={item.id} initial={item} navigate={navigate}/>:<p>Case not downloaded.</p>:<CasesView initial={d.cases.filter(c=>["serving","probation"].includes(c.status))}/>;
}
export function ReadOnlyWorkspace({kind,account,platform}:{kind:WorkspaceKind;account:LocalAccount;platform:TrackerPlatform}){
 const [snapshot,setSnapshot]=useState<WorkspaceReadonlySnapshot|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(true),[path,setPath]=useState(useLocalInitialPath("/"+kind)),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let alive=true,running=false;
  async function refresh(){if(running)return;running=true;if(alive)setBusy(true);try{const next=await platform.workspaceSnapshot(account,kind,true);if(alive&&next){setSnapshot(next);setError("");}}catch(e){if(alive)setError(e instanceof Error?e.message:"Download failed; previous data preserved");}finally{running=false;if(alive)setBusy(false);}}
  void platform.workspaceSnapshot(account,kind).then(value=>{if(alive)setSnapshot(value);}).catch(e=>{if(alive)setError(String(e));}).finally(()=>{if(alive)void refresh();});
  const active=(event:Event)=>{const detail=(event as CustomEvent).detail;if(event.type===onlineBusinessChanged&&detail?.accountId!==account.accountId)return;if(event.type===onlineBusinessChanged&&detail?.snapshotUpdated&&detail?.resource===kind){void platform.workspaceSnapshot(account,kind).then(value=>{if(alive&&value){setSnapshot(value);setError("");}}).catch(()=>{});return;}if(alive&&navigator.onLine)void refresh();};window.addEventListener(onlineBusinessChanged,active);window.addEventListener("online",active);window.addEventListener("evaorbit:native-active",active);return()=>{alive=false;window.removeEventListener(onlineBusinessChanged,active);window.removeEventListener("online",active);window.removeEventListener("evaorbit:native-active",active);};
 },[account,platform,kind,attempt]);
 const read=useOnlineReader(useCallback<WorkspaceRead>(async(url,init)=>{if(!snapshot)throw new Error("Workspace not downloaded");return readWorkspaceSnapshot(snapshot,url,init);},[snapshot]));
 function navigate(next:string){const u=new URL(next,"https://offline.invalid"),valid=kind==="tasks"?u.pathname==="/tasks":kind==="projects"?/^\/projects(?:\/[1-9][0-9]*(?:\/items\/[1-9][0-9]*)?)?$/.test(u.pathname):/^\/lucius(?:\/(?:diary|cases)(?:\/[1-9][0-9]*)?)?$/.test(u.pathname);if(!valid||u.origin!=="https://offline.invalid"){setError("This page is not downloaded");return;}setPath(u.pathname+u.search);window.scrollTo(0,0);}
 const pathname=path.split("?")[0];
 const back=pathname===`/${kind}`?undefined:kind==="projects"?()=>navigate(pathname.includes("/items/")?pathname.split("/items/")[0]:"/projects"):()=>navigate(pathname.split("/").length>3?pathname.split("/").slice(0,3).join("/"):`/lucius?tab=${pathname.endsWith("diary")?"diary":"cases"}`);
 const title=kind[0].toUpperCase()+kind.slice(1);
 return <><LocalBackAction onBack={back}/>{error&&<ErrorNotice>{error}</ErrorNotice>}
  {!snapshot?busy?<PageLoading title={title} englishTitle={title}/>:<div className="page"><p>{title} has not been downloaded. Connect and refresh to make it available offline.</p></div>:<Navigate.Provider value={navigate}><WorkspaceDataProvider read={read} Link={LocalLink}><FormPreview><Screen snapshot={snapshot} path={path} navigate={navigate}/></FormPreview></WorkspaceDataProvider></Navigate.Provider>}
  <div className="page local-workspace-status"><LocalDownloadStatus module={title} capturedAt={snapshot?.capturedAt} busy={busy} error={error} complete={snapshot?.data.complete} refresh={()=>setAttempt(n=>n+1)}/></div>
 </>;
}
