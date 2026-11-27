import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

test("Days generic MCP protocol preserves lunar dates, shared colors, partial updates and owned reminder lifecycle",()=>{
  const directory=mkdtempSync(path.join(tmpdir(),"eo-days-mcp-"));
  try{
    const result=spawnSync(process.execPath,["--experimental-loader",pathToFileURL(path.resolve("scripts/typescript-test-loader.mjs")).href,"--input-type=module","--eval",String.raw`
      import assert from 'node:assert/strict';
      import {mcpHandler,withFixtureRepository} from './scripts/mcp-business-fixture.mjs';
      import {getRepository} from './src/lib/repositories/index.ts';
      import {importantDateReminderAt} from './src/lib/important-dates.ts';
      import {getImportantDate} from './src/lib/services/important-dates.ts';
      let requestId=0;
      async function call(name,args={}){
        return withFixtureRepository({userId:'local',accessToken:'synthetic'},async()=>{
          const response=await mcpHandler.fetch(new Request('http://localhost/api/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-03-26'},body:JSON.stringify({jsonrpc:'2.0',id:++requestId,method:'tools/call',params:{name,arguments:args}})}));
          assert.equal(response.status,200);const text=await response.text();const payload=JSON.parse(response.headers.get('content-type')?.includes('text/event-stream')?text.split('\n').find(line=>line.startsWith('data:')).slice(5):text);
          assert.equal(payload.error,undefined,JSON.stringify(payload));assert.notEqual(payload.result.isError,true,JSON.stringify(payload.result));return payload.result.structuredContent;
        });
      }
      const resources=(await call('eo_resources')).resources;
      assert.ok(resources.some(item=>item.resource==='important_date'));assert.ok(resources.some(item=>item.resource==='important_date_category'));
      const schema=(await call('eo_schema',{resource:'important_date'})).schema;
      assert.equal(schema.search_schema.pagination,'cursor');assert.ok(schema.fields.lunar.properties.leap);
      const first=(await call('eo_create',{resource:'important_date',data:{title:'妈妈农历生日',calendar:'lunar',lunar:{year:2025,month:6,day:1,leap:true},lunar_leap_policy:'skip',recurrence:'yearly',category:'生日',category_color:'#75846F',note:'保留备注',reminder_time:'09:30',reminder_days_before:1}})).item;
      const repo=await getRepository();
      let owned=(await repo.listReminders({targetType:'important_date',targetId:first.id}))[0];assert.ok(owned);
      assert.equal(owned.nextDueAt,importantDateReminderAt(await getImportantDate(first.id)));const reminderId=owned.id;
      await repo.updateReminder(reminderId,{status:'sent',lastNotifiedAt:new Date().toISOString()});
      await call('eo_update',{resource:'important_date',id:first.id,data:{note:'只修改备注'}});
      assert.equal((await repo.getReminder(reminderId)).status,'sent');
      const second=(await call('eo_create',{resource:'important_date',data:{title:'另一生日',date:'2000-01-01',category:'生日'}})).item;
      await call('eo_update',{resource:'important_date',id:second.id,data:{category_color:'#718597'}});
      const renamed=(await call('eo_update',{resource:'important_date',id:first.id,data:{title:'妈妈的农历生日'}})).item;
      assert.equal(renamed.category_color,'#718597');assert.equal(renamed.reminder_time,'09:30');assert.equal(renamed.note,'只修改备注');assert.equal(renamed.lunar_leap_policy,'skip');
      await call('eo_action',{resource:'important_date',id:first.id,action:'pin'});
      assert.equal((await getImportantDate(first.id)).pinned,true);
      await call('eo_action',{resource:'important_date',id:first.id,action:'archive'});
      assert.equal((await repo.getReminder(reminderId)).isActive,false);
      assert.equal((await call('eo_search',{resource:'important_date',filters:{status:'archived'}})).items[0].id,first.id);
      await call('eo_action',{resource:'important_date',id:first.id,action:'restore'});
      assert.equal((await repo.getReminder(reminderId)).isActive,true);
      const changed=(await call('eo_update',{resource:'important_date',id:first.id,data:{lunar:{year:2025,month:6,day:2,leap:true},lunar_leap_policy:'regular'}})).item;
      assert.equal(changed.date,'2025-07-26');assert.equal((await repo.getReminder(reminderId)).nextDueAt,importantDateReminderAt(await getImportantDate(first.id)));
      const categories=(await call('eo_search',{resource:'important_date_category'})).items;assert.equal(categories[0].active_count,2);assert.equal(categories[0].color,'#718597');
      await call('eo_delete',{resource:'important_date',id:first.id});
      assert.equal(await getImportantDate(first.id),null);assert.equal((await repo.getReminder(reminderId)).isActive,false);
      assert.equal((await repo.listReminders({targetType:'important_date',targetId:first.id})).length,1);
    `],{env:{...process.env,EVAORBIT_DATA_BACKEND:"sqlite",EVAORBIT_SQLITE_PATH:path.join(directory,"qa.db"),VERCEL:""},encoding:"utf8",timeout:90000});
    assert.equal(result.status,0,result.stderr||result.stdout);
  }finally{rmSync(directory,{recursive:true,force:true});}
});
