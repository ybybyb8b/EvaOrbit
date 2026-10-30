import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';

test('Timeline preference migration is repeatable, preserves settings and inherits owner RLS and CAS',async()=>{
 const db=new PGlite(),a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
 try {
  await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${a}'),('${b}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;grant usage on schema auth to authenticated;create function public.set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end;$$;`);
  await db.exec(readFileSync('supabase/migrations/202608260003_ui_preferences.sql','utf8'));
  await db.exec(`insert into ui_preferences(user_id,home_module_order) values('${a}','["tasks"]'),('${b}','[]');`);
  const migration=readFileSync('supabase/migrations/202610300001_timeline_association.sql','utf8');await db.exec(migration);await db.exec(migration);
  await db.exec(`set role authenticated;select set_config('test.uid','${a}',false);`);
  const visible=(await db.query('select user_id,home_module_order,timeline_association from ui_preferences')).rows;
  assert.equal(visible.length,1);assert.equal(visible[0].user_id,a);assert.deepEqual(visible[0].home_module_order,['tasks']);assert.deepEqual(visible[0].timeline_association,{schemaVersion:1,revision:0,rules:[]});
  const update=()=>db.query(`update ui_preferences set timeline_association='{"schemaVersion":1,"revision":1,"rules":[]}' where user_id=$1 and timeline_association->>'revision'='0' returning user_id`,[a]);
  assert.equal((await update()).rows.length,1);assert.equal((await update()).rows.length,0);
  assert.equal((await db.query('update ui_preferences set timeline_association=\'{}\' where user_id=$1 returning user_id',[b])).rows.length,0);
  await assert.rejects(db.query(`update ui_preferences set timeline_association='[]' where user_id=$1`,[a]));
  await db.exec('reset role;set role anon');await assert.rejects(db.query('select timeline_association from ui_preferences'));
 } finally {await db.close();}
});
