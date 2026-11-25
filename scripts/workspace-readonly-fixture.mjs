import {getRepository} from '../src/lib/repositories/index.ts';
import {createTask} from '../src/lib/services/task.ts';
import {parseNewTask,parseNewProjectItem} from '../src/lib/validation.ts';
export async function seedWorkspaces(){
 const r=await getRepository();
 const task=await createTask(parseNewTask({title:'Offline task canary',notes:'Date only, not midnight',dueDate:'2026-10-20',dueTime:null,priority:'high',tags:['Canary']}));
 await createTask(parseNewTask({title:'Reminder task canary',notes:'Existing reminder only',dueDate:'2026-10-30',dueTime:'09:45',priority:'medium',tags:[],reminderMode:'at_due',timezone:'Asia/Shanghai'}));
 await createTask(parseNewTask({title:'No date task canary',notes:'Unscheduled',priority:'low',tags:[]}));
 const project=await r.createProject({name:'Offline Project',description:'Shared original UI',status:'active'});
 const item=await r.createProjectItem(parseNewProjectItem({projectId:project.id,title:'Doing item canary',description:'Literal <script> text',type:'feature',status:'doing',module:'Home',priority:'P1',nextStep:'Check offline',resolution:null}));
 await r.createProjectItem(parseNewProjectItem({projectId:project.id,title:'Verified item canary',description:'Verified remains separate from Done',type:'bug',status:'verified',module:'Core',priority:'P2',nextStep:null,resolution:'Confirmed canary'}));
 return {task,project,item};
}
