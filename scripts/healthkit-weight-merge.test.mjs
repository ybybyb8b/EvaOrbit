import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import postgres from "postgres";

test("Weight merging preserves archived samples, retry identity, surviving copies, manual entries and account isolation", { skip: !process.env.DATABASE_URL }, async () => {
  const sql=postgres(process.env.DATABASE_URL,{max:1,prepare:false,connect_timeout:15,onnotice:()=>{}}),rollback=new Error("rollback weight merge test");
  try {
    await assert.rejects(sql.begin(async tx=>{
      const user=randomUUID(),other=randomUUID(),samples=[randomUUID(),randomUUID(),randomUUID()];
      await tx`insert into auth.users(id) values(${user}),(${other})`;
      for(const sample of samples.slice(0,2)) await tx`insert into public.weight_records(user_id,occurred_at,weight_kg,source,healthkit_sample_id,healthkit_source_bundle) values(${user},'2026-10-01T00:00:00Z',60,'apple_health',${sample},'synthetic.test')`;
      await tx`insert into public.weight_records(user_id,occurred_at,weight_kg,source) values(${user},'2026-10-01T00:00:00Z',60,'manual')`;
      const [canonical]=await tx`select id from public.weight_records where user_id=${user} and source='apple_health' order by created_at,id limit 1`;
      const source=readFileSync(new URL('../supabase/migrations/202610050003_healthkit_weight_merge.sql',import.meta.url),'utf8').trim().replace(/^begin;\s*/,'').replace(/\s*commit;$/,'');
      await tx.unsafe(source);
      await tx.unsafe(source);
      const count=async()=>Number((await tx`select count(*) as n from public.weight_records where user_id=${user} and source='apple_health'`)[0].n);
      assert.equal(await count(),1);
      assert.equal((await tx`select id from public.weight_records where user_id=${user} and source='apple_health'`)[0].id,canonical.id);
      assert.equal(Number((await tx`select count(*) as n from public.healthkit_weight_merged_samples where user_id=${user}`)[0].n),1);
      assert.equal((await tx`select original_record->>'id' as id from public.healthkit_weight_merged_samples where user_id=${user}`)[0].id !== null,true);
      const row=id=>({operation:'upsert',sampleId:id,occurredAt:'2026-10-01T00:00:00Z',weightKg:60,sourceBundle:'synthetic.test',sourceName:'Synthetic fixture'});
      const ingest=(rows,owner=user)=>tx`select public.ingest_healthkit_body_mass_changes(${owner}::uuid,${tx.json(rows)}::jsonb)`;
      for(let run=0;run<3;run++)await ingest(samples.map(row));
      assert.equal(await count(),1,'old and fresh UUID copies remain merged');
      assert.equal(Number((await tx`select count(*) as n from public.weight_records where user_id=${user} and source='manual'`)[0].n),1);
      await ingest([row(samples[0])],other);
      assert.equal(Number((await tx`select count(*) as n from public.weight_records where user_id=${other}`)[0].n),1);
      await ingest([{...row(randomUUID()),occurredAt:'2026-10-01T00:00:01Z'}, {...row(randomUUID()),weightKg:61}]);
      assert.equal(await count(),3,'nearby instants and distinct values are separate measurements');
      const main=async()=>(await tx`select id,healthkit_sample_id from public.weight_records where user_id=${user} and occurred_at='2026-10-01T00:00:00Z' and weight_kg=60 and source='apple_health'`)[0];
      for(let remaining=2;remaining>=0;remaining--){
        const selected=await main();
        await ingest([{operation:'delete',sampleId:selected.healthkit_sample_id}]);
        if(remaining)assert.equal((await main()).id,canonical.id,'surviving sample keeps visible row ID');
        else assert.equal(await main(),undefined);
      }
      await ingest(samples.map(row));
      assert.equal(await main(),undefined,'deleted aliases cannot resurrect after a stale replay');
      const before=await count(),atomic=randomUUID();
      await assert.rejects(tx.savepoint(save=>save`select public.ingest_healthkit_body_mass_changes(${user}::uuid,${save.json([row(atomic),{...row(randomUUID()),weightKg:0}])}::jsonb)`),/Invalid body mass sample/);
      assert.equal(await count(),before,'invalid batch rolls back its earlier changes');
      await tx`set local role authenticated`;
      await assert.rejects(tx`select * from public.healthkit_weight_merged_samples`,/permission denied/);
      throw rollback;
    }),error=>error===rollback);
  }finally{await sql.end();}
});
