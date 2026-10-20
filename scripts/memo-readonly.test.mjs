import assert from "node:assert/strict";
import test from "node:test";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import {buildMemoSnapshot,readMemoSnapshot,validateMemoSnapshot} from "../src/lib/memo-readonly.ts";
const entry={id:1,eventDate:null,confirmedAt:null,mergedIntoId:null,tags:["offline"],type:"note",status:"active",title:"Long title",content:"\n# Unchanged Markdown\n",createdAt:"2026-10-20T00:00:00Z",updatedAt:"2026-10-20T00:00:00Z"};
test("Memo snapshot preserves date/type/status/content and refuses invalid/account/oversize data",async()=>{
 const value=buildMemoSnapshot("a",[entry]);assert.equal(validateMemoSnapshot(value,"a"),value);
 assert.equal(value.items[0].content,entry.content);assert.equal(value.complete,true);
 for(const broken of [{...value,accountId:"b"},{...value,items:[entry,entry]},{...value,complete:false},{...value,items:[{...entry,eventDate:"2026-02-30"}]},{...value,items:[{...entry,status:"invalid"}]},{...value,items:[{...entry,content:" "}]}])assert.throws(()=>validateMemoSnapshot(broken,"a"));
 assert.throws(()=>validateMemoSnapshot({...value,extra:"x".repeat(8*1024*1024)},"a"),/limit/);
 assert.equal(buildMemoSnapshot("a",Array.from({length:100},(_,i)=>({...entry,id:i+1}))).complete,false);
 assert.throws(()=>buildMemoSnapshot("a",Array.from({length:101},(_,i)=>({...entry,id:i+1}))));
 assert.deepEqual(await readMemoSnapshot(value,"/api/memos?q=unchanged&limit=100").json(),[entry]);
 assert.deepEqual(await readMemoSnapshot(value,"/api/memos?q=absent&limit=100").json(),[]);
 assert.equal(readMemoSnapshot(value,"/api/memos/2").status,404);
 assert.deepEqual(await readMemoSnapshot(value,"/api/memos?limit=200&tag=offline&type=note&status=active").json(),[entry]);
 assert.deepEqual(await readMemoSnapshot(value,"/api/memos?limit=100&status=archived").json(),[]);
 for(const method of ["POST","PATCH","PUT","DELETE"])assert.throws(()=>readMemoSnapshot(value,"/api/memos",{method}));
 for(const url of ["https://evil.invalid/api/memos","/api/memos/../session","/api/memos?limit=500","/api/memos/1?q=x&limit=100"])assert.throws(()=>readMemoSnapshot(value,url));
});
test("Actual Memo service list/detail reads cannot write any business table",()=>{
 const directory=mkdtempSync(path.join(tmpdir(),"eo-memo-readonly-"));
 try{
  const result=spawnSync(process.execPath,["--experimental-loader",pathToFileURL(path.resolve("scripts/typescript-test-loader.mjs")).href,"--input-type=module","--eval",String.raw`
   import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
   import {parseNewMemo} from './src/lib/validation.ts';import {getRepository} from './src/lib/repositories/index.ts';import {listMemos,getMemo} from './src/lib/services/memo.ts';
   const r=await getRepository();const entry=await r.createMemo(parseNewMemo({eventDate:null,confirmedAt:null,mergedIntoId:null,tags:['offline'],type:'note',status:'active',title:'Archive',content:'# Untouched'}));
   const db=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
   for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all())for(const op of ['INSERT','UPDATE','DELETE'])db.exec('CREATE TRIGGER "memo_no_'+op+'_'+name+'" BEFORE '+op+' ON "'+name+'" BEGIN SELECT RAISE(ABORT,\'Readonly wrote business data\'); END;');
   assert.deepEqual(await listMemos({limit:100}),[entry]);assert.deepEqual(await getMemo(entry.id),entry);
   assert.deepEqual(await listMemos({query:'Untouched',limit:100}),[entry]);db.close();
  `],{encoding:"utf8",env:{...process.env,EVAORBIT_DATA_BACKEND:"sqlite",EVAORBIT_SQLITE_PATH:path.join(directory,"fixture.db"),VERCEL:""}});
  assert.equal(result.status,0,result.stderr||result.stdout);
 }finally{rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});
