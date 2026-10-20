import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
test('Media completion migration is repeatable, atomic, retry safe and owner isolated',async()=>{
 const db=new PGlite(),a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
 try{
  await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${a}'),('${b}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;grant usage on schema auth to authenticated;create function public.set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end;$$;`);
  await db.exec(readFileSync('supabase/migrations/202608290002_media.sql','utf8'));
  // Exercise the real collection schema before its independent storage-bucket DDL.
  await db.exec(readFileSync('supabase/migrations/202608310004_media_collection.sql','utf8').split('insert into storage.buckets')[0]+'commit;');
  await db.exec(readFileSync('supabase/migrations/202608310005_media_titles.sql','utf8'));
  const sql=readFileSync('supabase/migrations/202610200001_media_completion.sql','utf8');await db.exec(sql);await db.exec(sql);
  await db.exec(`insert into media_items(id,user_id,title,original_title,media_type,status) values(1,'${a}','Reacher','Reacher','tv','watching'),(2,'${b}','Private','Private','movie','planned');create function public.reject_view() returns trigger language plpgsql as $$begin if current_setting('test.reject',true)='true' then raise exception 'view rejected';end if;return new;end;$$;create trigger test_reject before insert on media_viewings for each row execute function public.reject_view();set role authenticated;select set_config('test.uid','${a}',false);`);
  const call=(id=1,patch={season_number:2},date='2026-10-20')=>db.query('select public.complete_media_item($1,$2::jsonb,$3::date) as saved',[id,JSON.stringify(patch),date]);
  await db.exec("select set_config('test.reject','true',false)");await assert.rejects(call(),/view rejected/);
  assert.equal((await db.query('select status from media_items where id=1')).rows[0].status,'watching');
  await db.exec("select set_config('test.reject','false',false)");await call();await call();
  assert.equal((await db.query('select count(*)::int as count from media_viewings where media_id=1')).rows[0].count,1);
  assert.equal((await db.query('select season_number from media_items where id=1')).rows[0].season_number,2);
  await assert.rejects(call(1,{},'2026-10-19'),/different date/);
  assert.equal((await call(2)).rows[0].saved,false);await assert.rejects(call(1,{user_id:b}),/Unsupported/);
  await assert.rejects(call(1,{},null),/completion date/);
  await db.exec('reset role;set role anon');await assert.rejects(call(),/permission denied/);
 }finally{await db.close();}
});
