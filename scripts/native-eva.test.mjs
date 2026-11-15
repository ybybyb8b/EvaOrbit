import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

test('Native AI SQLite schema and crash recovery preserve partial text and isolate account rows',()=>{
  const source=readFileSync('ios/EvaOrbitHost/Sources/AIStore.swift','utf8');
  const sql=name=>{const found=source.match(new RegExp('let '+name+' = """([\\s\\S]*?)"""'));assert(found,name);return found[1];};
  const dir=mkdtempSync(join(tmpdir(),'eva-ai-schema-')),file=join(dir,'ai.sqlite3');let db;
  try{
    db=new DatabaseSync(file);db.exec(sql('migration'));
    db.exec('PRAGMA user_version=1'); // Simulate the existing Phase 1A database before personas.
    const message={id:'response',conversationId:'conversation',role:'assistant',content:'partial 你好🌙',status:'streaming',seq:4,requestCount:1};
    db.prepare('INSERT INTO ai_messages(account_id,id,conversation_id,status,payload) VALUES(?,?,?,?,?)').run('account-a',message.id,message.conversationId,message.status,JSON.stringify(message));
    db.prepare('INSERT INTO ai_providers(account_id,id,payload) VALUES(?,?,?)').run('account-a','provider',JSON.stringify({id:'provider',baseURL:'https://mock.example.invalid/v1',models:[{id:'mock'}]}));
    db.close();db=new DatabaseSync(file);db.exec(sql('migration'));db.exec(sql('personaMigration'));db.exec(sql('recovery'));
    assert.equal(db.prepare('PRAGMA user_version').get().user_version,2);
    db.prepare('INSERT INTO ai_personas(account_id,id,payload) VALUES(?,?,?)').run('account-a','sebastian',JSON.stringify({id:'sebastian',name:'Sebastian'}));
    assert.equal(db.prepare('SELECT count(*) n FROM ai_personas WHERE account_id=?').get('account-b').n,0);
    db.exec(sql('personaMigration'));
    assert.equal(JSON.parse(db.prepare('SELECT payload FROM ai_personas').get().payload).name,'Sebastian');
    const saved=JSON.parse(db.prepare('SELECT payload FROM ai_messages WHERE account_id=?').get('account-a').payload);
    assert.equal(saved.content,message.content);assert.equal(saved.status,'interrupted');assert.equal(saved.seq,5);
    assert.equal(db.prepare('SELECT count(*) n FROM ai_messages WHERE account_id=?').get('account-b').n,0);
    assert.equal(db.prepare('SELECT count(*) n FROM ai_providers WHERE account_id=?').get('account-b').n,0);
    const before=saved.seq;db.exec(sql('recovery'));assert.equal(JSON.parse(db.prepare('SELECT payload FROM ai_messages').get().payload).seq,before);
    assert(!db.prepare('PRAGMA table_info(ai_providers)').all().some(c=>/key|secret/i.test(c.name)));
  }finally{db?.close();rmSync(dir,{recursive:true,force:true});}
});

test('AI bridge retains local origin, frame and account generation gates; provider transport cannot proxy EO cookies',()=>{
  const bridge=readFileSync('ios/EvaOrbitHost/Sources/NativeBridge.swift','utf8');
  const online=bridge.slice(bridge.indexOf('static let supportedMethods'),bridge.indexOf('static let bootstrapScript'));
  assert(!online.includes('ai.'));
  assert.match(bridge,/message\.frameInfo\.isMainFrame/);
  assert.match(bridge,/allowsTrackerUI\(sourceURL\)/);
  assert.match(bridge,/aiRuntime == nil \? \[\] : AIRuntime.methods/);
  assert.match(bridge,/aiAccountGeneration\(account\)/);
  assert.match(bridge,/requireAIAccount\(account, generation: generation\)/);
  assert.match(bridge,/callAsyncJavaScript\([\s\S]*?arguments: \["detail": event\]/);
  const transport=readFileSync('ios/EvaOrbitHost/Sources/AIStream.swift','utf8');
  assert.match(transport,/httpCookieStorage = nil/);assert.match(transport,/urlCredentialStorage = nil/);assert.match(transport,/completionHandler\(nil\)/);
  const runtime=readFileSync('ios/EvaOrbitHost/Sources/AIRuntime.swift','utf8');
  assert.match(runtime,/request.httpShouldHandleCookies = false/);
  assert(!runtime.includes('SELF_PERSONA'));assert(!runtime.includes('business.request'));assert(!runtime.includes('service_role'));
});
