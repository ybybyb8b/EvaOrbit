import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

test('211/212: correct payment dates without renewal side effects; library costs remain independent, nullable and currency-separated; MCP and backup round trip',()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'eo-subscription-improvements-'));
 const env={...process.env,EVAORBIT_DATA_BACKEND:'sqlite',EVAORBIT_SQLITE_PATH:path.join(directory,'qa.db'),VERCEL:''};
 const run=code=>{const r=spawnSync(process.execPath,['--experimental-loader',pathToFileURL(path.resolve('scripts/typescript-test-loader.mjs')).href,'--input-type=module','--eval',code],{env,encoding:'utf8'});assert.equal(r.status,0,r.stderr||r.stdout);};
 try{
 run(String.raw`
 import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {writeFileSync} from 'node:fs';
 import {getRepository} from './src/lib/repositories/index.ts';import * as subs from './src/lib/services/subscription.ts';import * as library from './src/lib/services/software-library.ts';
 import {parseNewSubscription,parseSubscriptionPurchase} from './src/lib/validation.ts';import {parseSoftwareLibraryInput} from './src/lib/software-library-validation.ts';import {librarySpend} from './src/lib/software-library.ts';
 import {subscriptionPreviewStats} from './src/lib/subscription-preview.ts';import {subscriptionTimeline} from './src/lib/subscription-timeline.ts';import {dateInEvaOrbit,shiftDate} from './src/lib/time.ts';import {createResourceRegistry} from './src/lib/mcp/resource-registry.ts';
 const repo=await getRepository(),today=dateInEvaOrbit(),prior=shiftDate(today.slice(0,7)+'-01',-1);
 const fixed=await repo.createSubscription(parseNewSubscription({name:'Original recurring',amount:'20',currency:'USD',billingIntervalValue:1,billingIntervalUnit:'month',startedOn:'2025-01-01',nextRenewalOn:'2026-01-01',autoRenew:true}));
 const payment=await repo.recordSubscriptionPayment(fixed.id,{scheduledFor:'2025-12-01',paidOn:prior,amountMinor:2000,currency:'USD',note:'Preserve original',updateCurrentPrice:false},'2026-01-01');
 const before=await repo.getSubscription(fixed.id),updated=await subs.updateSubscriptionPaymentDate(fixed.id,payment.id,today,prior);
 assert.deepEqual(updated,{...payment,paidOn:today});assert.deepEqual(await repo.getSubscription(fixed.id),{...before,latestPayment:updated});
 assert.equal((await repo.listSubscriptionPayments(fixed.id)).length,1);assert.equal((await repo.listSubscriptionPriceChanges(fixed.id)).length,0);
 assert.equal((await subs.updateSubscriptionPaymentDate(fixed.id,payment.id,today,prior)).id,payment.id);
 await assert.rejects(subs.updateSubscriptionPaymentDate(fixed.id,payment.id,prior,'2020-01-01'),/已被修改/);
 await assert.rejects(subs.updateSubscriptionPaymentDate(fixed.id,payment.id,shiftDate(today,1),today),/晚于今天/);
 await assert.rejects(subs.updateSubscriptionPaymentDate(99999,payment.id,today,prior),/不存在/);
 const payments=await repo.listSubscriptionPayments(fixed.id),stats=subscriptionPreviewStats([before],payments,today);
 assert.equal(stats.actual[today.slice(0,7)].USD,2000);assert.equal(stats.actual[prior.slice(0,7)].USD??0,0);assert.equal(subscriptionTimeline([before],payments,today).recorded[0].paidOn,today);
 await assert.rejects(repo.recordSubscriptionPayment(fixed.id,{scheduledFor:payment.scheduledFor,paidOn:prior,amountMinor:2000,currency:'USD',note:'',updateCurrentPrice:false},'2099-01-01'),/账期/);
 const registry=createResourceRegistry({subscription:{search:subs.listSubscriptions,get:subs.getSubscriptionDetail,create:subs.createSubscription,update:subs.updateSubscription,setStatus:subs.setSubscriptionStatus,recordPayment:subs.recordSubscriptionPayment,updatePaymentDate:subs.updateSubscriptionPaymentDate},softwareLibrary:{search:library.listSoftwareLibrary,get:library.getSoftwareLibraryEntry,create:library.createSoftwareLibraryEntry,update:library.updateSoftwareLibraryEntry}});
 await registry.action('subscription',{id:fixed.id,action:'update_payment_date',data:{payment_id:payment.id,paid_on:prior,expected_paid_on:today}});
 assert.equal((await repo.getSubscription(fixed.id)).nextRenewalOn,'2026-01-01');assert.equal((await repo.listSubscriptionPayments(fixed.id)).length,1);
 await assert.rejects(registry.action('subscription',{id:fixed.id,action:'update_payment_date',data:{payment_id:payment.id,paid_on:prior,expected_paid_on:prior,scheduled_for:today}}),/does not accept/);
 const manual=await subs.createSubscription(parseNewSubscription({name:'Manual',mode:'manual',expiresOn:'2030-01-01'}));const purchase=parseSubscriptionPurchase({purchaseKey:'manual-test-0001',paidOn:prior,amount:'99',currency:'CNY',validUntil:'2031-01-01'});
 const purchased=await subs.recordSubscriptionPurchase(manual.id,purchase);await subs.updateSubscriptionPaymentDate(manual.id,purchased.id,today,prior);assert.equal((await repo.getSubscription(manual.id)).paymentCount,1);assert.equal((await repo.getSubscription(manual.id)).expiresOn,'2031-01-01');
 await subs.updateSubscription(manual.id,{mode:'recurring',currentAmountMinor:9900,currency:'CNY',billingIntervalValue:1,billingIntervalUnit:'month',nextRenewalOn:'2099-01-01',autoRenew:false});await subs.updateSubscriptionPaymentDate(manual.id,purchased.id,prior,today);assert.equal((await repo.listSubscriptionPayments(manual.id))[0].paidOn,prior);assert.equal((await repo.getSubscription(manual.id)).nextRenewalOn,'2099-01-01','historical manual purchase remains correctable after mode conversion');
 const input={name:'Tool',platforms:['iOS'],acquisition:'giveaway',license:'perpetual'};
 const unknown=await library.createSoftwareLibraryEntry(input),free=await library.createSoftwareLibraryEntry({...input,name:'Free',purchaseAmount:'0',purchaseCurrency:'CNY'}),paid=await library.createSoftwareLibraryEntry({...input,name:'Paid',purchaseAmount:'19.99',purchaseCurrency:'USD',acquiredOn:prior});
 assert.equal(unknown.purchaseAmountMinor,null);assert.equal(free.purchaseAmountMinor,0);assert.equal(paid.purchaseAmountMinor,1999);
 assert.deepEqual(librarySpend(await library.listSoftwareLibrary()),{totals:{CNY:0,USD:1999},recorded:2,unknown:1});
 for(const change of [{purchaseAmount:-1,purchaseCurrency:'CNY'},{purchaseAmount:'1.234',purchaseCurrency:'CNY'},{purchaseAmount:1},{purchaseAmount:1,purchaseCurrency:'CN'},{purchaseAmount:Infinity,purchaseCurrency:'CNY'}])assert.throws(()=>parseSoftwareLibraryInput({...input,...change}));
 await library.updateSoftwareLibraryEntry(paid.id,{...input,name:'Renamed'});assert.equal((await library.getSoftwareLibraryEntry(paid.id)).purchaseAmountMinor,1999,'older edit clients preserve omitted cost');
 await registry.update('software_library',paid.id,{notes:'Cost remains'});assert.equal((await library.getSoftwareLibraryEntry(paid.id)).purchaseCurrency,'USD');
 await registry.update('software_library',paid.id,{purchase_amount:25,purchase_currency:'CNY'});assert.equal((await registry.get('software_library',paid.id)).purchase_amount_minor,2500);
 await registry.update('software_library',paid.id,{purchase_amount:null});assert.equal((await library.getSoftwareLibraryEntry(paid.id)).purchaseCurrency,null);
 assert.equal((await registry.search('software_library',{query:'Free',filters:{platform:'iOS'},limit:10})).items.length,1);
 assert.equal(registry.schema('software_library').fields.purchase_amount_minor.read_only,true);
 const {getSubscriptionsReadonlySnapshot}=await import('./src/lib/services/subscriptions-readonly.ts');const {validateSubscriptionsSnapshot}=await import('./src/lib/subscriptions-readonly.ts');const snapshot=await getSubscriptionsReadonlySnapshot('fixture');validateSubscriptionsSnapshot(snapshot,'fixture');const broken=structuredClone(snapshot);broken.library[0].purchaseAmountMinor=-1;assert.throws(()=>validateSubscriptionsSnapshot(broken,'fixture'));
 const sql=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
 assert.equal(sql.prepare('select count(*) n from subscription_payments').get().n,2,'library creates no subscription payment');
 const {BACKUP_TABLES,BACKUP_VERSION,BACKUP_SCHEMA_VERSION,emptyBackupResources,sanitizeExportRow}=await import('./src/lib/data-backup.ts');const resources=emptyBackupResources();for(const table of BACKUP_TABLES)resources[table]=sql.prepare('SELECT * FROM "'+table+'"').all().map(row=>sanitizeExportRow(table,row));
 writeFileSync(process.env.EVAORBIT_SQLITE_PATH+'.json',JSON.stringify({backup_version:BACKUP_VERSION,exported_at:new Date().toISOString(),schema:{supabase_migration:BACKUP_SCHEMA_VERSION},source:{backend:'supabase'},resources}));sql.close();
 `);
 const restore=spawnSync(process.execPath,['scripts/restore-backup.mjs',env.EVAORBIT_SQLITE_PATH+'.json'],{env,encoding:'utf8'});assert.equal(restore.status,0,restore.stderr||restore.stdout);
 run(String.raw`import assert from 'node:assert/strict';import {getRepository} from './src/lib/repositories/index.ts';const repo=await getRepository();const entries=await repo.listSoftwareLibrary();assert.equal(entries.find(e=>e.name==='Free').purchaseAmountMinor,0);assert.equal(entries.find(e=>e.name==='Tool').purchaseAmountMinor,null);assert.equal((await repo.listSubscriptionPayments(1)).length,1);`);
 }finally{rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});

test('software cost Postgres migration preserves old unknown costs and enforces amounts and account RLS',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();try{
 await db.exec("create role authenticated;create role anon;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function public.set_updated_at() returns trigger language plpgsql as $$begin NEW.updated_at=now();return NEW;end$$;grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('10000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002');");
 await db.exec(readFileSync('supabase/migrations/202610240001_software_library.sql','utf8'));await db.exec("set role authenticated;set request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';insert into software_library(name,platforms,license,acquisition)values('Legacy','[\"iOS\"]','perpetual','giveaway');reset role;");
 await db.exec(readFileSync('supabase/migrations/202611040002_software_library_cost.sql','utf8'));assert.equal((await db.query('select purchase_amount_minor from software_library')).rows[0].purchase_amount_minor,null);
 await db.exec("set role authenticated;set request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';update software_library set purchase_amount_minor=0,purchase_currency='CNY' where id=1");
 await assert.rejects(db.exec("update software_library set purchase_amount_minor=-1 where id=1"));await assert.rejects(db.exec("update software_library set purchase_currency=null where id=1"));
 await db.exec("set request.jwt.claim.sub='20000000-0000-4000-8000-000000000002'");assert.equal((await db.query('select * from software_library')).rows.length,0);assert.equal((await db.query("update software_library set purchase_amount_minor=999 where id=1 returning *")).rows.length,0);
 }finally{await db.close();}
});
