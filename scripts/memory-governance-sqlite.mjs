import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {spawn} from "node:child_process";
import * as graph from "../src/lib/db.ts";
import {assertLegacySourceCompatibility, legacyUnicodeSource, memoryGovernanceContract} from "./memory-governance-fixture.mjs";
const db=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
db.exec("PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;");
const adapter={
  entity:async(name)=>graph.createMemoryEntity({id:randomUUID(),canonicalName:name,entityType:"person",aliases:[],description:null,status:"active"}).id,
  submit:async(input)=>graph.submitMemoryFactCandidate(input),
  promote:async(id)=>graph.promoteMemoryFactCandidate(id,null),
  reject:async(id)=>graph.rejectMemoryFactCandidate(id,null),
  getFact:async(id)=>graph.getMemoryFact(id),
  patchFact:async(id,patch)=>graph.updateMemoryFact(id,patch),
  sources:async(id)=>graph.listMemorySources({factId:id,limit:200}),
  patchSource:async(id,patch)=>graph.updateMemorySource(id,patch),
  deleteSource:async(id)=>graph.deleteMemorySource(id),
  addSource:async(factId,source)=>graph.createMemorySource({id:randomUUID(),factId,...source}),
  restore:async(id)=>graph.restoreMemoryFact(id),
  invalidate:async(id)=>graph.invalidateMemoryFact(id,"test"),
  snapshot:async()=>Object.fromEntries(["memory_entities","memory_facts","memory_sources","memory_fact_candidates"].map(t=>[t,db.prepare("SELECT * FROM "+t+" ORDER BY id").all()])),
  failAt:async(table,operation)=>db.exec("CREATE TRIGGER injected BEFORE "+operation+" ON "+table+" BEGIN SELECT RAISE(ABORT,'injected failure'); END;"),
  clearFailure:async()=>db.exec("DROP TRIGGER injected"),
};
const legacyEntity = await adapter.entity("Legacy subject"), legacyFact = randomUUID();
db.prepare("INSERT INTO memory_facts(id,subject_entity_id,predicate,object_value) VALUES(?,?,'legacy','true')").run(legacyFact,legacyEntity);
// Reproduce pre-governance records as stored by a local backup restore.
db.prepare("INSERT INTO memory_sources(id,fact_id,source_resource,note) VALUES(?,?,'chat','Legacy chat'),(?,?,'manual','Legacy manual')")
  .run(randomUUID(),legacyFact,randomUUID(),legacyFact);
db.prepare("INSERT INTO memory_sources(id,fact_id,source_resource,source_record_id,source_url,excerpt,note) VALUES(?,?,?,?,?,?,?)")
  .run(randomUUID(), legacyFact, ...Object.values(legacyUnicodeSource));
await assertLegacySourceCompatibility(adapter, legacyFact);
const result=await memoryGovernanceContract(adapter);
assert.ok(db.prepare("SELECT 1 FROM migrations WHERE version=99").get());
assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
assert.equal(graph.createMemoryFact,undefined,"legacy direct write export removed");
const input={id:randomUUID(),requestId:randomUUID(),client:"test",writtenBy:"user",reviewMode:"user_confirmed",proposedBy:"user",proposerModel:null,
  proposedFact:{subjectEntityId:result.entity,predicate:"concurrent",objectEntityId:null,objectValue:"x",perspectiveEntityId:null,epistemicType:"direct_statement",supersedesFactId:null,confidence:1,importance:3,validFrom:null,validTo:null},
  proposedSources:[{sourceResource:"chat",sourceRecordId:null,sourceUrl:null,excerpt:"words",note:null}]};
const c=graph.submitMemoryFactCandidate(input);
graph.createMemorySource({id:randomUUID(),factId:c.promotedFactId,...input.proposedSources[0]});
const ids=graph.listMemorySources({factId:c.promotedFactId}).map(s=>s.id);
const exits=await Promise.all(ids.map(id=>new Promise(resolve=>{
  const child=spawn(process.execPath,["--experimental-loader",new URL("./typescript-test-loader.mjs",import.meta.url).href,"--input-type=module","--eval",
    "import {deleteMemorySource} from './src/lib/db.ts';try{deleteMemorySource('"+id+"')}catch{process.exitCode=2}"],{env:process.env,stdio:"ignore"});
  child.on("error",()=>resolve(-1));child.on("exit",resolve);
})));
assert.deepEqual(exits.sort(),[0,2]);
assert.equal(graph.listMemorySources({factId:c.promotedFactId}).length,1);
db.close();
