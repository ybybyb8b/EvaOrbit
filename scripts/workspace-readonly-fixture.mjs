import {getRepository} from '../src/lib/repositories/index.ts';
import {createTask} from '../src/lib/services/task.ts';
import {parseNewTask,parseNewProjectItem,parseNewLuciusCase} from '../src/lib/validation.ts';
export async function seedWorkspaces(){
 const r=await getRepository();
 const task=await createTask(parseNewTask({title:'Offline task canary',notes:'Date only, not midnight',dueDate:'2026-10-20',dueTime:null,priority:'high',tags:['Canary']}));
 await createTask(parseNewTask({title:'Reminder task canary',notes:'Existing reminder only',dueDate:'2026-10-30',dueTime:'09:45',priority:'medium',tags:[],reminderMode:'at_due',timezone:'Asia/Shanghai'}));
 await createTask(parseNewTask({title:'No date task canary',notes:'Unscheduled',priority:'low',tags:[]}));
 const project=await r.createProject({name:'Offline Project',description:'Shared original UI',status:'active'});
 const item=await r.createProjectItem(parseNewProjectItem({projectId:project.id,title:'Doing item canary',description:'Literal <script> text',type:'feature',status:'doing',module:'Home',priority:'P1',nextStep:'Check offline',resolution:null}));
 await r.createProjectItem(parseNewProjectItem({projectId:project.id,title:'Verified item canary',description:'Verified remains separate from Done',type:'bug',status:'verified',module:'Core',priority:'P2',nextStep:null,resolution:'Confirmed canary'}));
 await r.updateLuciusState({status:'Reading quietly',mood:'composed'});
 const post=await r.createLuciusPost({content:'Lucius post canary <script>literal</script>',publishedAt:'2026-10-20T00:00:00Z'});
 await r.createLuciusPostComment({postId:post.id,author:'user',content:'User comment canary'});
 await r.createLuciusPostComment({postId:post.id,author:'lucius',content:'Lucius reply canary'});
 const trace={sourceSystem:null,sourceId:null,sourceUrl:null,importedAt:null};
 const diary=await r.createLuciusDiaryEntry({...trace,date:'2026-10-19',content:'Diary canary content <script>literal</script>',tags:['Canary']});
 const entry=await r.createLuciusCase(parseNewLuciusCase({title:'Case canary',errorType:'factual',severity:'minor',status:'serving',triggerScenes:['Canary'],cause:'Check the source',correctBehavior:'Read existing records',mandatoryRule:'No invented facts',firstOccurredDate:'2026-10-18',latestOccurredDate:'2026-10-19'}));
 await r.createLuciusCase(parseNewLuciusCase({title:'Archived case canary',errorType:'expression',severity:'moderate',status:'permanent_record',triggerScenes:[],cause:'Use clear language',correctBehavior:'Be concise',mandatoryRule:'Preserve semantics',firstOccurredDate:'2026-10-17'}));
 return {task,project,item,post,diary,entry};
}
