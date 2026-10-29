// Explicit admin maintenance. Defaults to a fully rolled-back preview.
// node --env-file=.env.local scripts/retire-insight-reports.mjs --report-id=UUID [--report-id=UUID] [--apply]
import fs from 'node:fs';
import postgres from 'postgres';
import {migrationChecksums} from './migration-checksum.mjs';

const ids=process.argv.filter(arg=>arg.startsWith('--report-id=')).map(arg=>arg.slice(12));
if(!ids.length||ids.some(id=>! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)))throw Error('Provide known report UUIDs from the authenticated account.');
const apply=process.argv.includes('--apply'),filename='202610290001_insight_retirement.sql';
const source=fs.readFileSync(new URL('../supabase/migrations/'+filename,import.meta.url),'utf8');
const checksums=migrationChecksums(source),rollback=new Error('Preview rollback');
const tables=['insight_run_attempts','insight_runs','insight_report_versions','insight_reports'];
const sql=postgres(process.env.DATABASE_URL,{max:1,prepare:false,connect_timeout:12,
  ssl:{rejectUnauthorized:true,ca:fs.readFileSync(new URL('./ios/supabase-root-2021.crt',import.meta.url),'utf8')},onnotice:()=>{}});
let result;
try{
  try{await sql.begin('isolation level repeatable read',async tx=>{
    await tx`set local lock_timeout='5s'`;await tx`set local statement_timeout='30s'`;
    await tx`lock table insight_reports,insight_report_versions,insight_runs,insight_run_attempts in share row exclusive mode`;
    const refs=await tx`select id,user_id from insight_reports where id in ${tx(ids)}`;
    if(refs.length!==new Set(ids).size||new Set(refs.map(row=>row.user_id)).size!==1)throw Error('ACCOUNT_REFERENCE_MISMATCH');
    const owner=refs[0].user_id;
    // Audit every other owner-scoped public table without exporting record contents.
    const business=await tx`select table_name from information_schema.columns where table_schema='public' and column_name='user_id' order by table_name`;
    const snapshot=async()=>{
      const queries=business.filter(row=>!tables.includes(row.table_name)).map(({table_name:table})=>{
        const name='"'+table.replaceAll('"','""')+'"';
        return `select '${table.replaceAll("'","''")}' as table_name,count(*)::int n,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) fingerprint from public.${name} t where user_id=$1::uuid`;
      });
      return JSON.stringify(await tx.unsafe(queries.join(' union all '),[owner]));
    };
    const before=await snapshot(),counts={};
    for(const table of tables)counts[table]=(await tx`select count(*)::int n from ${tx(table)} where user_id=${owner}`)[0].n;
    const [tracked]=await tx`select checksum from evaorbit_schema_migrations where filename=${filename}`;
    if(tracked&&!checksums.compatible.has(tracked.checksum))throw Error('MIGRATION_CHECKSUM_MISMATCH');
    await tx.unsafe(source.replace(/^begin;\s*/i,'').replace(/commit;\s*$/i,''));
    await tx`select set_config('evaorbit.retire_insight_user',${owner},true)`;
    await tx.unsafe(fs.readFileSync(new URL('./purge-insight-reports.sql',import.meta.url),'utf8'));
    for(const table of tables){if((await tx`select count(*)::int n from ${tx(table)} where user_id=${owner}`)[0].n!==0)throw Error('PURGE_INCOMPLETE');}
    if(before!==await snapshot())throw Error('SOURCE_RECORDS_CHANGED');
    if(!tracked)await tx`insert into evaorbit_schema_migrations(filename,checksum) values(${filename},${checksums.canonical})`;
    result={mode:apply?'applied':'preview-rolled-back',deleted:counts,sourceRecordsUnchanged:true,migration:filename};
    if(!apply)throw rollback;
  });}catch(error){if(error!==rollback)throw error;}
  console.log(JSON.stringify(result));
}catch(error){console.error(JSON.stringify({failed:true,code:error.code??error.message}));process.exitCode=1;}
finally{await sql.end({timeout:3});}
