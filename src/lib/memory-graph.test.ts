import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseMemoryEntitySearch, parseMemoryFactPatch, parseNewMemoryFact, parseNewMemorySource } from "./memory-graph-validation.ts";

const id=(tail:string)=>`00000000-0000-4000-8000-${tail.padStart(12,"0")}`;

test("Memory Graph validation keeps object forms, validity, and immutable update shape explicit",()=>{
  assert.deepEqual(parseNewMemoryFact({subjectEntityId:id("1"),predicate:"prefers",objectValue:{drink:"tea"},confidence:.75,importance:4,validFrom:"2026-01-01",validTo:"2026-12-31"}).objectValue,{drink:"tea"});
  assert.throws(()=>parseNewMemoryFact({subjectEntityId:id("1"),predicate:"bad",objectEntityId:id("2"),objectValue:"both"}),/Exactly one/);
  assert.throws(()=>parseNewMemoryFact({subjectEntityId:id("1"),predicate:"bad",objectValue:null}),/Exactly one/);
  assert.throws(()=>parseNewMemoryFact({subjectEntityId:id("1"),predicate:"bad",objectValue:true,importance:2.5}),/integer/);
  assert.throws(()=>parseNewMemoryFact({subjectEntityId:id("1"),predicate:"bad",objectValue:true,validFrom:"2026-09-08",validTo:"2026-09-07"}),/earlier/);
  assert.throws(()=>parseMemoryFactPatch({predicate:"rewritten"}),/No Memory Fact fields/);
  assert.throws(()=>parseMemoryEntitySearch({includeMerged:"false"}),/boolean/);
  assert.equal(parseNewMemorySource({factId:id("3"),sourceResource:"chat",sourceRecordId:"0007"}).sourceRecordId,"0007");
  assert.throws(()=>parseNewMemorySource({factId:id("3"),sourceResource:"chat",sourceRecordId:7}),/sourceRecordId/);
});

test("Supabase and SQLite schemas define the same three owner-scoped graph resources",()=>{
  const postgres=readFileSync(new URL("../../supabase/migrations/202609070001_memory_graph.sql",import.meta.url),"utf8");
  const sqlite=readFileSync(new URL("./db.ts",import.meta.url),"utf8");
  const service=readFileSync(new URL("./services/memory-graph.ts",import.meta.url),"utf8");
  for(const table of ["memory_entities","memory_facts","memory_sources"]){
    assert.match(postgres,new RegExp(`create table if not exists public\\.${table}`));
    assert.match(sqlite,new RegExp(`CREATE TABLE ${table}`));
  }
  for(const source of [postgres,sqlite]){
    assert.match(source,/object_entity_id[\s\S]*object_value/);
    assert.match(source,/valid_to/);
    assert.match(source,/invalidated/);
    assert.match(source,/source_record_id TEXT/i);
  }
  assert.match(postgres,/security definer/);
  assert.match(postgres,/select count\(\*\) into v_redirected/);
  assert.match(postgres,/grant delete on public\.memory_sources/);
  assert.doesNotMatch(postgres,/grant delete on public\.memory_(entities|facts)/);
  assert.doesNotMatch(postgres,/grant update\([^)]*(subject_entity_id|object_entity_id|perspective_entity_id|merged_into_entity_id)/);
  assert.doesNotMatch(postgres,/unique[^\n]*canonical_name/i);
  assert.match(sqlite,/INSERT INTO migrations\(version\) VALUES\(39\)/);
  assert.equal(service.match(/id:randomUUID\(\)/g)?.length,3);
});
