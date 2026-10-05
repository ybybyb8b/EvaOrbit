import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

test("EventKit HTTP contracts page all Calendar/mapping rows and directly read linked Tasks", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "evaorbit-eventkit-api-"));
  const program = String.raw`
    import assert from 'node:assert/strict';
    import { register } from 'node:module';
    import { pathToFileURL } from 'node:url';
    import path from 'node:path';
    const root=pathToFileURL(path.join(process.cwd(),'src')+path.sep).href;
    const accountModule='data:text/javascript,'+encodeURIComponent('export async function currentNativeAccount(){return{id:"user"}}');
    const clientModule='data:text/javascript,'+encodeURIComponent('export async function createSupabaseServerClient(){return globalThis.eventKitDBClient}');
    const loader='export async function resolve(specifier,context,nextResolve){'+
      'if(specifier==="@/lib/native-account")return{url:'+JSON.stringify(accountModule)+',shortCircuit:true};'+
      'if(specifier==="@/lib/supabase/server")return{url:'+JSON.stringify(clientModule)+',shortCircuit:true};'+
      'if(specifier==="next/server")return nextResolve("next/server.js",context);'+
      'if(specifier.startsWith("@/"))return nextResolve('+JSON.stringify(root)+'+specifier.slice(2)+".ts",context);'+
      'return nextResolve(specifier,context);}';
    register('data:text/javascript,'+encodeURIComponent(loader),import.meta.url);
    const {NextRequest}=await import('next/server');
    const db=await import('./src/lib/db.ts'),service=await import('./src/lib/services/task.ts');
    const calendar=await import('./src/app/api/calendar-events/route.ts');
    const task=await import('./src/app/api/tasks/[id]/route.ts');
    const mapping=await import('./src/app/api/eventkit/links/route.ts');
    for(let index=0;index<610;index++)db.createCalendarEvent({title:'Page '+index,notes:'',startAt:index%2?'2026-10-10':'2026-10-09',endAt:'2026-10-11',isAllDay:true,timezone:'Asia/Shanghai',location:'',status:'confirmed'});
    const ids=[];let cursor=0;
    for(;;){const response=await calendar.GET(new NextRequest('https://eo.test/api/calendar-events?limit=100&afterId='+cursor));assert.equal(response.status,200);const rows=await response.json();if(!rows.length)break;ids.push(...rows.map(row=>row.id));cursor=rows.at(-1).id;}
    assert.equal(ids.length,610);assert.equal(new Set(ids).size,610);assert.ok(ids.every((id,index)=>!index||id>ids[index-1]));
    assert.equal((await calendar.GET(new NextRequest('https://eo.test/api/calendar-events?afterId=-1'))).status,400);
    assert.equal((await calendar.GET(new NextRequest('https://eo.test/api/calendar-events?limit=501'))).status,400);
    const created=await service.createTask({title:'Linked Task',notes:'',dueDate:null,dueTime:null,priority:'medium',tags:[],reminderMode:'none',reminderDate:null,reminderTime:null,repeatWhileOverdue:false,timezone:'Asia/Shanghai'});
    await service.updateTask(created.id,{completed:true,completedAt:'2026-10-04T00:00:00Z'});
    const get=await task.GET(new NextRequest('https://eo.test/api/tasks/'+created.id),{params:Promise.resolve({id:String(created.id)})});
    assert.equal(get.status,200);assert.equal((await get.json()).completed,true);
    assert.equal((await task.GET(new NextRequest('https://eo.test/api/tasks/99999'),{params:Promise.resolve({id:'99999'})})).status,404);
    const mappingRows=Array.from({length:1305},(_,index)=>({id:index+1,logical_link_id:index+1,entity_type:"calendar_event",eo_id:index+1,eventkit_entity_type:"event",calendar_item_identifier:"apple-"+index,installation_id:"00000000-0000-4000-8000-000000000001"})),pages=[];
    globalThis.eventKitDBClient={from(table){assert.ok(['eventkit_links','eventkit_logical_links','tasks','reminders','calendar_events'].includes(table));let afterId=0;return{select(columns){if(['tasks','reminders','calendar_events'].includes(table))assert.equal(columns,'id');return this;},eq(key){assert.equal(key,'user_id');return this;},gt(key,value){assert.equal(key,'id');afterId=value;return this;},order(key){assert.equal(key,'id');return this;},limit(size){const records=['eventkit_links','eventkit_logical_links'].includes(table)?mappingRows:table==='calendar_events'?mappingRows.filter(row=>row.id!==1304).map(row=>({id:row.id})):[];const data=records.filter(row=>row.id>afterId).slice(0,size);if(table==="eventkit_links")pages.push(data.length);return{returns(){return Promise.resolve({data,error:null});}};}};},rpc:async()=>({data:null,error:{code:'P0001',message:'Invalid EventKit logical link'}})};
    const response=await mapping.GET(new NextRequest('https://eo.test/api/eventkit/links?protocol=2&installationId=00000000-0000-4000-8000-000000000001'));
    assert.equal(response.status,200);const projected=await response.json();assert.equal(projected.length,1305);assert.deepEqual(pages,[500,500,305,0]);
    assert.equal(projected.find(link=>link.eo_id===1305).eo_record_missing,false);assert.equal(projected.find(link=>link.eo_id===1304).eo_record_missing,true);
    const refused=await mapping.PUT(new NextRequest('https://eo.test/api/eventkit/links',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({installationId:'00000000-0000-4000-8000-000000000001',entityType:'task',eoId:1,eventkitEntityType:'reminder',notificationOwner:'eo',lastSyncedHash:'a'.repeat(64),lastSyncedSnapshot:{},calendarItemIdentifier:'apple',calendarIdentifier:'list',sourceIdentifier:'source'})}));
    assert.equal(refused.status,409);assert.equal((await refused.json()).code,'eventkit_eo_missing');
  `;
  try {
    const loader = pathToFileURL(path.join(process.cwd(), "scripts/typescript-test-loader.mjs")).href;
    const result = spawnSync(process.execPath, ["--conditions=react-server", "--experimental-loader", loader, "--input-type=module", "--eval", program], { encoding: "utf8", timeout: 30000, env: { ...process.env, NODE_ENV: "development", EVAORBIT_DATA_BACKEND: "sqlite", EVAORBIT_SQLITE_PATH: path.join(directory, "test.db"), VERCEL: "" } });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
