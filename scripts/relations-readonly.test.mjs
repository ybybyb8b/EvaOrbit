import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

test('Relations reads actual people/photos/notes/ledger without writes and refuses incomplete or corrupt balances',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'eo-relations-readonly-'));
 try{
  const result=spawnSync(process.execPath,['--experimental-loader',pathToFileURL(path.resolve('scripts/typescript-test-loader.mjs')).href,'--input-type=module','--eval',String.raw`
   import assert from 'node:assert/strict';
   import {DatabaseSync} from 'node:sqlite';
   import {seedRelations} from './scripts/relations-readonly-fixture.mjs';
   import {getRepository,withRelationsReadOnlyRepository} from './src/lib/repositories/index.ts';
   import {getRelationsReadonlySnapshot} from './src/lib/services/relations-readonly.ts';
   import {readRelationsSnapshot,validateRelationsSnapshot} from './src/lib/relations-readonly.ts';
   const {alice,bob,carol}=await seedRelations();
   const db=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
   for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all())for(const op of ['INSERT','UPDATE','DELETE'])db.exec('CREATE TRIGGER "rel_no_'+op+'_'+name+'" BEFORE '+op+' ON "'+name+'" BEGIN SELECT RAISE(ABORT,\'Relations readonly wrote business data\'); END;');
   const snapshot=await getRelationsReadonlySnapshot('a');
   assert.equal(snapshot.people.length,3);const a=snapshot.details.find(d=>d.person.id===alice.id),b=snapshot.details.find(d=>d.person.id===bob.id);
   assert.equal(a.balance.settlementMinor,3000);assert.equal(b.balance.settlementMinor,4000);assert.equal(a.balance.socialMinor,0);
   assert.equal(a.events.length,2);assert(a.events.every(e=>e.occurredHasExplicitTime===false));assert.match(a.person.photoPath,/^data:image\/png;base64,/);assert.match(a.memoryNotes[0].content,/<script>/);
   assert.equal((await readRelationsSnapshot(snapshot,'/api/relations/people').json()).length,2,'archived people stay hidden from the original list');
   assert.equal((await readRelationsSnapshot(snapshot,'/api/relations/people/'+carol.id).json()).person.name,'Carol Archived');
   assert.equal(readRelationsSnapshot(snapshot,'/api/relations/people/99999').status,404);
   for(const method of ['POST','PUT','PATCH','DELETE'])assert.throws(()=>readRelationsSnapshot(snapshot,'/api/relations/people',{method}),/refused a write/);
   assert.throws(()=>readRelationsSnapshot(snapshot,'/api/relations/people?includeArchived=true'),/path refused/);
   assert.throws(()=>validateRelationsSnapshot(snapshot,'b'),/cache preserved/);
   for(const change of [v=>v.people.push(v.people[0]),v=>v.details[0].balance.socialMinor++,v=>v.details[0].events[0].occurredHasExplicitTime=null,v=>v.people[0].photoPath='https://example.invalid/private.png',v=>v.details.pop(),v=>v.details[0].memoryNotes[0].personId=999]){const invalid=structuredClone(snapshot);change(invalid);assert.throws(()=>validateRelationsSnapshot(invalid,'a'));}
   await assert.rejects(withRelationsReadOnlyRepository(async()=>(await getRepository()).updateRelationPerson(alice.id,{name:'NO'})),/refused/);
   await assert.rejects(withRelationsReadOnlyRepository(async()=>(await getRepository()).createPersonMemoryNote(alice.id,'NO')),/refused/);
   for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'rel_no_%'").all())db.exec('DROP TRIGGER "'+name+'"');
   const r=await getRepository();
   for(let i=0;i<498;i++)await r.createRelationEvent({eventType:'interaction',title:'Bounded ledger '+i,note:null,occurredAt:snapshot.capturedAt,occurredHasExplicitTime:true,currency:'CNY',totalAmountMinor:null,isInPerson:false,parties:[{key:'self',partyType:'self',personId:null,shareAmountMinor:null,paidAmountMinor:null},{key:'a',partyType:'person',personId:alice.id,shareAmountMinor:null,paidAmountMinor:null}],items:[],flows:[]});
   await assert.rejects(getRelationsReadonlySnapshot('a'),/read limit/);
   db.close();
  `],{encoding:'utf8',env:{...process.env,EVAORBIT_DATA_BACKEND:'sqlite',EVAORBIT_SQLITE_PATH:path.join(dir,'test.db'),EVAORBIT_RELATION_PHOTO_DIR:path.join(dir,'photos'),VERCEL:''}});
  assert.equal(result.status,0,result.stderr||result.stdout);
 }finally{rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});
