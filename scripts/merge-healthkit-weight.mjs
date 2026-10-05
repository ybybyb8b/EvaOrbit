import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { migrationChecksums, normalizeMigrationSource } from "./migration-checksum.mjs";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const apply=process.argv.includes("--apply"),file="202610050003_healthkit_weight_merge.sql";
const source=normalizeMigrationSource(fs.readFileSync(path.join("supabase","migrations",file),"utf8"));
const checksum=migrationChecksums(source).canonical;
const sql=postgres(process.env.DATABASE_URL,{max:1,prepare:false,connect_timeout:15,onnotice:()=>{}}),rollback=new Error("rollback merge rehearsal");
let result;
try {
  try {
    await sql.begin(async tx=>{
      await tx`lock table public.weight_records in share row exclusive mode`;
      const [applied]=await tx`select checksum from public.evaorbit_schema_migrations where filename=${file}`;
      if(applied){assert.equal(applied.checksum,checksum);result={alreadyApplied:true};return;}
      const before=await tx`select * from public.weight_records order by id`;
      const manual=before.filter(row=>row.source==="manual");
      const [plan]=await tx`select count(*)::int as groups,coalesce(sum(n-1),0)::int as extra from(
        select count(*) as n from public.weight_records where source='apple_health' and healthkit_sample_id is not null
        group by user_id,occurred_at,weight_kg having count(*)>1) d`;
      let backup;
      if(apply){
        const [definition]=await tx`select pg_get_functiondef('public.ingest_healthkit_body_mass_changes(uuid,jsonb)'::regprocedure) as definition`;
        const directory=path.resolve("tmp","healthkit-weight-merge");fs.mkdirSync(directory,{recursive:true});
        backup=path.join(directory,`${new Date().toISOString().replace(/[:.]/g,"-")}-${randomUUID()}.json`);
        fs.writeFileSync(backup,JSON.stringify({savedAt:new Date().toISOString(),migration:file,originalIngest:definition.definition,records:before},null,2),{flag:"wx"});
        assert.equal(JSON.parse(fs.readFileSync(backup,"utf8")).records.length,before.length);
      }
      await tx.unsafe(source.trim().replace(/^begin;\s*/,"").replace(/\s*commit;$/,""));
      const after=await tx`select * from public.weight_records order by id`;
      assert.deepEqual(after.filter(row=>row.source==="manual"),manual,"manual records must remain unchanged");
      assert.equal(before.length-after.length,plan.extra);
      const [remaining]=await tx`select count(*)::int as groups from(
        select 1 from public.weight_records where source='apple_health' and healthkit_sample_id is not null
        group by user_id,occurred_at,weight_kg having count(*)>1) d`;
      assert.equal(remaining.groups,0);
      const archived=await tx`select user_id,sample_id,original_record from public.healthkit_weight_merged_samples order by user_id,sample_id`;
      assert.equal(archived.length,plan.extra);
      // Replay all removed UUIDs as a rescan would; visible IDs and values must stay unchanged.
      for(let offset=0;offset<archived.length;offset+=100){
        const page=archived.slice(offset,offset+100),owners=[...new Set(page.map(row=>row.user_id))];
        for(const owner of owners){
          const changes=page.filter(row=>row.user_id===owner).map(({sample_id:sampleId,original_record:r})=>({operation:"upsert",sampleId,occurredAt:r.occurred_at,weightKg:Number(r.weight_kg),sourceBundle:r.healthkit_source_bundle,sourceName:r.healthkit_source_name,syncIdentifier:r.healthkit_sync_identifier,syncVersion:r.healthkit_sync_version}));
          await tx`select public.ingest_healthkit_body_mass_changes(${owner}::uuid,${tx.json(changes)}::jsonb)`;
        }
      }
      assert.deepEqual(await tx`select * from public.weight_records order by id`,after);
      result={applied:apply,groupsMerged:plan.groups,recordsBefore:before.length,recordsAfter:after.length,mergedIntoArchive:archived.length,manualRecordsPreserved:manual.length,replayVerified:true,...(backup?{backup}:{})};
      if(!apply)throw rollback;
      await tx`insert into public.evaorbit_schema_migrations(filename,checksum) values(${file},${checksum})`;
    });
  }catch(error){if(error!==rollback)throw error;}
  console.log(JSON.stringify(result));
}finally{await sql.end();}
