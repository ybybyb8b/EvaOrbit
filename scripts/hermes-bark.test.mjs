import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {hermesNotificationPayload} from '../src/lib/hermes-notification.ts';
import {barkPayload} from '../src/lib/push/bark.ts';

test('Hermes notifications are paired, deduplicated, leased, unread-aware and separate from delivery',async()=>{
 const db=new PGlite(),owner=randomUUID(),other=randomUUID(),token='eo_'+randomUUID()+randomUUID(),instance=randomUUID(),cid=randomUUID();
 const bridge=async(action,data={})=>(await db.query('select hermes_bridge($1,$2::uuid,$3,$4::jsonb) value',[token,instance,action,JSON.stringify(data)])).rows[0].value;
 const rpc=async(action,data={})=>(await db.query('select eo_hermes($1,$2::jsonb) value',[action,JSON.stringify(data)])).rows[0].value;
 const claim=async(id,secret=token,lease=randomUUID())=>(await db.query('select hermes_claim_push($1,$2,$3) value',[secret,id,lease])).rows[0].value;
 const finish=async(id,ok)=>db.query('select hermes_finish_push($1,$2,$3)',[id,ok,ok?null:'BARK_NOT_ACCEPTED']);
 try{
  await db.exec(`create schema auth;create role anon;create role authenticated;create role service_role;
   create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${other}');
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;set test.uid='${owner}';
   create table bark_notification_settings(user_id uuid primary key,enabled boolean,ciphertext text,iv text,auth_tag text,open_in_host boolean);
   create table ui_preferences(user_id uuid primary key,ui_language text);
   insert into bark_notification_settings values('${owner}',true,'encrypted','iv','tag',true);insert into ui_preferences values('${owner}','zh');`);
  for(const name of ['202611060001_hermes_channel.sql','202611060002_hermes_message_surfaces.sql','202611060003_hermes_activity.sql','202611060004_hermes_commands.sql','202611060005_hermes_bark.sql'])await db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
  assert.equal((await db.query("select has_function_privilege('anon','hermes_claim_push(text,uuid,uuid)','execute') allowed")).rows[0].allowed,false);
  assert.equal((await db.query("select has_function_privilege('authenticated','hermes_finish_push(uuid,boolean,text)','execute') allowed")).rows[0].allowed,false);
  await rpc('pair',{hash:createHash('sha256').update(token).digest('hex')});await bridge('hello');
  const id=randomUUID();await rpc('send',{id,conversationId:cid,content:'Work'});let m=await bridge('claim');await bridge('start',{id,attemptId:m.attempt_id});
  const a=randomUUID(),b=randomUUID();await bridge('send',{id:a,conversationId:cid,content:'First',replyTo:id,attemptId:m.attempt_id});await bridge('send',{id:b,conversationId:cid,content:'Final',replyTo:id,attemptId:m.attempt_id});
  assert.deepEqual(await claim(a),{pending:true},'ordinary partial output waits for completion');
  await bridge('complete',{id,attemptId:m.attempt_id,outcome:'success'});
  const leased=await claim(a);assert.equal(leased.content,'Final');assert.equal(leased.openInHost,true);assert.equal(leased.kind,'reply');
  assert.deepEqual(await claim(b),{pending:true},'another request cannot claim the same turn');
  await finish(leased.claim,true);assert.deepEqual(await claim(id),{skipped:true});assert.deepEqual(await claim(b),{skipped:true},'one notification for several bubbles');
  await assert.rejects(claim(a,'eo_'+'x'.repeat(43)),/HERMES_TOKEN/);
  const question=randomUUID();await bridge('send',{id:question,conversationId:cid,content:'Choose?',presentation:{kind:'choices',state:'pending',promptId:'real-prompt',options:['A']}});
  const q=await claim(question);assert.equal(q.kind,'question');await finish(q.claim,false);
  assert.deepEqual(await claim(question),{pending:true});await db.query("update hermes_push_receipts set lease_until=now()-interval '1 second' where claim_id=$1",[q.claim]);
  const retry=await claim(question);assert.notEqual(retry.claim,q.claim);await finish(q.claim,true);
  assert.deepEqual(await claim(question),{pending:true},'old receipt cannot finish a newer lease');await finish(retry.claim,true);
  const read=randomUUID();await bridge('send',{id:read,conversationId:cid,content:'Already visible'});
  const seq=(await db.query('select seq from hermes_messages where id=$1',[read])).rows[0].seq;
  await db.query('insert into hermes_reads values($1,$2,$3)',[owner,cid,seq]);assert.deepEqual(await claim(read),{skipped:true});
  const missing=randomUUID();assert.deepEqual(await claim(missing),{skipped:true});
  const failed=randomUUID();await rpc('send',{id:failed,conversationId:cid,content:'Fail'});m=await bridge('claim');await bridge('complete',{id:failed,attemptId:m.attempt_id,outcome:'failure'});
  const error=await claim(failed);assert.equal(error.kind,'error');await finish(error.claim,true);
  await db.query('update bark_notification_settings set enabled=false where user_id=$1',[owner]);const disabled=randomUUID();await bridge('send',{id:disabled,conversationId:cid,content:'No Bark'});assert.deepEqual(await claim(disabled),{skipped:true});
  await db.exec(`set test.uid='${other}';set role authenticated;`);assert.equal((await db.query('select count(*)::int count from hermes_push_receipts')).rows[0].count,0);await db.exec('reset role');
  const records=(await db.query("select count(*)::int count from hermes_messages where id=$1 and status='failed'",[failed])).rows[0].count;assert.equal(records,1,'notification receipt cannot change message outcome');
 }finally{await db.close();}
});

test('Hermes Bark copy uses a bounded preview and conversation deep link',()=>{
 const id=randomUUID();const p=hermesNotificationPayload({kind:'question',conversationId:id,content:'**请选择**\n[A](https://example.com)',english:false});
 assert.equal(p.title,'Hermes 在等你回答');assert.equal(p.body,'请选择 A');assert.equal(barkPayload('not-a-real-key',p,true).url,`evaorbit-trackers-poc://open/ai?conversation=${id}`);
 assert(hermesNotificationPayload({kind:'reply',conversationId:id,content:'long'.repeat(200),english:true}).body.length<=140);
 assert(!hermesNotificationPayload({kind:'error',conversationId:id,content:'private diagnostic',english:true}).body.includes('private diagnostic'));
 const host=readFileSync('ios/EvaOrbitHost/Sources/HostConfiguration.swift','utf8');assert.match(host,/let routes = .*"\/ai"/);
});
