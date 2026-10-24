import assert from "node:assert/strict";
import {mkdtempSync,rmSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import test from "node:test";

test("software persists across database opens without changing subscription or reminder tables",()=>{
 const directory=mkdtempSync(path.join(tmpdir(),"eo-software-library-")),env={...process.env,EVAORBIT_DATA_BACKEND:"sqlite",EVAORBIT_SQLITE_PATH:path.join(directory,"test.db"),VERCEL:""};
 const run=code=>{const result=spawnSync(process.execPath,["--experimental-loader",pathToFileURL(path.resolve("scripts/typescript-test-loader.mjs")).href,"--input-type=module","--eval",code],{encoding:"utf8",env});assert.equal(result.status,0,result.stderr||result.stdout);};
 try{
  run(String.raw`
   import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
   import {createSoftwareLibraryEntry,updateSoftwareLibraryEntry,listSoftwareLibrary,deleteSoftwareLibraryEntry} from './src/lib/services/software-library.ts';
   import * as original from './src/lib/db.ts';
   original.createSubscription({name:'Existing',currentAmountMinor:1200,currency:'CNY',billingIntervalValue:1,billingIntervalUnit:'month',startedOn:'2026-01-01',nextRenewalOn:'2099-01-01',autoRenew:false,reminderEnabled:false,reminderDaysBefore:3,reminderTime:null,notes:'Keep'});
   const sql=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
   for(const name of ['subscriptions','subscription_payments','subscription_price_changes','reminders'])for(const op of ['INSERT','UPDATE','DELETE'])sql.exec('CREATE TRIGGER "no_'+name+op+'" BEFORE '+op+' ON '+name+" BEGIN SELECT RAISE(ABORT,'Software wrote subscription data'); END");
   const input={name:'My free tool',platforms:['macOS','iOS'],license:'perpetual',acquisition:'giveaway',website:'https://example.com/tool',notes:'Original note'};
   const item=await createSoftwareLibraryEntry(input);assert.equal(item.acquiredOn,null);assert.equal(item.id,1);
   await updateSoftwareLibraryEntry(item.id,{...input,name:'Updated',license:'version',version:'V2',acquiredOn:'2026-10-24'});
   assert.equal((await listSoftwareLibrary())[0].version,'V2');assert.equal((await listSoftwareLibrary())[0].acquiredOn,'2026-10-24');
   await assert.rejects(createSoftwareLibraryEntry({...input,platforms:[]}));assert.equal((await listSoftwareLibrary()).length,1);
   const temp=await createSoftwareLibraryEntry({...input,name:'Remove me'});assert.equal(await deleteSoftwareLibraryEntry(temp.id),true);assert.equal(await deleteSoftwareLibraryEntry(temp.id),false);
   assert.equal(await updateSoftwareLibraryEntry(9999,input),null);assert.equal(original.listSubscriptions()[0].name,'Existing');
   assert.equal(sql.prepare('SELECT count(*) AS n FROM subscription_payments').get().n,0);assert.equal(sql.prepare('SELECT count(*) AS n FROM reminders').get().n,0);
   assert.equal(sql.prepare('SELECT count(*) AS n FROM migrations WHERE version=83').get().n,1);sql.close();
  `);
  run(String.raw`import assert from 'node:assert/strict';import {listSoftwareLibrary} from './src/lib/services/software-library.ts';const items=await listSoftwareLibrary();assert.equal(items.length,1);assert.equal(items[0].name,'Updated');assert.equal(items[0].acquiredOn,'2026-10-24');`);
 }finally{rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});

test("software Postgres migration is repeatable and isolates accounts with RLS",async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function public.set_updated_at() returns trigger language plpgsql as $$begin NEW.updated_at=now();return NEW;end$$;
   grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;
   insert into auth.users values('10000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002');
   create table subscriptions(id int primary key,name text);insert into subscriptions values(1,'Keep me');`);
  const sql=readFileSync('supabase/migrations/202610240001_software_library.sql','utf8');await db.exec(sql);await db.exec(sql);const icons=readFileSync('supabase/migrations/202610240002_software_library_icon.sql','utf8');await db.exec(icons);await db.exec(icons);
  await db.exec(`set role authenticated;set request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';insert into software_library(name,platforms,license,acquisition) values('Tool','["macOS"]','perpetual','giveaway');`);
  const own=(await db.query('select * from software_library')).rows[0];assert.equal(own.acquired_on,null);assert.equal(own.icon_path,'');await db.exec("update software_library set icon_path='owner.png'");
  await assert.rejects(db.exec(`insert into software_library(user_id,name,platforms,license,acquisition) values('20000000-0000-4000-8000-000000000002','Other','["macOS"]','perpetual','paid')`));
  await assert.rejects(db.exec(`insert into software_library(name,platforms,license,acquisition) values('Bad','["unknown"]','perpetual','paid')`));
  await db.exec(`set request.jwt.claim.sub='20000000-0000-4000-8000-000000000002'`);
  assert.equal((await db.query('select * from software_library')).rows.length,0);
  await db.exec(`update software_library set name='Stolen',icon_path='stolen.png';delete from software_library;reset role;`);
  assert.equal((await db.query('select name,icon_path from software_library')).rows[0].icon_path,'owner.png');assert.equal((await db.query('select name from software_library')).rows[0].name,'Tool');assert.equal((await db.query('select name from subscriptions')).rows[0].name,'Keep me');
 }finally{await db.close();}
});

test("software icons upload, replace, survive edits, reset and clean up without touching subscription icons",()=>{
 const directory=mkdtempSync(path.join(tmpdir(),"eo-software-icons-")),env={...process.env,EVAORBIT_DATA_BACKEND:"sqlite",EVAORBIT_SQLITE_PATH:path.join(directory,"test.db"),EVAORBIT_SOFTWARE_ICON_DIR:path.join(directory,"icons"),VERCEL:""};
 try{const result=spawnSync(process.execPath,["--experimental-loader",pathToFileURL(path.resolve("scripts/typescript-test-loader.mjs")).href,"--input-type=module","--eval",`
 import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {DatabaseSync} from 'node:sqlite';
 import {createSoftwareLibraryEntry,updateSoftwareLibraryEntry,deleteSoftwareLibraryEntry,listSoftwareLibrary} from './src/lib/services/software-library.ts';
 import {saveSoftwareLibraryIcon,readSoftwareLibraryIcon,resetSoftwareLibraryIcon} from './src/lib/services/software-library-icon.ts';
 const input={name:'Tool',platforms:['macOS'],license:'perpetual',acquisition:'giveaway'},item=await createSoftwareLibraryEntry(input);assert.equal(item.iconPath,'');
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jK1sAAAAASUVORK5CYII=','base64'),image=new File([bytes],'icon.png',{type:'image/png'});
 await assert.rejects(saveSoftwareLibraryIcon(item.id,new File(['<svg/>'],'fake.png')));await assert.rejects(saveSoftwareLibraryIcon(item.id,new File([new Uint8Array(4194305)],'large.png')));assert.equal(await saveSoftwareLibraryIcon(99999,image),null);
 const first=await saveSoftwareLibraryIcon(item.id,image),second=await saveSoftwareLibraryIcon(item.id,image);assert.notEqual(first.iconPath,second.iconPath);assert.equal(await readSoftwareLibraryIcon(item.id,first.iconPath),null);assert.deepEqual(Buffer.from((await readSoftwareLibraryIcon(item.id,second.iconPath)).bytes),bytes);
 const edited=await updateSoftwareLibraryEntry(item.id,{...input,name:'Changed',iconPath:'../bad'});assert.equal(edited.iconPath,second.iconPath);
 const folder=path.join(process.env.EVAORBIT_SOFTWARE_ICON_DIR,String(item.id));assert.deepEqual(await fs.readdir(folder),[second.iconPath]);
 const sql=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);sql.exec("CREATE TRIGGER reject_icon BEFORE UPDATE OF icon_path ON software_library BEGIN SELECT RAISE(ABORT,'test rollback'); END");await assert.rejects(saveSoftwareLibraryIcon(item.id,image));assert.deepEqual(await fs.readdir(folder),[second.iconPath]);sql.exec('DROP TRIGGER reject_icon');
 await resetSoftwareLibraryIcon(item.id);assert.equal(await readSoftwareLibraryIcon(item.id,null),null);assert.deepEqual(await fs.readdir(folder),[]);await saveSoftwareLibraryIcon(item.id,image);await deleteSoftwareLibraryEntry(item.id);assert.deepEqual(await fs.readdir(folder),[]);assert.equal((await listSoftwareLibrary()).length,0);
 for(const table of ['subscriptions','subscription_payments','subscription_price_changes','reminders'])assert.equal(sql.prepare('select count(*) n from '+table).get().n,0);sql.close();
 `],{encoding:"utf8",env});assert.equal(result.status,0,result.stderr||result.stdout);}finally{rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});
