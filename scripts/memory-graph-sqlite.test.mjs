import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { pathToFileURL } from "node:url";

test("SQLite Memory Graph supports parity queries and atomic lifecycle operations",()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"evaorbit-memory-graph-"));
  const databasePath=path.join(directory,"memory.db");
  try{
    const program=String.raw`
      import assert from "node:assert/strict";
      import { randomUUID } from "node:crypto";
      import * as graph from "./src/lib/db.ts";
      const entity=(canonicalName,aliases=[])=>graph.createMemoryEntity({id:randomUUID(),canonicalName,entityType:"person",aliases,description:null,status:"active"});
      const eva=entity("Eva",["Lucius"]),orbit=entity("EvaOrbit",["Orbit"]),observer=entity("Observer");
      assert.deepEqual(graph.listMemoryEntities({query:"lucius"}).map(item=>item.id),[eva.id]);
      const relation=graph.createMemoryFact({id:randomUUID(),subjectEntityId:eva.id,predicate:"maintains",objectEntityId:orbit.id,objectValue:null,perspectiveEntityId:observer.id,confidence:.9,importance:5,validFrom:"2026-01-01",validTo:"2026-12-31",status:"active"});
      const literal=graph.createMemoryFact({id:randomUUID(),subjectEntityId:orbit.id,predicate:"version",objectEntityId:null,objectValue:{major:1,label:"v0.1"},perspectiveEntityId:null,confidence:1,importance:3,validFrom:null,validTo:null,status:"active"});
      assert.equal(graph.listMemoryFacts({entityId:eva.id,direction:"out"})[0].id,relation.id);
      assert.equal(graph.listMemoryFacts({entityId:orbit.id,direction:"in",predicate:"maintains",perspectiveEntityId:observer.id,status:"active",validOn:"2026-09-07"})[0].id,relation.id);
      assert.equal(graph.listMemoryFacts({validOn:"2027-01-01"}).some(item=>item.id===relation.id),false);
      assert.deepEqual(graph.getMemoryFact(literal.id).objectValue,{major:1,label:"v0.1"});
      const source=graph.createMemorySource({id:randomUUID(),factId:relation.id,sourceResource:"external",sourceRecordId:"0007",sourceUrl:"https://example.com/evidence",excerpt:"Evidence",note:null});
      assert.equal(graph.listMemorySources({factId:relation.id})[0].id,source.id);
      assert.equal(graph.listMemorySources({sourceResource:"external",sourceRecordId:"0007"})[0].factId,relation.id);
      assert.equal(graph.invalidateMemoryFact(relation.id,"corrected").status,"invalidated");
      assert.equal(graph.invalidateMemoryFact(relation.id,"again"),null);
      assert.equal(graph.restoreMemoryFact(relation.id).status,"active");
      const merged=graph.mergeMemoryEntities(eva.id,orbit.id);
      assert.equal(merged.redirectedFacts,1);
      assert.equal(graph.getMemoryEntity(eva.id).mergedIntoEntityId,orbit.id);
      assert.equal(graph.getMemoryFact(relation.id).subjectEntityId,orbit.id);
      assert.equal(graph.getMemorySource(source.id).factId,relation.id);
      assert.equal(graph.updateMemoryEntity(eva.id,{description:"blocked"}),null);
      const crowded=entity("Crowded",Array.from({length:50},(_,index)=>"alias-"+index)),overflow=entity("Overflow");
      const before=graph.createMemoryFact({id:randomUUID(),subjectEntityId:overflow.id,predicate:"knows",objectEntityId:crowded.id,objectValue:null,perspectiveEntityId:null,confidence:1,importance:1,validFrom:null,validTo:null,status:"active"});
      assert.throws(()=>graph.mergeMemoryEntities(overflow.id,crowded.id),/50-alias/);
      assert.equal(graph.getMemoryEntity(overflow.id).status,"active");
      assert.equal(graph.getMemoryFact(before.id).subjectEntityId,overflow.id);
    `;
    const loader=pathToFileURL(path.join(process.cwd(),"scripts","typescript-test-loader.mjs")).href;
    const result=spawnSync(process.execPath,["--conditions=react-server","--experimental-loader",loader,"--input-type=module","--eval",program],{cwd:process.cwd(),encoding:"utf8",env:{...process.env,NODE_ENV:"development",EVAORBIT_DATA_BACKEND:"sqlite",EVAORBIT_SQLITE_PATH:databasePath,VERCEL:""}});
    assert.equal(result.status,0,result.stderr||result.stdout);
    const database=new DatabaseSync(databasePath,{readOnly:true});
    assert.ok(database.prepare("SELECT 1 FROM migrations WHERE version=39").get());
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(),[]);
    database.close();
  }finally{
    fs.rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:50});
  }
});
