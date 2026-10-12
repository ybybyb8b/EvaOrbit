import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

test("missing Bark storage returns an actionable initialization error", () => {
  const result = spawnSync(process.execPath, ["--experimental-loader", "./scripts/typescript-test-loader.mjs", "--input-type=module", "--eval", `
    import assert from "node:assert/strict";
    import {createMcpSupabaseRepository} from "./src/lib/repositories/supabase.ts";
    import {HttpError} from "./src/lib/errors.ts";
    const repository=await createMcpSupabaseRepository("test","owner");
    for(const code of ["PGRST205","PGRST204","42P01","42703"]){
      globalThis.fetch=async()=>Response.json({code,message:"Missing relation"},{status:404});
      const check=error=>error instanceof HttpError&&error.status===503&&error.message.includes("数据库迁移");
      await assert.rejects(repository.getBarkSettings(),check);
      await assert.rejects(repository.saveBarkSettings({enabled:false,ciphertext:"cipher",iv:"iv",authTag:"tag"}),check);
    }
  `], {cwd:process.cwd(),encoding:"utf8",env:{...process.env,SUPABASE_URL:"https://database.example.test",SUPABASE_PUBLISHABLE_KEY:"test"}});
  assert.equal(result.status,0,result.stderr||result.stdout);
});

test("Bark migration is repeatable and isolates account settings with RLS", { skip: process.env.EVENTKIT_PGLITE_PATH ? false : "Set EVENTKIT_PGLITE_PATH for SQL validation" }, async () => {
  const { PGlite } = await import(pathToFileURL(process.env.EVENTKIT_PGLITE_PATH).href);
  const db = new PGlite();
  try {
    await db.exec("create schema auth;create role authenticated;create role service_role;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select current_setting('test.owner_id',true)::uuid$$;grant usage on schema auth to authenticated;insert into auth.users values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');");
    const migration = readFileSync("supabase/migrations/202610130001_bark_notifications.sql", "utf8");
    await db.exec(migration); await db.exec(migration);
    const hostLinks = readFileSync("supabase/migrations/202610130002_bark_host_links.sql", "utf8");
    await db.exec(hostLinks); await db.exec(hostLinks);
    await db.exec("insert into bark_notification_settings(user_id,ciphertext,iv,auth_tag) values('00000000-0000-4000-8000-000000000001','one','iv','tag'),('00000000-0000-4000-8000-000000000002','two','iv','tag');set role authenticated;set test.owner_id='00000000-0000-4000-8000-000000000001';");
    assert.deepEqual((await db.query("select ciphertext from bark_notification_settings")).rows, [{ ciphertext: "one" }]);
    assert.equal((await db.query("select open_in_host from bark_notification_settings")).rows[0].open_in_host,false);
    assert.equal((await db.query("update bark_notification_settings set enabled=true where ciphertext='two' returning *")).rows.length, 0);
    await assert.rejects(db.query("insert into bark_notification_settings(user_id,ciphertext,iv,auth_tag) values('00000000-0000-4000-8000-000000000003','x','iv','tag')"));
  } finally { await db.close(); }
});

test("scheduled Bark reminders deduplicate, repeat daily, stop after completion and retry failures", () => {
  const result = spawnSync(process.execPath, ["--experimental-loader", "./scripts/typescript-test-loader.mjs", "--input-type=module", "--eval", `
    import assert from "node:assert/strict";
    import { encryptAiApiKey } from "./src/lib/ai-secret.ts";
    import { deliverDueReminderPushes } from "./src/lib/push/deliver.ts";
    const encrypted=encryptAiApiKey("abcdefgh12345678");
    const reminder={id:42,user_id:"owner",title:"Clean bowl",source_type:"cat_routine",source_id:1,target_type:"cat",target_id:null,schedule_type:"interval",interval_value:1,next_due_at:"2026-10-10T15:00:00.000Z",overdue_after:null,due_has_explicit_time:true,repeat_while_overdue:true,is_active:true,status:"scheduled",timezone:"Asia/Shanghai",delivery_channel:"apple_reminders",last_notified_at:null,lead_time_minutes:0};
    const tables={reminders:[reminder],notification_deliveries:[],bark_notification_settings:[{user_id:"owner",enabled:true,open_in_host:true,ciphertext:encrypted.ciphertext,iv:encrypted.iv,auth_tag:encrypted.authTag}]};
    let sent=0,webReads=0,accept=true;
    globalThis.fetch=async(input,options={})=>{
      const url=new URL(typeof input==="string"?input:input.url??String(input));
      if(url.hostname==="api.day.app"){sent++;const body=JSON.parse(options.body);assert.equal(body.device_key,"abcdefgh12345678");assert.equal(body.url,"evaorbit://open/settings/notifications?reminderId=42");return Response.json({code:accept?200:500});}
      const table=url.pathname.split("/").at(-1);if(table==="push_subscriptions")webReads++;
      const rows=tables[table]??[];
      const match=row=>[...url.searchParams].every(([key,value])=>!value.startsWith("eq.")||String(row[key])===value.slice(3));
      if(options.method==="POST"){const row={id:rows.length+1,...JSON.parse(options.body)};rows.push(row);return Response.json(row,{status:201});}
      if(options.method==="PATCH"){const patch=JSON.parse(options.body);for(const row of rows.filter(match))Object.assign(row,patch);return new Response(null,{status:204});}
      return Response.json(rows.filter(match));
    };
    let result=await deliverDueReminderPushes(new Date("2026-10-10T15:00:00Z"));assert.equal(sent,0);
    result=await deliverDueReminderPushes(new Date("2026-10-11T15:00:00Z"));assert.equal(result.sent,1);assert.equal(sent,1);assert.equal(webReads,0);
    await deliverDueReminderPushes(new Date("2026-10-11T15:01:00Z"));assert.equal(sent,1);
    await deliverDueReminderPushes(new Date("2026-10-12T15:00:00Z"));assert.equal(sent,2);
    reminder.is_active=false;reminder.status="completed";
    await deliverDueReminderPushes(new Date("2026-10-13T15:00:00Z"));assert.equal(sent,2);
    reminder.is_active=true;reminder.status="scheduled";accept=false;
    await deliverDueReminderPushes(new Date("2026-10-13T15:00:00Z"));assert.equal(sent,3);assert.equal(webReads,0);
    assert.equal(tables.notification_deliveries.at(-1).status,"failed");accept=true;
    await deliverDueReminderPushes(new Date("2026-10-13T15:01:00Z"));assert.equal(sent,4);assert.equal(tables.notification_deliveries.length,3);assert.equal(tables.notification_deliveries.at(-1).status,"sent");
  `], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, SUPABASE_URL: "https://database.example.test", SUPABASE_PUBLISHABLE_KEY: "test", SUPABASE_SECRET_KEY: "test", EVAORBIT_ENCRYPTION_KEY: "b".repeat(64), EVAORBIT_VAPID_PRIVATE_KEY: "", EVAORBIT_VAPID_PUBLIC_KEY: "", EVAORBIT_VAPID_SUBJECT: "" } });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("Bark settings encrypt keys, keep public responses secret-free and route exclusively to Bark", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "eo-bark-"));
  try {
    const result = spawnSync(process.execPath, ["--experimental-loader", "./scripts/typescript-test-loader.mjs", "--input-type=module", "--eval", `
      import assert from "node:assert/strict";
      import webpush from "web-push";
      import * as db from "./src/lib/db.ts";
      import { sqliteRepository } from "./src/lib/repositories/sqlite.ts";
      import { getBarkStatus,saveBarkConnection,testBarkConnection } from "./src/lib/services/bark.ts";
      import { notifyLuciusActivity } from "./src/lib/services/push.ts";
      import { resolveAiApiKey } from "./src/lib/ai-secret.ts";
      assert.deepEqual(await getBarkStatus(),{configured:false,enabled:false,openInHost:false});
      await assert.rejects(saveBarkConnection({enabled:true}));
      const key="abcdefgh12345678";
      assert.deepEqual(await saveBarkConnection({url:"https://api.day.app/"+key,enabled:false}),{configured:true,enabled:false,openInHost:false});
      assert.notEqual(db.getBarkSettings().ciphertext,key);
      assert.equal(resolveAiApiKey(db.getBarkSettings()),key);
      let sent=[];let webSent=0;
      globalThis.fetch=async (url,options)=>{assert.equal(url,"https://api.day.app/push");sent.push(JSON.parse(options.body));return Response.json({code:200});};
      assert.deepEqual(await testBarkConnection(),{accepted:true});
      assert.equal(sent[0].url,"https://eva-orbit.vercel.app/settings/notifications");
      await saveBarkConnection({enabled:true});
      webpush.setVapidDetails=()=>{};webpush.sendNotification=async()=>{webSent++;};
      await notifyLuciusActivity(sqliteRepository);
      assert.equal(sent.length,2);assert.equal(webSent,0);
      assert.deepEqual(await getBarkStatus(),{configured:true,enabled:true,openInHost:false});
      await saveBarkConnection({enabled:true,openInHost:true});
      await testBarkConnection();assert.equal(sent.at(-1).url,"evaorbit://open/settings/notifications");
      await notifyLuciusActivity(sqliteRepository);assert.equal(sent.at(-1).url,"evaorbit://open/lucius");
      await assert.rejects(saveBarkConnection({enabled:true,openInHost:"yes"}));
      globalThis.fetch=async()=>Response.json({code:500},{status:500});
      await notifyLuciusActivity(sqliteRepository);assert.equal(webSent,0);
      await assert.rejects(testBarkConnection());
      await saveBarkConnection({enabled:false});
      db.upsertPushSubscription({endpoint:"https://push.example.com",p256dh:"test",auth:"test"});
      await notifyLuciusActivity(sqliteRepository);assert.equal(webSent,1);
      await assert.rejects(saveBarkConnection({url:"http://localhost/abcdefgh123",enabled:true}));
      assert.equal(resolveAiApiKey(db.getBarkSettings()),key);
    `], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, EVAORBIT_DATA_BACKEND: "sqlite", EVAORBIT_SQLITE_PATH: path.join(directory, "test.db"), NODE_ENV: "development", VERCEL: "", EVAORBIT_ENCRYPTION_KEY: "a".repeat(64), EVAORBIT_VAPID_PUBLIC_KEY: "test", EVAORBIT_VAPID_PRIVATE_KEY: "test", EVAORBIT_VAPID_SUBJECT: "mailto:test@example.com" } });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
