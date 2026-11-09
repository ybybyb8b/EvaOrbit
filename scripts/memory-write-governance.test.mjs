import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { assertLegacySourceCompatibility, legacyUnicodeSource, memoryGovernanceContract } from "./memory-governance-fixture.mjs";

test("SQLite governance, idempotency, correction chains, real competing deletes and injected rollback",()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),"eo-memory-governance-"));
  try {
    const loader=pathToFileURL(path.resolve("scripts/typescript-test-loader.mjs")).href;
    const result=spawnSync(process.execPath,["--conditions=react-server","--experimental-loader",loader,"scripts/memory-governance-sqlite.mjs"],{
      encoding:"utf8",timeout:60000,env:{...process.env,NODE_ENV:"development",VERCEL:"",EVAORBIT_DATA_BACKEND:"sqlite",EVAORBIT_SQLITE_PATH:path.join(dir,"test.db")}
    });
    assert.equal(result.status,0,result.stderr||result.stdout);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test("isolated PostgreSQL RPC governance, privileges, RLS and rollback parity",async()=>{
  const db=new PGlite(),owner=randomUUID(),other=randomUUID();
  const admin=async(sql)=>{await db.exec("reset role");try{return await db.exec(sql);}finally{await db.exec("set role authenticated");}};
  const query=async(sql,params=[])=>db.query(sql,params);
  const candidate=(r)=>r && ({id:r.id,status:r.status,promotedFactId:r.promoted_fact_id,reviewMode:r.review_mode,writtenBy:r.written_by,actor:r.actor,client:r.client,requestId:r.request_id});
  const source=(r)=>({id:r.id,factId:r.fact_id,sourceResource:r.source_resource,sourceRecordId:r.source_record_id,sourceUrl:r.source_url,excerpt:r.excerpt,note:r.note});
  try{
    await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);"+
      "insert into auth.users values('"+owner+"'),('"+other+"');"+
      "create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;"+
      "create function auth.jwt() returns jsonb language sql stable as $$select coalesce(current_setting(\'test.jwt\',true),\'{}\')::jsonb$$;"+
      "grant usage on schema auth to authenticated;create function public.set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end;$$;set test.uid='"+owner+"';");
    const loadMigration = (file) => db.exec(readFileSync(new URL("../supabase/migrations/"+file,import.meta.url),"utf8"));
    await loadMigration("202609070001_memory_graph.sql");
    await loadMigration("202609200001_memory_graph_v02.sql");
    await db.exec("set role authenticated");
    const legacyEntity = (await query("insert into memory_entities(canonical_name,entity_type) values('Legacy subject','person') returning id")).rows[0].id;
    const legacyFact = (await query("insert into memory_facts(subject_entity_id,predicate,object_value) values($1,'legacy','true') returning id",[legacyEntity])).rows[0].id;
    await query("insert into memory_sources(fact_id,source_resource,note) values($1,'chat','Legacy chat'),($1,'manual','Legacy manual')",[legacyFact]);
    await query("insert into memory_sources(fact_id,source_resource,source_record_id,source_url,excerpt,note) values($1,$2,$3,$4,$5,$6)",[legacyFact,...Object.values(legacyUnicodeSource)]);
    await db.exec("reset role");
    await loadMigration("202611070002_memory_write_governance.sql");
    await loadMigration("202611070003_memory_web_review.sql");
    await loadMigration("202611070004_memory_source_patch.sql");
    await loadMigration("202611070005_memory_source_unicode.sql");
    await loadMigration("202611070006_memory_user_confirmed_evidence.sql");
    const { chars } = (await query("select public.memory_source_whitespace() as chars")).rows[0];
    // Check the complete SQL set against JavaScript's trim semantics, including excluded code points.
    const jsWhitespace = Array.from({length: 0x10000}, (_, code) => String.fromCharCode(code)).filter(char => char.trim() === "").join("");
    assert.equal(chars, jsWhitespace);
    const { blank_record, blank_url, chat_excerpt, non_space } = (await query(
      "select public.memory_source_has_evidence('manual',$1,null,null) as blank_record," +
      " public.memory_source_has_evidence('manual',null,$2,null) as blank_url," +
      " public.memory_source_has_evidence($3,null,null,'quote') as chat_excerpt," +
      " public.memory_source_has_evidence('chat',null,null,$4) as non_space",
      [chars,"https://exam\uFEFFple.test",chars+"CHAT"+chars,"\u0085\u180E\u200B"],
    )).rows[0];
    assert.deepEqual([blank_record,blank_url,chat_excerpt,non_space],[false,false,true,true]);
    await db.query("select set_config(\'test.jwt\',$1,false)",[JSON.stringify({aud:"authenticated"})]);
    await db.exec("set role authenticated");
    const adapter={
      entity:async(name)=>(await query("insert into memory_entities(canonical_name,entity_type) values($1,'person') returning id",[name])).rows[0].id,
      submit:async(i)=>candidate((await query("select * from submit_memory_fact_candidate($1,$2,$3,$4,$5,$6,$7,$8,$9)",[i.id,i.proposedFact,i.proposedSources,i.proposedBy,i.proposerModel,i.reviewMode,i.writtenBy,i.client,i.requestId])).rows[0]),
      promote:async(id)=>{const r=(await query("select * from review_memory_fact_candidate($1,'promote',null)",[id])).rows[0];return r?.id?candidate(r):null;},
      reject:async(id)=>candidate((await query("select * from review_memory_fact_candidate($1,'reject',null)",[id])).rows[0]),
      getFact:async(id)=>{const r=(await query("select * from memory_facts where id=$1",[id])).rows[0];return r&&{...r,supersedesFactId:r.supersedes_fact_id};},
      patchFact:async(id,patch)=>query("update memory_facts set valid_to=$2 where id=$1",[id,patch.validTo]),
      // PGlite's text decoder strips a leading BOM from bare text fields.
      sources:async(id)=>(await query("select to_jsonb(s) as row from memory_sources s where fact_id=$1 order by id",[id])).rows.map(({row})=>source(row)),
      patchSource:async(id,patch)=>{
        const map={sourceRecordId:"source_record_id",sourceUrl:"source_url",excerpt:"excerpt",note:"note"},entries=Object.entries(patch);
        return query("update memory_sources set "+entries.map(([k],n)=>map[k]+"=$"+(n+2)).join(",")+" where id=$1",[id,...entries.map(([,v])=>v)]);
      },
      deleteSource:async(id)=>(await query("select delete_memory_source($1) removed",[id])).rows[0].removed,
      addSource:async(factId,s)=>source((await query("insert into memory_sources(fact_id,source_resource,source_record_id,source_url,excerpt,note) values($1,$2,$3,$4,$5,$6) returning *",[factId,s.sourceResource,s.sourceRecordId,s.sourceUrl,s.excerpt,s.note])).rows[0]),
      restore:async(id)=>(await query("select restore_memory_fact($1) restored",[id])).rows[0].restored,
      invalidate:async(id)=>query("select invalidate_memory_fact($1,'test')",[id]),
      snapshot:async()=>Object.fromEntries(await Promise.all(["memory_entities","memory_facts","memory_sources","memory_fact_candidates"].map(async t=>[t,(await query("select * from "+t+" order by id")).rows]))),
      failAt:async(table,operation)=>admin("create function public.inject_memory_failure() returns trigger language plpgsql as $$begin raise exception 'injected failure';end;$$;create trigger injected before "+operation+" on "+table+" for each row execute function public.inject_memory_failure();"),
      clearFailure:async(table)=>admin("drop trigger injected on "+table+";drop function public.inject_memory_failure();"),
    };
    await assertLegacySourceCompatibility(adapter, legacyFact);
    // Resource type is immutable for normal callers, but a privileged update must still preserve evidence.
    await assert.rejects(() => admin("update memory_sources set source_resource='external' where fact_id='"+legacyFact+"' and source_resource='chat' and source_record_id is null"), /requires evidence/);
    const result=await memoryGovernanceContract(adapter);
    for(const sql of [
      "insert into memory_facts(subject_entity_id,predicate,object_value) values('"+result.entity+"','bypass','true')",
      "insert into memory_fact_candidates(proposed_fact,proposed_sources,proposed_by) values('{}','[{}]','model')",
      "select write_memory_fact('{}','[]',null)",
      "update memory_fact_candidates set status='rejected'",
      "update memory_facts set status='active'",
      "delete from memory_sources where id='"+result.sourceId+"'",
    ])await assert.rejects(()=>query(sql),/permission denied/);
    // A spoofed p_client='web' cannot authorize OAuth/MCP review.
    const manual={id:randomUUID(),requestId:randomUUID(),client:"mcp:test",writtenBy:"test",reviewMode:"manual",proposedBy:"model",proposerModel:null,
      proposedFact:{subjectEntityId:result.entity,predicate:"audit-review",objectValue:"inference",objectEntityId:null,perspectiveEntityId:null,epistemicType:"derived",supersedesFactId:null,confidence:1,importance:3,validFrom:null,validTo:null},
      proposedSources:[{sourceResource:"chat",sourceRecordId:null,sourceUrl:null,excerpt:"words",note:null}]};
    const manualFirst=await adapter.submit(manual);
    assert.equal((await adapter.submit({...manual,id:randomUUID()})).id,manualFirst.id);
    await assert.rejects(()=>adapter.submit({...manual,proposedFact:{...manual.proposedFact,objectValue:"other"}}),/different content/);
    assert.notEqual((await adapter.submit({...manual,id:randomUUID(),requestId:randomUUID(),proposedFact:{...manual.proposedFact,objectValue:"other"}})).id,manualFirst.id);
    await db.query("select set_config('test.jwt',$1,false)",[JSON.stringify({aud:"https://eva-orbit.vercel.app/api/mcp",client_id:"test"})]);
    const submitConfirmed = (evidence) => adapter.submit({
      ...manual, id: randomUUID(), requestId: randomUUID(), proposedBy: "user", reviewMode: "user_confirmed",
      proposedFact: { ...manual.proposedFact, epistemicType: "direct_statement" },
      proposedSources: [{ ...manual.proposedSources[0], ...evidence }],
    });
    // The RPC receives raw Source values, without application-side trim().
    for (const sourceResource of ["chat", "\uFEFFchat\uFEFF"]) {
      const fast = await submitConfirmed({ sourceResource });
      assert.equal(fast.status, "promoted");
      assert.equal((await adapter.getFact(fast.promotedFactId)).status, "active");
      const [stored] = await adapter.sources(fast.promotedFactId);
      assert.equal(stored.sourceResource, sourceResource);
      assert.equal(stored.excerpt, "words");
    }
    const beforeInvalidEvidence = await adapter.snapshot();
    for (const [evidence, error] of [
      [{ excerpt: "" }, /blank/],
      [{ sourceUrl: "ftp://invalid.example" }, /HTTP or HTTPS/],
      [{ sourceResource: "external", sourceRecordId: "valid-external-id" }, /original user excerpt/],
    ]) {
      await assert.rejects(() => submitConfirmed(evidence), error);
      assert.deepEqual(await adapter.snapshot(), beforeInvalidEvidence);
    }
    for(const claims of [{aud:"https://eva-orbit.vercel.app/api/mcp",client_id:"test"}, {aud:["https://eva-orbit.vercel.app/api/mcp"]}, {aud:"authenticated",client_id:"test"}, {}]) {
      await db.query("select set_config('test.jwt',$1,false)",[JSON.stringify(claims)]);
      const c=await adapter.submit({...manual,id:randomUUID(),requestId:randomUUID()});
      assert.equal(c.status,"pending");
      for(const action of ["promote","reject"])await assert.rejects(()=>query("select * from review_memory_fact_candidate($1,$2,null,'web')",[c.id,action]),/Web session|OAuth clients/);
      assert.equal((await query("select status from memory_fact_candidates where id=$1",[c.id])).rows[0].status,"pending");
    }
    await db.query("select set_config('test.jwt',$1,false)",[JSON.stringify({aud:["authenticated"]})]);
    const web=await adapter.submit({...manual,id:randomUUID(),requestId:randomUUID()});
    assert.equal((await adapter.promote(web.id)).status,"promoted");
    await db.exec("set test.uid='"+other+"'");
    assert.equal((await query("select * from memory_facts")).rows.length,0);
    assert.equal((await query("select * from memory_fact_candidates")).rows.length,0);
    assert.equal((await query("select * from memory_sources")).rows.length,0);
    assert.equal((await query("select delete_memory_source($1) removed",[result.sourceId])).rows[0].removed,false);
  }finally{await db.close();}
});
