import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {mergeEvaMessages,nativeContextMethods,nativeEvaMethods,supportsNativeEva} from '../src/lib/native-eva.ts';
const store=readFileSync('ios/EvaOrbitHost/Sources/AIStore.swift','utf8'),memory=readFileSync('ios/EvaOrbitHost/Sources/AIStoreMemory.swift','utf8'),context=readFileSync('ios/EvaOrbitHost/Sources/AIStoreContext.swift','utf8');
const block=(source,name)=>source.match(new RegExp('(?:let|static let) '+name+' = """([\\s\\S]*?)"""'))[1];
const select=block(context,'contextSelect'),eligible=block(context,'eligibleContextSQL');
function db(){const d=new DatabaseSync(':memory:');for(const n of ['migration','personaMigration','groupMigration','discussionMigration','modelSelectionMigration'])d.exec(block(store,n));d.exec(block(memory,'memoryMigration'));d.exec(block(context,'contextMigration'));return d;}
function message(d,id,{account='a',conversation='c',role='user',content=id,status='done',roundId,supersedesId,personaId='s',seq=0}={}){d.prepare('INSERT INTO ai_messages(account_id,id,conversation_id,status,payload) VALUES(?,?,?,?,?)').run(account,id,conversation,status,JSON.stringify({id,conversationId:conversation,role,content,status,roundId,supersedesId,personaId,personaName:personaId,seq,requestCount:0,createdAt:'2026-11-17T00:00:00Z'}));return Number(d.prepare('SELECT last_insert_rowid() n').get().n);}
function summary(d,{account='a',conversation='c',scope='s',version=1,from=1,through=10,status='active'}={}){const payload={accountId:account,conversationId:conversation,scope,version,fromOrdinal:from,throughOrdinal:through,status,content:'A retained summary',unresolved:['Resolve the next step'],sourceHash:'source',contentHash:'content'};d.prepare('INSERT INTO ai_conversation_contexts VALUES(?,?,?,?,?,?,?,?)').run(account,conversation,scope,version,from,through,status,JSON.stringify(payload));return payload;}
function snapshot(d,id,{account='a',persona='s',conversation='c',parent,refs=[],memories=[],summaryRef,kind=parent?'generation':'conversation'}={}){const payload={id,accountId:account,conversationId:conversation,personaId:persona,kind,publicSnapshotId:parent,messages:refs,summary:summaryRef,memories,inputHash:'original-hash',invalidated:false};d.prepare('INSERT INTO ai_context_snapshots VALUES(?,?,?,?,?)').run(account,id,conversation,persona,JSON.stringify(payload));return payload;}

test('v6 to v7 is additive and repeatable; public snapshots cannot contain private memory references',()=>{
 const d=db();try{message(d,'before');d.exec(block(context,'contextMigration'));assert.equal(d.prepare('PRAGMA user_version').get().user_version,7);assert.equal(d.prepare('SELECT count(*) n FROM ai_messages').get().n,1);assert.throws(()=>snapshot(d,'bad',{kind:'conversation',memories:[{id:'private',version:1}]}));assert.throws(()=>d.prepare('INSERT INTO ai_context_snapshots VALUES(?,?,?,?,?)').run('b','x','c','s',JSON.stringify({id:'x',accountId:'a',conversationId:'c',personaId:'s',kind:'generation'})));}finally{d.close();}
});

test('native history SELECT pages beyond 1000 with no gaps and retains account isolation',()=>{
 const d=db();try{d.exec('BEGIN');for(let i=0;i<5002;i++)message(d,'m'+i,{role:i%2?'assistant':'user'});message(d,'foreign',{account:'b'});d.exec('COMMIT');const sql=select+' WHERE m.account_id=? AND m.conversation_id=? AND m.ordinal<? ORDER BY m.ordinal DESC LIMIT ?';let before=Number.MAX_SAFE_INTEGER,all=[];do{const rows=d.prepare(sql).all('a','c',before,200);if(!rows.length)break;all.push(...rows.map(r=>JSON.parse(r.payload).id));before=rows.at(-1).ordinal;}while(true);assert.equal(all.length,5002);assert.equal(new Set(all).size,5002);assert.equal(all[0],'m5001');assert.equal(all.at(-1),'m0');assert(!all.includes('foreign'));}finally{d.close();}
});

test('context SELECT groups regenerated replies at their original round and excludes superseded or empty/streaming output',()=>{
 const d=db();try{const first=message(d,'u1',{roundId:'r1'});message(d,'a1',{role:'assistant',roundId:'r1'});message(d,'b1',{role:'assistant',roundId:'r1',status:'failed',content:'partial evidence'});message(d,'u2',{roundId:'r2'});message(d,'live',{role:'assistant',roundId:'r2',status:'streaming',content:'in flight'});message(d,'empty',{role:'assistant',roundId:'r2',status:'failed',content:''});message(d,'a1-new',{role:'assistant',roundId:'r1',supersedesId:'a1'});const rows=d.prepare(select+' WHERE m.account_id=? AND m.conversation_id=? AND '+eligible+' ORDER BY m.ordinal').all('a','c');const ids=rows.map(r=>JSON.parse(r.payload).id);assert.deepEqual(ids,['u1','b1','u2','a1-new']);const unitKey=Object.keys(rows[0]).find(k=>k!=='ordinal'&&k!=='payload');assert.equal(rows.at(-1)[unitKey],first);assert.equal(rows[1][unitKey],first);}finally{d.close();}
});

test('summary watermarks invalidate on source changes and invalidate dependent generation hashes',()=>{
 const d=db();try{const end=message(d,'source');summary(d,{through:end});summary(d,{account:'b',through:end});snapshot(d,'public',{summaryRef:{scope:'s',version:1,hash:'content'}});snapshot(d,'reply',{parent:'public'});snapshot(d,'current-input');snapshot(d,'current-child',{parent:'current-input'});d.prepare("UPDATE ai_context_snapshots SET payload=json_set(payload,'$.currentMessageId','source') WHERE id='current-input'").run();d.prepare("UPDATE ai_messages SET payload=json_set(payload,'$.content','corrected','$.seq',1) WHERE account_id='a' AND id='source'").run();assert.equal(d.prepare("SELECT status FROM ai_conversation_contexts WHERE account_id='a'").get().status,'invalidated');assert.equal(d.prepare("SELECT status FROM ai_conversation_contexts WHERE account_id='b'").get().status,'active');for(const row of d.prepare('SELECT payload FROM ai_context_snapshots').all()){const value=JSON.parse(row.payload);assert.equal(value.invalidated,true);assert.equal(value.inputHash,'');}}finally{d.close();}
});

test('replacement after a summary watermark invalidates the covered original assertion; unrelated new turns do not',()=>{
 const d=db();try{message(d,'u');const end=message(d,'old',{role:'assistant'});summary(d,{through:end});message(d,'new-turn');assert.equal(d.prepare('SELECT status FROM ai_conversation_contexts').get().status,'active');message(d,'replacement',{role:'assistant',supersedesId:'old'});assert.equal(d.prepare('SELECT status FROM ai_conversation_contexts').get().status,'invalidated');}finally{d.close();}
});

test('deleting just a legacy prompt leaves its reply independent and invalidates dependent context',()=>{
 const d=db();
 try{
  message(d,'keep');
  const prompt=message(d,'delete');
  const reply=message(d,'reply',{role:'assistant'});
  const later=message(d,'later');
  message(d,'delete',{account:'b'});
  summary(d,{through:reply});
  snapshot(d,'source',{refs:[{id:'delete'}]});
  const operation=store.slice(store.indexOf('func deleteSingleMessage'),store.indexOf('func deleteConversation'));
  const link=operation.match(/try execute\("""\s*(UPDATE ai_messages[\s\S]*?)\s*"""/)?.[1];
  const remove=operation.match(/try execute\("(DELETE FROM ai_messages[^"]+)"/)?.[1];
  assert(link&&remove);
  d.exec('BEGIN');
  d.prepare(link).run('delete','a','c',String(prompt),'a','c',String(prompt));
  d.prepare(remove).run('a','c','delete');
  d.exec('COMMIT');
  const rows=d.prepare(select+' WHERE m.account_id=? AND m.conversation_id=? ORDER BY m.ordinal').all('a','c');
  const payloads=rows.map(row=>JSON.parse(row.payload));
  assert.deepEqual(payloads.map(row=>row.id),['keep','reply','later']);
  assert.equal(payloads[1].replyToMessageId,'delete');
  assert.equal(Object.values(rows[1])[2],reply);
  assert.equal(rows[2].ordinal,later);
  assert.equal(d.prepare("SELECT COUNT(*) count FROM ai_messages WHERE account_id='b' AND id='delete'").get().count,1);
  assert.equal(d.prepare('SELECT status FROM ai_conversation_contexts').get().status,'invalidated');
  assert.equal(JSON.parse(d.prepare('SELECT payload FROM ai_context_snapshots').get().payload).invalidated,true);
 }finally{d.close();}
});

test('withdrawing memory clears only matching account/persona/version snapshot refs and private hashes',()=>{
 const d=db();try{
  const m={accountId:'a',personaId:'s',id:'memory',version:1,status:'active'};d.prepare('INSERT INTO ai_persona_memories VALUES(?,?,?,?,?,?,?)').run('a','s','memory',1,'experience','active',JSON.stringify(m));
  for(const [id,account,persona] of [['own','a','s'],['other-persona','a','t'],['other-account','b','s']])snapshot(d,id,{account,persona,kind:'generation',memories:[{id:'memory',version:1,hash:'private'},{id:'keep',version:2,hash:'kept'}]});
  d.prepare("UPDATE ai_persona_memories SET status='deleted',payload=json_set(payload,'$.status','deleted') WHERE account_id='a' AND persona_id='s'").run();
  const own=JSON.parse(d.prepare("SELECT payload FROM ai_context_snapshots WHERE id='own'").get().payload);assert.deepEqual(own.memories,[{id:'keep',version:2,hash:'kept'}]);assert.equal(own.inputHash,'');assert.equal(own.invalidated,true);
  for(const id of ['other-persona','other-account'])assert.equal(JSON.parse(d.prepare('SELECT payload FROM ai_context_snapshots WHERE id=?').get(id).payload).memories.length,2);
 }finally{d.close();}
});

test('history page merge preserves order, newest revisions and ordinals through late events',()=>{
 const a={id:'a',ordinal:1,seq:1},b={id:'b',ordinal:2,seq:4},c={id:'c',ordinal:3,seq:1};
 assert.deepEqual(mergeEvaMessages([b,c],[a,{...b,seq:2}]),[a,b,c]);assert.equal(nativeContextMethods.length,3);assert(supportsNativeEva({methods:[...nativeEvaMethods]}));
});

test('native request assembly uses bounded reads and refs, with no model or MCP step for context',()=>{
 const runtime=readFileSync('ios/EvaOrbitHost/Sources/AIRuntime.swift','utf8');const send=runtime.slice(runtime.indexOf('private func send(account:'),runtime.indexOf('private func receive(')),group=runtime.slice(runtime.indexOf('private func sendGroup('),runtime.indexOf('private func discussionChanged('));
 assert.match(send,/makeContextPlan/);assert.match(group,/makeContextPlan/);assert.match(group,/replayContext/);assert(!/store\.messages|history\.count|128 \* 1024/.test(send+group));assert.match(store,/saved\.context = \[\]/);assert(!/URLSession|\.infer\(|\.perform\(|memory_context|eo_search/.test(context));assert.match(readFileSync('ios/EvaOrbitHost/Sources/AIContextBackup.swift','utf8'),/changed.ordinal = current\[ref.id\]/);
});
