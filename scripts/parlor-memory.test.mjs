import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync,backup} from 'node:sqlite';
import {nativeMemoryMethods,nativeEvaMethods,supportsNativeEva} from '../src/lib/native-eva.ts';

const store=readFileSync('ios/EvaOrbitHost/Sources/AIStore.swift','utf8');
const memory=readFileSync('ios/EvaOrbitHost/Sources/AIStoreMemory.swift','utf8');
const migration=memory.match(/static let memoryMigration = """([\s\S]*?)"""/)[1];
const sql=name=>store.match(new RegExp('let '+name+' = """([\\s\\S]*?)"""'))[1];
const nativeSQL=prefix=>[...memory.matchAll(/(?:execute|statement|documents)\("([^"\n]+)"/g)].map(m=>m[1]).find(s=>s.startsWith(prefix));
function v5(db){for(const n of ['migration','personaMigration','groupMigration','discussionMigration','modelSelectionMigration'])db.exec(sql(n));}
function seedConversation(db,id,personas,group=false,account='a'){
  db.prepare('INSERT INTO ai_conversations VALUES(?,?,?,?)').run(account,id,id,'2026-11-17T00:00:00Z');
  for(const [i,personaId] of personas.entries())db.prepare('INSERT INTO ai_messages(account_id,id,conversation_id,status,payload) VALUES(?,?,?,?,?)').run(account,`${id}-${i}`,id,'done',JSON.stringify({role:'assistant',personaId,content:'kept'}));
  if(group)db.prepare('INSERT INTO ai_groups VALUES(?,?,?)').run(account,id,'{}');
}
function seedMemory(db,{account='a',persona='sebastian',id='memory',version=1,status='active',content='private',sources=[]}={}){
  const value={accountId:account,personaId:persona,id,version,status,content,sources,kind:'experience',importance:3,nature:'sharedExperience',createdAt:'2026-11-17T00:00:00Z',updatedAt:'2026-11-17T00:00:00Z'};
  db.prepare(nativeSQL('INSERT INTO ai_persona_memories')).run(account,persona,id,String(version),'experience',status,JSON.stringify(value));return value;
}

test('actual v6 migration backfills only complete unique known persona evidence, protects groups and is idempotent',()=>{
  const db=new DatabaseSync(':memory:');try{
    v5(db);for(const persona of ['sebastian','ada'])db.prepare('INSERT INTO ai_personas VALUES(?,?,?)').run('a',persona,'{}');
    seedConversation(db,'reliable',['sebastian','sebastian']);seedConversation(db,'unknown',[null]);seedConversation(db,'mixed',['sebastian','ada']);seedConversation(db,'partial',['sebastian',null]);seedConversation(db,'missing-persona',['removed']);seedConversation(db,'empty',[]);seedConversation(db,'parallel',['sebastian'],true);
    seedConversation(db,'discussion',['sebastian']);db.prepare('INSERT INTO ai_discussions VALUES(?,?,?)').run('a','discussion',JSON.stringify({status:'running',revision:2,roundsStarted:2,maxRounds:3}));
    seedConversation(db,'round-only',['sebastian']);db.prepare('INSERT INTO ai_rounds VALUES(?,?,?,?)').run('a','r','round-only','{}');
    seedConversation(db,'isolated',['sebastian'],false,'b');
    const before=db.prepare('SELECT payload FROM ai_messages ORDER BY ordinal').all();db.exec(migration);db.exec(migration);
    db.exec(sql('discussionRecovery'));db.exec(sql('discussionRecovery'));
    assert.deepEqual(JSON.parse(db.prepare('SELECT payload FROM ai_discussions').get().payload),{status:'interrupted',revision:3,roundsStarted:2,maxRounds:3});
    assert.equal(db.prepare('PRAGMA user_version').get().user_version,6);
    const owner=id=>db.prepare('SELECT kind,persona_id FROM ai_conversation_owners WHERE account_id=? AND conversation_id=?').get('a',id);
    assert.deepEqual({...owner('reliable')},{kind:'single',persona_id:'sebastian'});
    for(const id of ['unknown','mixed','partial','missing-persona','empty'])assert.equal(owner(id).kind,'unresolved',id);
    for(const id of ['parallel','discussion','round-only'])assert.equal(owner(id).kind,'group',id);
    assert.equal(db.prepare("SELECT kind FROM ai_conversation_owners WHERE account_id='b'").get().kind,'unresolved');
    assert.deepEqual(db.prepare('SELECT payload FROM ai_messages ORDER BY ordinal').all(),before);
    db.prepare(nativeSQL('UPDATE ai_conversation_owners SET kind')).run('ada','a','unknown');db.exec(migration);assert.equal(owner('unknown').persona_id,'ada');
  }finally{db.close();}
});

test('actual memory SQL isolates account/persona, enforces one active version and redacts complete chains',()=>{
  const db=new DatabaseSync(':memory:');try{
    v5(db);db.exec(migration);const first=seedMemory(db);seedMemory(db,{account:'b'});seedMemory(db,{persona:'ada'});
    const list=db.prepare(nativeSQL('SELECT payload FROM ai_persona_memories WHERE account_id=? AND persona_id=? AND status='));
    assert.equal(list.all('a','sebastian').length,1);assert.equal(list.all('b','sebastian').length,1);assert.equal(list.all('a','ada').length,1);assert.equal(list.all('other','sebastian').length,0);
    assert.throws(()=>seedMemory(db,{version:2}));
    const previous={...first,status:'superseded'};
    db.prepare(nativeSQL("UPDATE ai_persona_memories SET status='superseded'")).run(JSON.stringify(previous),'a','sebastian','memory','1');
    seedMemory(db,{version:2,content:'replacement',sources:[{conversationId:'c',excerpt:'evidence'}]});
    const versions=db.prepare(nativeSQL('SELECT payload FROM ai_persona_memories WHERE account_id=? AND persona_id=? AND id=?')).all('a','sebastian','memory').map(r=>JSON.parse(r.payload));
    assert.deepEqual(versions.map(m=>m.status),['active','superseded']);
    for(const v of versions)db.prepare(nativeSQL("UPDATE ai_persona_memories SET status='deleted'")).run(JSON.stringify({...v,status:'deleted',content:'',sources:[]}),'a','sebastian','memory',String(v.version));
    assert.equal(list.all('a','sebastian').length,0);
    const rows=db.prepare("SELECT payload FROM ai_persona_memories WHERE account_id='a' AND persona_id='sebastian'").all().map(r=>JSON.parse(r.payload));assert(rows.every(m=>m.status==='deleted'&&m.content===''&&m.sources.length===0));
    assert.equal(JSON.parse(list.get('b','sebastian').payload).content,'private');assert.equal(JSON.parse(list.get('a','ada').payload).content,'private');
  }finally{db.close();}
});

test('SQLite consistent snapshot includes WAL and failed replacement transactions preserve data',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'parlor-memory-'));let db,snapshot;
  try{
    db=new DatabaseSync(join(directory,'ai.sqlite3'));v5(db);db.exec(migration);seedMemory(db);seedMemory(db,{account:'b'});
    await backup(db,join(directory,'snapshot.sqlite3'));snapshot=new DatabaseSync(join(directory,'snapshot.sqlite3'));assert.equal(snapshot.prepare('PRAGMA quick_check').get().quick_check,'ok');assert.equal(snapshot.prepare('SELECT count(*) n FROM ai_persona_memories').get().n,2);
    db.exec('BEGIN IMMEDIATE');db.prepare('DELETE FROM ai_persona_memories WHERE account_id=?').run('a');seedMemory(db,{id:'restored'});assert.throws(()=>seedMemory(db,{id:'restored'}));db.exec('ROLLBACK');assert.equal(db.prepare("SELECT id FROM ai_persona_memories WHERE account_id='a'").get().id,'memory');assert.equal(db.prepare("SELECT count(*) n FROM ai_persona_memories WHERE account_id='b'").get().n,1);
  }finally{snapshot?.close();db?.close();rmSync(directory,{recursive:true,force:true});}
});

test('memory remains an optional Native capability with local context assembly',()=>{
  assert(supportsNativeEva({methods:[...nativeEvaMethods]}));assert.equal(nativeMemoryMethods.length,8);
  const runtime=readFileSync('ios/EvaOrbitHost/Sources/AIRuntime.swift','utf8'),send=runtime.slice(runtime.indexOf('private func send(account:'),runtime.indexOf('private func receive('));
  assert.match(send,/requireConversationPersona/);assert.match(send,/makeContextPlan/);assert(!/memoryList|memorySave|store\.memories|memory-context|getMemoryContext/.test(send));
  assert.match(runtime,/configured\.baseURL == provider\.baseURL/);assert.match(runtime,/prepareRestoreBackup\(document, account: account\)/);
  const backupSource=readFileSync('ios/EvaOrbitHost/Sources/AIStoreBackup.swift','utf8');assert.match(backupSource,/sqlite3_backup_init/);assert.match(backupSource,/PRAGMA quick_check/);assert.match(backupSource,/value.accountId == account/);assert.match(backupSource,/validateBackup\(document, account: account\)/);assert(!/secrets\.read|keychain\.read/.test(backupSource));
});
