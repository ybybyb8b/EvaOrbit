import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
test('Tasks/Projects/Lucius download original data without writes, preserve date-only/history and reject bad accounts/paths',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'eo-workspaces-'));
 try{const result=spawnSync(process.execPath,['--experimental-loader',pathToFileURL(path.resolve('scripts/typescript-test-loader.mjs')).href,'--input-type=module','--eval',String.raw`
  import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
  import {seedWorkspaces} from './scripts/workspace-readonly-fixture.mjs';
  import {getRepository,withWorkspaceReadOnlyRepository} from './src/lib/repositories/index.ts';
  import {getWorkspaceReadonlySnapshot} from './src/lib/services/workspace-readonly.ts';
  import {workspaceKinds,validateWorkspaceSnapshot,readWorkspaceSnapshot} from './src/lib/workspace-readonly.ts';
  const fixture=await seedWorkspaces(),r=await getRepository(),db=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
  // Historical empty free text remains readable without applying today's create requirements.
  await r.updateLuciusCase(fixture.entry.id,{cause:''});
  for(const table of ['tasks','task_reminders','reminders','projects','project_items','lucius_state','lucius_posts','lucius_post_comments','lucius_diary_entries','lucius_cases'])for(const op of ['INSERT','UPDATE','DELETE'])db.exec('CREATE TRIGGER no_'+table+'_'+op+' BEFORE '+op+' ON '+table+' BEGIN SELECT RAISE(ABORT,\'Business write forbidden\');END');
  const snapshots={};for(const kind of workspaceKinds){const s=await getWorkspaceReadonlySnapshot('a',kind);snapshots[kind]=s;assert.equal(s.kind,kind);assert.equal(s.data.complete,true);assert.throws(()=>validateWorkspaceSnapshot(s,'b',kind));assert.throws(()=>validateWorkspaceSnapshot(s,'a',kind==='tasks'?'projects':'tasks'));
   const route=kind==='lucius'?'/api/lucius/diary':'/api/'+kind;for(const method of ['POST','PATCH','PUT','DELETE'])assert.throws(()=>readWorkspaceSnapshot(s,route,{method}),/refused a write/);for(const url of ['/api/ai/settings','https://evil.invalid/api/tasks','/api/tasks/../ai','/api/lucius/posts/1/comments/2'])assert.throws(()=>readWorkspaceSnapshot(s,url));
   const bad=structuredClone(s);bad.data.complete=null;assert.throws(()=>validateWorkspaceSnapshot(bad,'a',kind));
  }
  assert.equal(snapshots.tasks.data.tasks.find(t=>t.id===fixture.task.id).dueTime,null);
  assert.equal((await readWorkspaceSnapshot(snapshots.tasks,'/api/tasks?status=open').json()).length,3);
  assert.equal(snapshots.tasks.data.tasks.find(t=>t.title==='Reminder task canary').reminders.length,1);
  assert.equal((await readWorkspaceSnapshot(snapshots.projects,'/api/project-items?projectId='+fixture.project.id).json()).length,2);
  assert.equal((await readWorkspaceSnapshot(snapshots.projects,'/api/project-items/'+fixture.item.id).json()).status,'doing');
  assert.equal((await readWorkspaceSnapshot(snapshots.lucius,'/api/lucius/cases?view=current').json()).length,1);
  assert.equal((await readWorkspaceSnapshot(snapshots.lucius,'/api/lucius/cases?view=all').json()).length,2);
  assert.equal((await readWorkspaceSnapshot(snapshots.lucius,'/api/lucius/posts/'+fixture.post.id+'/comments').json()).length,2);
  for(const [kind,mutate] of [['tasks',s=>s.data.tasks[0].dueDate='2026-02-30'],['tasks',s=>s.data.tasks[0].reminders=[{id:4,taskId:999}]],['projects',s=>s.data.items[0].projectId=999],['projects',s=>s.data.projects[0].doingCount++],['lucius',s=>s.data.comments[0].postId=999],['lucius',s=>s.data.diary[0].date='2026-02-30'],['lucius',s=>s.data.cases[0].occurrenceCount=-1]]){const bad=structuredClone(snapshots[kind]);mutate(bad);assert.throws(()=>validateWorkspaceSnapshot(bad,'a',kind));}
  for(const command of [r=>r.updateTask(fixture.task.id,{completed:true}),r=>r.updateProjectItem(fixture.item.id,{status:'done'}),r=>r.updateLuciusState({status:'NO'}),r=>r.createLuciusPostComment({postId:fixture.post.id,author:'user',content:'NO'}),r=>r.recordLuciusCaseRecurrence(fixture.entry.id,'2026-10-20')])await assert.rejects(withWorkspaceReadOnlyRepository(async()=>command(await getRepository())),/refused/);
  const large=structuredClone(snapshots.tasks);large.extra='x'.repeat(8*1024*1024);assert.throws(()=>validateWorkspaceSnapshot(large,'a','tasks'),/8 MiB/);
  db.close();
 `],{encoding:'utf8',env:{...process.env,EVAORBIT_DATA_BACKEND:'sqlite',EVAORBIT_SQLITE_PATH:path.join(dir,'data.db'),VERCEL:''}});assert.equal(result.status,0,result.stderr||result.stdout);}finally{rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});
