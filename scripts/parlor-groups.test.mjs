import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {acceptEvaEvent} from '../src/lib/native-eva.ts';
const source=readFileSync('ios/EvaOrbitHost/Sources/AIStore.swift','utf8');
const sql=name=>source.match(new RegExp('let '+name+' = """([\\s\\S]*?)"""'))[1];
test('Parlor v3 preserves v2 data and atomically stores independent group drafts, snapshots and recovery',()=>{
 const db=new DatabaseSync(':memory:');try{
 db.exec(sql('migration'));db.exec(sql('personaMigration'));
 db.prepare('INSERT INTO ai_personas VALUES(?,?,?)').run('a','sebastian','{"id":"sebastian"}');
 db.exec(sql('groupMigration'));db.exec(sql('groupMigration'));assert.equal(db.prepare('PRAGMA user_version').get().user_version,3);
 assert.equal(db.prepare('SELECT count(*) n FROM ai_personas').get().n,1);
 db.prepare('INSERT INTO ai_groups VALUES(?,?,?)').run('a','group','{"id":"group","mode":"parallel"}');
 const context=[{role:'user',content:'Identical question'}];
 db.prepare('INSERT INTO ai_rounds VALUES(?,?,?,?)').run('a','round','group',JSON.stringify({context}));
 for(const [id,name,tokens] of [['r1','Sebastian',11],['r2','Ada',22]])db.prepare('INSERT INTO ai_messages(account_id,id,conversation_id,status,payload) VALUES(?,?,?,?,?)').run('a',id,'group','streaming',JSON.stringify({id,role:'assistant',content:name+' partial',personaName:name,status:'streaming',seq:3,usage:{inputTokens:tokens}}));
 db.exec(sql('recovery'));const rows=db.prepare('SELECT payload FROM ai_messages ORDER BY ordinal').all().map(r=>JSON.parse(r.payload));
 assert.deepEqual(rows.map(m=>m.personaName),['Sebastian','Ada']);assert.deepEqual(rows.map(m=>m.usage.inputTokens),[11,22]);assert(rows.every(m=>m.status==='interrupted'&&m.seq===4));
 for(const table of ['ai_groups','ai_rounds','ai_messages'])assert.equal(db.prepare(`SELECT count(*) n FROM ${table} WHERE account_id=?`).get('b').n,0);
 assert.deepEqual(JSON.parse(db.prepare('SELECT payload FROM ai_rounds').get().payload).context,context);
 db.exec('BEGIN');db.prepare('INSERT INTO ai_messages(account_id,id,conversation_id,status,payload) VALUES(?,?,?,?,?)').run('a','new','group','streaming','{}');assert.throws(()=>db.prepare('INSERT INTO ai_messages(account_id,id,conversation_id,status,payload) VALUES(?,?,?,?,?)').run('a','r1','group','streaming','{}'));db.exec('ROLLBACK');assert.equal(db.prepare('SELECT count(*) n FROM ai_messages').get().n,2);
 }finally{db.close();}
});
test('interleaved persona events update only their own answer and retain terminal and account guards',()=>{
 const base={conversationId:'group',role:'assistant',content:'',status:'streaming',createdAt:'2026-11-16T00:00:00Z',seq:0,requestCount:1,roundId:'round'};
 let messages=[{...base,id:'a',requestId:'ra',personaId:'sebastian'},{...base,id:'b',requestId:'rb',personaId:'ada'}];
 const event=(m)=>({accountId:'account',conversationId:'group',messageId:m.id,requestId:m.requestId,seq:m.seq,eventType:m.status==='streaming'?'progress':'terminal',message:m});
 messages=acceptEvaEvent(event({...messages[1],seq:1,content:'Ada partial'}),'account','group',messages);
 assert.equal(messages[0].content,'');assert.equal(messages[1].content,'Ada partial');
 messages=acceptEvaEvent(event({...messages[0],seq:1,content:'Sebastian partial',status:'cancelled'}),'account','group',messages);
 assert.equal(acceptEvaEvent(event({...messages[0],seq:2,status:'streaming'}),'account','group',messages),null);
 assert.equal(acceptEvaEvent(event({...messages[1],seq:2}),'other','group',messages),null);
 messages=acceptEvaEvent(event({...messages[1],seq:2,content:'Ada done',status:'done',usage:{inputTokens:22,source:'provider'}}),'account','group',messages);
 assert.equal(messages[0].status,'cancelled');assert.equal(messages[1].usage.inputTokens,22);
});

test('Parlor v4 discussion recovery retains budgets, partials and independent usage without auto restart',()=>{
 const db=new DatabaseSync(':memory:');try{
 db.exec(sql('migration'));db.exec(sql('personaMigration'));db.exec(sql('groupMigration'));db.exec(sql('discussionMigration'));
 const run={id:'run',conversationId:'group',status:'running',roundsStarted:2,maxRounds:3,suspendedPersonaIds:['ada'],revision:7};
 db.prepare('INSERT INTO ai_discussions VALUES(?,?,?)').run('a','group',JSON.stringify(run));
 db.prepare('INSERT INTO ai_messages(account_id,id,conversation_id,status,payload) VALUES(?,?,?,?,?)').run('a','partial','group','streaming',JSON.stringify({content:'partial',status:'streaming',seq:4,personaId:'ada',discussionId:'run',discussionRound:2,usage:{inputTokens:22}}));
 db.exec(sql('discussionMigration'));db.exec(sql('recovery'));db.exec(sql('discussionMigration'));
 const recovered=JSON.parse(db.prepare('SELECT payload FROM ai_discussions').get().payload);
 assert.deepEqual(recovered,{...run,status:'interrupted',revision:8});assert.equal(db.prepare('PRAGMA user_version').get().user_version,4);
 const message=JSON.parse(db.prepare('SELECT payload FROM ai_messages').get().payload);assert.equal(message.content,'partial');assert.equal(message.usage.inputTokens,22);assert.equal(message.discussionRound,2);assert.equal(message.status,'interrupted');
 assert.equal(db.prepare('SELECT count(*) n FROM ai_discussions WHERE account_id=?').get('b').n,0);
 // Exercise the actual revision-guard SQL used by AIStore, rather than a second implementation.
 const update=source.match(/try execute\("(INSERT INTO ai_discussions[^"\n]+)"/)[1];
 db.prepare(update).run('a','group',JSON.stringify({...run,revision:6}));assert.equal(JSON.parse(db.prepare('SELECT payload FROM ai_discussions').get().payload).status,'interrupted');
 db.prepare(update).run('a','group',JSON.stringify({...run,status:'ended',revision:9}));assert.equal(JSON.parse(db.prepare('SELECT payload FROM ai_discussions').get().payload).status,'ended');
 }finally{db.close();}
});
