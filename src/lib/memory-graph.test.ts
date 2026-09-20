import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseMemoryEntitySearch, parseMemoryFactPatch, parseMemorySourceDraft, parseNewMemoryFact, parseNewMemorySource } from "./memory-graph-validation.ts";

const id=(tail:string)=>`00000000-0000-4000-8000-${tail.padStart(12,"0")}`;

test("Memory Graph validation keeps object forms, validity, and immutable update shape explicit",()=>{
  const fact=parseNewMemoryFact({subjectEntityId:id("1"),predicate:"prefers",objectValue:{drink:"tea"},epistemicType:"direct_statement",supersedesFactId:id("9"),confidence:.75,importance:4,validFrom:"2026-01-01",validTo:"2026-12-31"});
  assert.deepEqual(fact.objectValue,{drink:"tea"});
  assert.equal(fact.epistemicType,"direct_statement");
  assert.equal(fact.supersedesFactId,id("9"));
  assert.throws(()=>parseNewMemoryFact({subjectEntityId:id("1"),predicate:"bad",objectEntityId:id("2"),objectValue:"both"}),/Exactly one/);
  assert.throws(()=>parseNewMemoryFact({subjectEntityId:id("1"),predicate:"bad",objectValue:null}),/Exactly one/);
  assert.throws(()=>parseNewMemoryFact({subjectEntityId:id("1"),predicate:"bad",objectValue:true,importance:2.5}),/integer/);
  assert.throws(()=>parseNewMemoryFact({subjectEntityId:id("1"),predicate:"bad",objectValue:true,validFrom:"2026-09-08",validTo:"2026-09-07"}),/earlier/);
  assert.throws(()=>parseMemoryFactPatch({predicate:"rewritten"}),/No Memory Fact fields/);
  assert.throws(()=>parseMemoryEntitySearch({includeMerged:"false"}),/boolean/);
  assert.equal(parseNewMemorySource({factId:id("3"),sourceResource:"chat",sourceRecordId:"0007"}).sourceRecordId,"0007");
  assert.throws(()=>parseNewMemorySource({factId:id("3"),sourceResource:"chat",sourceRecordId:7}),/sourceRecordId/);
  assert.equal(parseMemorySourceDraft({sourceResource:"chat",excerpt:"姐姐亲口说的"}).excerpt,"姐姐亲口说的");
  assert.throws(()=>parseMemorySourceDraft({sourceResource:"chat"}),/needs a record id/);
});

test("Supabase and SQLite schemas define the v0.2 owner-scoped graph resources",()=>{
  const postgres=readFileSync(new URL("../../supabase/migrations/202609070001_memory_graph.sql",import.meta.url),"utf8");
  const postgresV02=readFileSync(new URL("../../supabase/migrations/202609200001_memory_graph_v02.sql",import.meta.url),"utf8");
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
  for(const source of [postgresV02,sqlite]){
    assert.match(source,/epistemic_type/i);
    assert.match(source,/supersedes_fact_id/i);
    assert.match(source,/memory_fact_candidates/i);
  }
  assert.match(postgresV02,/security definer/);
  assert.match(postgresV02,/write_memory_fact/);
  assert.match(postgresV02,/promote_memory_fact_candidate/);
  assert.match(sqlite,/INSERT INTO migrations\(version\) VALUES\(48\)/);
  assert.match(service,/recallMemory/);
  assert.match(service,/proposeMemoryFactCandidate/);
});
