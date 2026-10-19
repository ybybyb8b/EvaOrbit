import assert from "node:assert/strict";
import test from "node:test";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import {buildChronicleSnapshot,readChronicleSnapshot,validateChronicleSnapshot} from "../src/lib/chronicle-readonly.ts";
const entry={id:1,date:"2026-10-20",title:"Long title",contentMd:"\n# Unchanged Markdown\n",source:"chatgpt",createdAt:"2026-10-20T00:00:00Z",updatedAt:"2026-10-20T00:00:00Z"};
test("Chronicle snapshot preserves date/source/Markdown and refuses invalid/account/oversize data",async()=>{
 const value=buildChronicleSnapshot("a",[entry]);assert.equal(validateChronicleSnapshot(value,"a"),value);
 assert.equal(value.items[0].contentMd,entry.contentMd);assert.equal(value.complete,true);
 for(const broken of [{...value,accountId:"b"},{...value,items:[entry,entry]},{...value,complete:false},{...value,items:[{...entry,date:"2026-02-30"}]},{...value,items:[{...entry,source:"ai"}]},{...value,items:[{...entry,contentMd:" "}]}])assert.throws(()=>validateChronicleSnapshot(broken,"a"));
 assert.throws(()=>validateChronicleSnapshot({...value,extra:"x".repeat(8*1024*1024)},"a"),/limit/);
 assert.equal(buildChronicleSnapshot("a",Array.from({length:100},(_,i)=>({...entry,id:i+1}))).complete,false);
 assert.throws(()=>buildChronicleSnapshot("a",Array.from({length:101},(_,i)=>({...entry,id:i+1}))));
 assert.deepEqual(await readChronicleSnapshot(value,"/api/chronicle?q=unchanged&limit=100").json(),[entry]);
 assert.deepEqual(await readChronicleSnapshot(value,"/api/chronicle?q=absent&limit=100").json(),[]);
 assert.equal(readChronicleSnapshot(value,"/api/chronicle/2").status,404);
 for(const method of ["POST","PATCH","PUT","DELETE"])assert.throws(()=>readChronicleSnapshot(value,"/api/chronicle",{method}));
 for(const url of ["https://evil.invalid/api/chronicle","/api/chronicle/../session","/api/chronicle?limit=500","/api/chronicle/1?q=x&limit=100"])assert.throws(()=>readChronicleSnapshot(value,url));
});
test("Actual Chronicle service list/detail reads cannot write any business table",()=>{
 const directory=mkdtempSync(path.join(tmpdir(),"eo-chronicle-readonly-"));
 try{
  const result=spawnSync(process.execPath,["--experimental-loader",pathToFileURL(path.resolve("scripts/typescript-test-loader.mjs")).href,"--input-type=module","--eval",String.raw`
   import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
   import {getRepository} from './src/lib/repositories/index.ts';import {listChronicle,getChronicleEntry} from './src/lib/services/chronicle.ts';
   const r=await getRepository();const entry=await r.createChronicleEntry({date:'2026-10-20',title:'Archive',contentMd:'# Untouched',source:'manual'});
   const db=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
   for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all())for(const op of ['INSERT','UPDATE','DELETE'])db.exec('CREATE TRIGGER "chronicle_no_'+op+'_'+name+'" BEFORE '+op+' ON "'+name+'" BEGIN SELECT RAISE(ABORT,\'Readonly wrote business data\'); END;');
   assert.deepEqual(await listChronicle({limit:100}),[entry]);assert.deepEqual(await getChronicleEntry(entry.id),entry);
   assert.deepEqual(await listChronicle({query:'Untouched',limit:100}),[entry]);db.close();
  `],{encoding:"utf8",env:{...process.env,EVAORBIT_DATA_BACKEND:"sqlite",EVAORBIT_SQLITE_PATH:path.join(directory,"fixture.db"),VERCEL:""}});
  assert.equal(result.status,0,result.stderr||result.stdout);
 }finally{rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});
