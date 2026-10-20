import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

test('person advances exclude other participants, count linked repayments, and support both directions',()=>run(String.raw`
 const {alice,bob,advance}=await seedRelations();
 const {personOpenAdvances}=await import('./src/lib/relations.ts');
 const {getRelationPersonDetail,createRelationEvent,settleAdvance}=await import('./src/lib/services/relations.ts');
 let detail=await getRelationPersonDetail(alice.id);
 assert.deepEqual(personOpenAdvances(detail.events,alice.id).map(row=>[row.flow.id,row.outstanding]),[[advance.id,3000]]);
 const b=await getRelationPersonDetail(bob.id);assert.deepEqual(personOpenAdvances(b.events,bob.id).map(row=>row.outstanding),[4000]);
 assert.deepEqual(personOpenAdvances(detail.events,99999),[]);
 const when=detail.events[0].occurredAt;
 await settleAdvance(advance.id,{amountMinor:500,occurredAt:when,occurredHasExplicitTime:false,note:null});
 detail=await getRelationPersonDetail(alice.id);assert.equal(personOpenAdvances(detail.events,alice.id)[0].outstanding,2500);
 await settleAdvance(advance.id,{amountMinor:2500,occurredAt:when,occurredHasExplicitTime:false,note:null});
 detail=await getRelationPersonDetail(alice.id);assert.deepEqual(personOpenAdvances(detail.events,alice.id),[]);
 const reverse=await createRelationEvent({eventType:'expense',title:'Alice advanced for me',note:null,occurredAt:when,occurredHasExplicitTime:false,currency:'CNY',totalAmountMinor:5000,isInPerson:true,parties:[{key:'self',partyType:'self',personId:null,shareAmountMinor:2500,paidAmountMinor:0},{key:'a',partyType:'person',personId:alice.id,shareAmountMinor:2500,paidAmountMinor:5000}],items:[],flows:[{fromKey:'a',toKey:'self',flowType:'advance',amountMinor:2500,settlesFlowId:null,note:null}]});
 const thirdParty=await createRelationEvent({eventType:'expense',title:'Bob advanced for Alice',note:null,occurredAt:when,occurredHasExplicitTime:false,currency:'CNY',totalAmountMinor:9000,isInPerson:true,parties:[{key:'self',partyType:'self',personId:null,shareAmountMinor:3000,paidAmountMinor:3000},{key:'a',partyType:'person',personId:alice.id,shareAmountMinor:3000,paidAmountMinor:0},{key:'b',partyType:'person',personId:bob.id,shareAmountMinor:3000,paidAmountMinor:6000}],items:[],flows:[{fromKey:'b',toKey:'a',flowType:'advance',amountMinor:3000,settlesFlowId:null,note:null}]});
 detail=await getRelationPersonDetail(alice.id);assert.deepEqual(personOpenAdvances(detail.events,alice.id).map(row=>[row.flow.id,row.outstanding]),[[reverse.flows[0].id,2500]]);assert(!personOpenAdvances(detail.events,alice.id).some(row=>row.flow.id===thirdParty.flows[0].id));
`));

test('SQLite person PATCH preserves omitted fields/photo/archive and supports explicit clearing and direct callers',()=>run(String.raw`
 const {alice,carol}=await seedRelations();
 const {parseRelationPersonPatch}=await import('./src/lib/relations-validation.ts');
 const {updateRelationPerson,getRelationPersonDetail}=await import('./src/lib/services/relations.ts');
 const before=(await getRelationPersonDetail(alice.id)).person;
 const patch=parseRelationPersonPatch({name:'Alice updated',nickname:'Ali 2',relationLabel:'Colleague',closenessRank:3,relationshipStatus:'active',birthday:'2000-01-02',likes:'Tea',avoid:'Noise',note:'Profile updated'});
 const saved=await updateRelationPerson(alice.id,patch);
 assert.equal(saved.name,'Alice updated');assert.equal(saved.likes,'Tea');assert.equal(saved.photoPath,before.photoPath);assert.equal(saved.archivedAt,before.archivedAt);assert.equal(saved.birthday,'2000-01-02');
 const renamed=await updateRelationPerson(alice.id,parseRelationPersonPatch({name:'Alice renamed'}));
 for(const key of ['nickname','relationLabel','closenessRank','relationshipStatus','birthday','likes','avoid','note','photoPath','archivedAt'])assert.deepEqual(renamed[key],saved[key],key);
 const cleared=await updateRelationPerson(alice.id,parseRelationPersonPatch({nickname:null,birthday:null,likes:null,closenessRank:null}));
 for(const key of ['nickname','birthday','likes','closenessRank'])assert.equal(cleared[key],null,key);assert.equal(cleared.photoPath,before.photoPath);
 const direct=await updateRelationPerson(alice.id,{name:undefined,note:'Direct service patch',archivedAt:undefined});assert.equal(direct.name,'Alice renamed');assert.equal(direct.note,'Direct service patch');
 const archived=(await getRelationPersonDetail(carol.id)).person;
 const editedArchive=await updateRelationPerson(carol.id,parseRelationPersonPatch({note:'Archived profile edited'}));assert.equal(editedArchive.archivedAt,archived.archivedAt);
 const restored=await updateRelationPerson(carol.id,parseRelationPersonPatch({archivedAt:null}));assert.equal(restored.archivedAt,null);assert.equal(restored.name,archived.name);
 const ended=await updateRelationPerson(alice.id,parseRelationPersonPatch({relationshipStatus:'ended'}));assert.equal(ended.relationshipStatus,'ended');assert.equal(ended.photoPath,before.photoPath);
 const unknown=await updateRelationPerson(99999,parseRelationPersonPatch({name:'Missing'}));assert.equal(unknown,null);
`));

function run(program){
 const dir=mkdtempSync(path.join(tmpdir(),'eo-relations-regression-'));
 try{
  const result=spawnSync(process.execPath,['--experimental-loader',pathToFileURL(path.resolve('scripts/typescript-test-loader.mjs')).href,'--input-type=module','--eval',`import assert from 'node:assert/strict';import {seedRelations} from './scripts/relations-readonly-fixture.mjs';${program}`],{encoding:'utf8',env:{...process.env,EVAORBIT_DATA_BACKEND:'sqlite',EVAORBIT_SQLITE_PATH:path.join(dir,'test.db'),EVAORBIT_RELATION_PHOTO_DIR:path.join(dir,'photos'),VERCEL:''}});
  assert.equal(result.status,0,result.stderr||result.stdout);
 }finally{rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
}
