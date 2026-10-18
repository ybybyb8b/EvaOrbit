import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { LocalTrackerStore } from '../src/lib/tracker-local-store.ts';

// This runner never accepts a hosted target or silently uses .env.local.
assert.equal(process.env.TRACKER_ISOLATED_SUPABASE, '1', 'Explicit isolated-stack opt-in required');
function loopback(raw) {
  const url = new URL(raw);
  assert(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Hosted targets are forbidden');
  return raw;
}

if (process.argv.includes('--mcp')) {
  loopback(process.env.SUPABASE_URL);
  const input = JSON.parse(await new Promise(resolve => { let data=''; process.stdin.setEncoding('utf8'); process.stdin.on('data',chunk=>data+=chunk); process.stdin.on('end',()=>resolve(data)); }));
  const { withMcpRequestRepository } = await import('../src/lib/repositories/index.ts');
  const { mcpHandler } = await import('../src/lib/mcp/server.ts');
  try {
    // Authenticate using a real local Auth JWT. Exercise the production MCP
    // handler/repository/RLS; hosted OAuth consent and audience issuance are separate.
    const result = await withMcpRequestRepository({userId:input.userId,accessToken:input.token}, async () => {
      const response = await mcpHandler.fetch(new Request('http://127.0.0.1/api/mcp', {method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-03-26'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:input.name,arguments:input.arguments}})}));
      assert.equal(response.status,200);
      const raw=await response.text();
      const envelope=JSON.parse(response.headers.get('content-type')?.includes('text/event-stream') ? raw.split('\n').find(line=>line.startsWith('data:')).slice(5) : raw);
      assert.equal(envelope.error,undefined);
      assert.notEqual(envelope.result.isError,true,JSON.stringify(envelope.result));
      return envelope.result.structuredContent;
    });
    console.log('TRACKER_MCP_RESULT='+JSON.stringify(result));
  } finally { await mcpHandler.close(); }
} else {
  assert.equal(process.env.CI,'true','Run only inside the disposable CI runner');
  const stack=JSON.parse(await fs.readFile(process.env.TRACKER_STACK_STATUS,'utf8'));
  const url=loopback(stack.API_URL), databaseUrl=loopback(stack.DB_URL);
  assert(stack.ANON_KEY && stack.SERVICE_ROLE_KEY,'Local CLI keys required');
  const sql=postgres(databaseUrl,{max:1,prepare:false,onnotice:()=>undefined});
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'eo-tracker-isolation-'));
  let server;
  let serverLog='';
  const password='Fixture-'+crypto.randomUUID();
  const email='tracker-owner@example.test', otherEmail='tracker-other@example.test';
  const clientOptions={auth:{autoRefreshToken:false,persistSession:false}};
  const admin=createClient(url,stack.SERVICE_ROLE_KEY,clientOptions);
  const env={...process.env,SUPABASE_URL:url,SUPABASE_PUBLISHABLE_KEY:stack.ANON_KEY,SUPABASE_SECRET_KEY:'',DATABASE_URL:databaseUrl,EVAORBIT_DATA_BACKEND:'supabase',EVAORBIT_ALLOWED_EMAIL:email,EVAORBIT_ENCRYPTION_KEY:'a'.repeat(64),EVAORBIT_NEXT_DIST_DIR:'.next-tracker-isolated',VERCEL:'',HTTP_PROXY:'',HTTPS_PROXY:'',NODE_USE_ENV_PROXY:'',NODE_ENV:'development'};
  const jar=new Map();
  const origin='http://127.0.0.1:4186';
  async function api(route,method='GET',body,cookies=jar) {
    const response=await fetch(origin+route,{method,redirect:'manual',headers:{'Content-Type':'application/json',Cookie:[...cookies].map(([key,value])=>`${key}=${value}`).join('; ')},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(90000)});
    for(const cookie of response.headers.getSetCookie()) { const [pair]=cookie.split(';'); const split=pair.indexOf('='); cookies.set(pair.slice(0,split),pair.slice(split+1)); }
    return response;
  }
  async function json(route,method,body) { const response=await api(route,method,body); assert(response.ok,`${route}: ${response.status} ${await response.clone().text()}`); return response.status===204?null:response.json(); }
  let diskPath=path.join(directory,'state.json');
  const storage={
    async read(){try{return JSON.parse(await fs.readFile(diskPath,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}},
    async commit(revision,next){const saved=await this.read();if((saved?.revision??0)!==revision)return false;const temporary=diskPath+'.new';await fs.writeFile(temporary,JSON.stringify(next));await fs.rename(temporary,diskPath);return true;},
  };
  const migrationFile='202610180001_tracker_local_sync.sql';
  const migrationPath=path.resolve('supabase/migrations');
  async function migrate(file){await sql.unsafe(await fs.readFile(path.join(migrationPath,file),'utf8'));}
  try {
    for(const file of (await fs.readdir(migrationPath)).filter(file=>file.endsWith('.sql')&&file<migrationFile).sort()) await migrate(file);
    const owner=await admin.auth.admin.createUser({email,password,email_confirm:true}); assert.ifError(owner.error);
    const other=await admin.auth.admin.createUser({email:otherEmail,password,email_confirm:true}); assert.ifError(other.error);
    const account=owner.data.user.id, otherAccount=other.data.user.id;
    const before=await sql`insert into public.trackers(user_id,name) values(${account},'Before migration') returning id`;
    server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','4186'],{env,stdio:['ignore','pipe','pipe']});
    server.stdout.on('data',chunk=>serverLog+=chunk);server.stderr.on('data',chunk=>serverLog+=chunk);
    for(let attempt=0;attempt<90;attempt++){try{if((await api('/api/native/session')).ok)break;}catch{}if(server.exitCode!==null)throw new Error('Isolated Next server exited');await new Promise(resolve=>setTimeout(resolve,1000));}
    const login=await json('/api/native/session','POST',{email,password});assert.equal(login.accountId,account);
    let replica=new LocalTrackerStore(account,storage);await replica.initialize();
    const localTracker=await replica.createTracker({name:'Local parent',groupName:'PoC',quickCaptureEnabled:false},{key:crypto.randomUUID(),name:'Count',type:'number'});
    const localEntry=await replica.save('tracker_entry',undefined,{trackerLocalId:localTracker,occurredAt:'2026-10-18T06:00:00Z',values:{},note:'retained offline'});
    const transport=request=>json('/api/native/sync','POST',request);
    await assert.rejects(()=>replica.synchronize(transport));
    assert.equal(replica.getSnapshot().outbox.length,3,'Missing migration must preserve all queued commands');
    const frozen=JSON.stringify(replica.getSnapshot().outbox[0].wire);
    await migrate(migrationFile);await migrate(migrationFile);
    assert.equal((await sql`select name from public.trackers where id=${before[0].id}`)[0].name,'Before migration');
    await sql`notify pgrst,'reload schema'`;
    // Poll schema discovery without uploading or changing the retained queue.
    for(let attempt=0;attempt<30;attempt++){const response=await api('/api/native/sync','POST',{protocolVersion:2,accountId:account,mutations:[]});if(response.ok)break;await new Promise(resolve=>setTimeout(resolve,1000));}
    replica=new LocalTrackerStore(account,storage);await replica.initialize();
    assert.equal(JSON.stringify(replica.getSnapshot().outbox[0].wire),frozen);
    let drop=true;
    await assert.rejects(()=>replica.synchronize(async request=>{const response=await transport(request);if(drop){drop=false;throw new Error('Committed response lost');}return response;}));
    replica=new LocalTrackerStore(account,storage);await replica.initialize();await replica.synchronize(transport);
    assert.equal(replica.getSnapshot().outbox.length,0);
    const parent=replica.getSnapshot().records.find(row=>row.id===localTracker).serverId;
    const entry=replica.getSnapshot().records.find(row=>row.id===localEntry).serverId;
    assert.equal((await sql`select count(*)::int n from public.trackers where user_id=${account} and name='Local parent'`)[0].n,1,'Response loss must not duplicate create');
    let detail=await json(`/api/trackers/${parent}`);assert(detail.entries.some(row=>row.id===entry),'Local write visible through real Web API');
    await json(`/api/trackers/${parent}/entries?entryId=${entry}`,'PATCH',{note:'Web update'});await replica.synchronize(transport);
    assert.equal(replica.getSnapshot().records.find(row=>row.id===localEntry).payload.note,'Web update');
    const auth=createClient(url,stack.ANON_KEY,clientOptions);const session=await auth.auth.signInWithPassword({email,password});assert.ifError(session.error);
    function mcp(name,args,identity={userId:account,token:session.data.session.access_token}) {
      const result=spawnSync(process.execPath,['--conditions=react-server','--experimental-loader',pathToFileURL(path.resolve('scripts/typescript-test-loader.mjs')).href,'scripts/tracker-isolated-sync.mjs','--mcp'],{env,input:JSON.stringify({...identity,name,arguments:args}),encoding:'utf8',timeout:90000});
      assert.equal(result.status,0,result.stderr);const line=result.stdout.split('\n').find(line=>line.startsWith('TRACKER_MCP_RESULT='));assert(line,'MCP result missing');return JSON.parse(line.slice('TRACKER_MCP_RESULT='.length));
    }
    const mcpRead=mcp('eo_get',{resource:'tracker',id:parent});assert(mcpRead.item.entries.some(row=>row.id===entry),'Local record visible to MCP handler');
    const mcpCreated=mcp('eo_action',{resource:'tracker',id:parent,action:'create_entry',data:{occurred_at:'2026-10-18T07:00:00Z',values:{},note:'MCP create'}}).result;
    await replica.synchronize(transport);assert(replica.getSnapshot().records.some(row=>row.resourceType==='tracker_entry'&&row.serverId===mcpCreated.id),'MCP create must reach replica');
    await replica.save('tracker_entry',localEntry,{trackerLocalId:localTracker,note:'Local concurrent'});
    mcp('eo_action',{resource:'tracker',id:parent,action:'update_entry',data:{entry_id:entry,note:'MCP concurrent'}});
    await replica.synchronize(transport);assert.equal(replica.getSnapshot().records.find(row=>row.id===localEntry).status,'conflict');
    await replica.resolve(localEntry,'local');await replica.synchronize(transport);
    detail=await json(`/api/trackers/${parent}`);assert.equal(detail.entries.find(row=>row.id===entry).note,'Local concurrent');
    await replica.save('tracker_entry',localEntry,{trackerLocalId:localTracker,note:'Dirty remote delete'});
    mcp('eo_action',{resource:'tracker',id:parent,action:'delete_entry',data:{child_id:entry}});
    await replica.synchronize(transport);assert.equal(replica.getSnapshot().records.find(row=>row.id===localEntry).remote,null);await replica.resolve(localEntry,'remote');
    mcp('eo_action',{resource:'tracker',id:parent,action:'delete_entry',data:{child_id:mcpCreated.id}});
    await replica.synchronize(transport);assert(!replica.getSnapshot().records.some(row=>row.resourceType==='tracker_entry'&&row.serverId===mcpCreated.id));
    const otherAuth=createClient(url,stack.ANON_KEY,clientOptions);const otherSession=await otherAuth.auth.signInWithPassword({email:otherEmail,password});assert.ifError(otherSession.error);
    assert.deepEqual((await otherAuth.from('trackers').select('*')).data,[]);
    assert((await otherAuth.rpc('tracker_sync_v2',{p_account:account,p_operations:[]})).error,'Wrong-account RPC must fail');
    const otherMcp=mcp('eo_search',{resource:'tracker'},{userId:otherAccount,token:otherSession.data.session.access_token});assert.equal(otherMcp.items.length,0);
    assert.equal((await api('/api/native/sync','POST',{protocolVersion:2,accountId:otherAccount,mutations:[]})).status,409);
    assert.equal((await api('/api/native/sync','POST',{protocolVersion:2,accountId:account,mutations:[]},new Map())).status,401);
    // Offline, HTTP auth failure, re-login and restart must not erase the queue.
    const pending=await replica.save('tracker_entry',undefined,{trackerLocalId:localTracker,occurredAt:'2026-10-18T08:00:00Z',values:{},note:'Recovery queue'});
    await assert.rejects(()=>replica.synchronize(async()=>{throw new Error('Disconnected');}));
    await json('/api/native/session','DELETE');await assert.rejects(()=>replica.synchronize(transport));
    const retained=await storage.read();assert(retained.outbox.some(item=>item.localId===pending));
    await json('/api/native/session','POST',{email,password});replica=new LocalTrackerStore(account,storage);await replica.initialize();await replica.synchronize(transport);
    assert.equal(replica.getSnapshot().outbox.length,0);
    // Roll back the transport API only; additive schema and receipts are retained.
    const rollback=await replica.save('tracker_entry',undefined,{trackerLocalId:localTracker,occurredAt:'2026-10-18T09:00:00Z',values:{},note:'API rollback queue'});
    await sql`alter function public.tracker_sync_v2(uuid,jsonb) rename to tracker_sync_v2_rollback`;await sql`notify pgrst,'reload schema'`;
    await new Promise(resolve=>setTimeout(resolve,2000));await assert.rejects(()=>replica.synchronize(transport));assert(replica.getSnapshot().outbox.some(item=>item.localId===rollback));
    await sql`alter function public.tracker_sync_v2_rollback(uuid,jsonb) rename to tracker_sync_v2`;await sql`notify pgrst,'reload schema'`;await new Promise(resolve=>setTimeout(resolve,2000));
    await replica.synchronize(transport);assert.equal(replica.getSnapshot().outbox.length,0);
    console.log('PASS isolated Supabase: all baseline migrations; migration repeat/data preservation; real Next API + MCP business handler bidirectional sync; response loss; concurrent edit; dirty/clean delete; two-account RLS; 401/relogin; API rollback/queue recovery');
  } catch(error) {
    // Only fixture server logs; never print CLI status, passwords or session JWTs.
    await fs.writeFile(path.join(directory,'next.log'),serverLog);
    console.error('Isolated validation failed; temporary fixture log:',path.join(directory,'next.log'));
    throw error;
  } finally {
    if(server&&server.exitCode===null){const exited=once(server,'exit');server.kill('SIGTERM');await exited;}
    await sql.end();
  }
}
