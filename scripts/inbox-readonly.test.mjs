import assert from "node:assert/strict";
import test from "node:test";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import {buildInboxSnapshot,readInboxSnapshot,validateInboxSnapshot} from "../src/lib/inbox-readonly.ts";
const item={id:1,content:"Original inbox text\n# Literal content",status:"inbox",source:"manual",processedAt:null,convertedType:null,convertedId:null,createdAt:"2026-10-20T00:00:00Z",updatedAt:"2026-10-20T00:00:00Z"};
test("Inbox cache is bounded, preserves text and legacy references, and refuses writes",async()=>{
 const items=[item,{...item,id:2,status:"processed",processedAt:"2026-10-20T01:00:00Z",convertedType:"memory",convertedId:123},{...item,id:3,status:"archived"}];
 const value=buildInboxSnapshot("a",items);assert.deepEqual(value.items,items);assert.equal(validateInboxSnapshot(value,"a"),value);
 assert.equal(buildInboxSnapshot("a",Array.from({length:501},(_,i)=>({...item,id:i+1}))).items.length,500);
 for(const status of ["inbox","processed","archived","all"])assert.deepEqual(await readInboxSnapshot(value,"/api/inbox?status="+status).json(),items.filter(i=>status==="all"||i.status===status));
 for(const broken of [{...value,accountId:"b"},{...value,items:[item,item]},{...value,items:[{...item,status:"invalid"}]},{...value,items:[{...item,processedAt:"unknown"}]},{...value,items:[{...item,convertedId:0}]},{...value,items:[{...item,content:"x".repeat(10001)}]}])assert.throws(()=>validateInboxSnapshot(broken,"a"));
 assert.throws(()=>validateInboxSnapshot({...value,extra:"x".repeat(8*1024*1024)},"a"),/limit/);
 for(const method of ["POST","PATCH","PUT","DELETE"])assert.throws(()=>readInboxSnapshot(value,"/api/inbox?status=all",{method}));
 for(const url of ["/api/inbox","/api/inbox/1","/api/inbox/1/convert","https://evil.invalid/api/inbox?status=all","/api/inbox?status=all&status=inbox","/api/inbox?status=invalid"])assert.throws(()=>readInboxSnapshot(value,url));
});
test("Actual Inbox list/detail service does not process, convert, notify or write business tables",()=>{
 const directory=mkdtempSync(path.join(tmpdir(),"eo-inbox-readonly-"));
 try{
  const result=spawnSync(process.execPath,["--experimental-loader",pathToFileURL(path.resolve("scripts/typescript-test-loader.mjs")).href,"--input-type=module","--eval",String.raw`
   import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
   import {getRepository} from './src/lib/repositories/index.ts';import {listInbox,getInbox} from './src/lib/services/inbox.ts';
   const r=await getRepository();const a=await r.createInboxItem({content:'Unsorted canary',source:'manual'}),b=await r.createInboxItem({content:'Legacy canary',source:'chatgpt'}),c=await r.createInboxItem({content:'Archive canary',source:'import'});
   await r.updateInboxItem(b.id,{status:'processed',processedAt:'2026-10-20T00:00:00Z',convertedType:'memory',convertedId:999});await r.updateInboxItem(c.id,{status:'archived'});
   const original=await listInbox('all');const db=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
   for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all())for(const op of ['INSERT','UPDATE','DELETE'])db.exec('CREATE TRIGGER "inbox_no_'+op+'_'+name+'" BEFORE '+op+' ON "'+name+'" BEGIN SELECT RAISE(ABORT,\'Readonly wrote business data\'); END;');
   assert.equal((await listInbox('all')).length,3);assert.deepEqual(await getInbox(a.id),a);
   for(const status of ['inbox','processed','archived'])assert.deepEqual(await listInbox(status),original.filter(i=>i.status===status));
   assert.deepEqual(await listInbox('all'),original);assert.equal((await getInbox(b.id)).convertedId,999);db.close();
  `],{encoding:"utf8",env:{...process.env,EVAORBIT_DATA_BACKEND:"sqlite",EVAORBIT_SQLITE_PATH:path.join(directory,"fixture.db"),VERCEL:""}});
  assert.equal(result.status,0,result.stderr||result.stdout);
 }finally{rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});
