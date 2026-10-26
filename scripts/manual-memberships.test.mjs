import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

test('manual purchases preserve actual ledger, idempotency, expiry reminders and recurring compatibility across SQLite reopen',()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'eo-manual-membership-'));
 const env={...process.env,EVAORBIT_DATA_BACKEND:'sqlite',EVAORBIT_SQLITE_PATH:path.join(directory,'test.db'),MEMBERSHIP_BACKUP_PATH:path.join(directory,'backup.json'),VERCEL:''};
 const run=code=>{const result=spawnSync(process.execPath,['--experimental-loader',pathToFileURL(path.resolve('scripts/typescript-test-loader.mjs')).href,'--input-type=module','--eval',code],{encoding:'utf8',env});assert.equal(result.status,0,result.stderr||result.stdout);};
 try{
 run(String.raw`
  import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
  import {getRepository} from './src/lib/repositories/index.ts';
  import * as service from './src/lib/services/subscription.ts';
  import {parseNewSubscription,parseSubscriptionPurchase,parseSubscriptionPatch,parseSubscriptionPayment} from './src/lib/validation.ts';
  import {membershipState,automaticSubscriptionRenewalsThrough} from './src/lib/subscriptions.ts';
  import {subscriptionPreviewStats} from './src/lib/subscription-preview.ts';
  import {getSubscriptionsReadonlySnapshot} from './src/lib/services/subscriptions-readonly.ts';
  import {validateSubscriptionsSnapshot} from './src/lib/subscriptions-readonly.ts';
  import {dateInEvaOrbit,shiftDate,zonedDateTimeToUtc} from './src/lib/time.ts';
  const repo=await getRepository(),today=dateInEvaOrbit(),past=shiftDate(today,-2),future=shiftDate(today,7);
  assert.throws(()=>parseNewSubscription({name:'Missing expiry',mode:'manual'}));
  const validPurchase={purchaseKey:'validation-0001',paidOn:today,validUntil:future,amount:'0',currency:'CNY'};
  assert.equal(parseSubscriptionPurchase(validPurchase).amountMinor,0,'free promotional purchase is valid');
  for(const invalid of [{...validPurchase,purchaseKey:'x'},{...validPurchase,paidOn:'2026-02-30'},{...validPurchase,validUntil:past},{...validPurchase,currency:'CN'},{...validPurchase,purchasedValue:12},{...validPurchase,bonusValue:-1,bonusUnit:'month'}])assert.throws(()=>parseSubscriptionPurchase(invalid));
  const manual=await service.createSubscription(parseNewSubscription({name:'Cloud membership',mode:'manual',expiresOn:past,reminderEnabled:true,reminderDaysBefore:5,reminderTime:'09:30'}));
  assert.equal(manual.mode,'manual');assert.equal(manual.autoRenew,false);assert.equal(manual.paymentCount,0);assert.equal(membershipState(manual,today),'expired');
  await service.listSubscriptions();await service.getSubscriptionDetail(manual.id);await service.catchUpAutomaticSubscriptionPayments(new Date('2099-01-01'));
  assert.equal((await repo.listSubscriptionPayments(manual.id)).length,0);assert.deepEqual(automaticSubscriptionRenewalsThrough({...manual,autoRenew:true},'2099-01-01'),[]);
  const input=parseSubscriptionPurchase({purchaseKey:'purchase-2026-001',paidOn:today,amount:'198.88',currency:'CNY',purchasedValue:12,purchasedUnit:'month',bonusValue:3,bonusUnit:'month',validUntil:'2030-01-31',note:'Double eleven'});
  const payment=await service.recordSubscriptionPurchase(manual.id,input);
  assert.equal(payment.amountMinor,19888);assert.equal(payment.purchasedValue,12);assert.equal(payment.bonusValue,3);
  assert.equal((await service.recordSubscriptionPurchase(manual.id,input)).id,payment.id);
  await assert.rejects(service.recordSubscriptionPurchase(manual.id,{...input,amountMinor:1}),/标识/);
  let item=await repo.getSubscription(manual.id);assert.equal(item.paymentCount,1);assert.equal(item.expiresOn,'2030-01-31');assert.equal(item.latestPayment.id,payment.id);assert.equal(item.spendByCurrency.CNY,19888);
  let reminder=await repo.getReminder(item.reminderId);assert.equal(reminder.nextDueAt,zonedDateTimeToUtc('2030-01-31','09:30'));assert.equal(reminder.leadTimeMinutes,5*1440);assert.match(reminder.title,/到期/);
  await repo.updateReminder(item.reminderId,{status:'sent'});await service.recordSubscriptionPurchase(manual.id,input);assert.equal((await repo.getReminder(item.reminderId)).status,'sent','retry cannot rearm a sent reminder');
  await service.recordSubscriptionPaymentFromReminder(manual.id);assert.equal((await repo.listSubscriptionPayments(manual.id)).length,1);assert.equal((await repo.getReminder(item.reminderId)).status,'completed');
  await service.recordSubscriptionPurchase(manual.id,input);assert.equal((await repo.getReminder(item.reminderId)).status,'completed','retry cannot rearm completed reminder');
  await service.recordSubscriptionPurchase(manual.id,{...input,purchaseKey:'purchase-2026-002',amountMinor:100,validUntil:'2031-04-30'});
  await service.recordSubscriptionPurchase(manual.id,{...input,purchaseKey:'purchase-older-003',paidOn:past,amountMinor:200,currency:'USD',validUntil:'2029-01-01'});
  item=await repo.getSubscription(manual.id);assert.equal(item.paymentCount,3,'separate same-day purchases allowed');assert.equal(item.expiresOn,'2031-04-30');assert.equal(item.latestPayment.amountMinor,100,'latest purchase is chronological, not insertion order');assert.equal(item.spendByCurrency.USD,200);
  assert.equal((await repo.getReminder(item.reminderId)).nextDueAt,zonedDateTimeToUtc('2031-04-30','09:30'));
  await service.updateSubscription(manual.id,parseSubscriptionPatch({expiresOn:past}));assert.equal(membershipState(await repo.getSubscription(manual.id),today),'expired');assert.equal((await repo.listSubscriptionPayments(manual.id)).length,3);
  await service.recordSubscriptionPurchase(manual.id,input);assert.equal((await repo.getSubscription(manual.id)).expiresOn,past,'retry never undoes an expiry correction');
  await service.skipSubscriptionRenewal(manual.id);assert.equal((await repo.getSubscription(manual.id)).expiresOn,past);assert.equal((await repo.listSubscriptionPayments(manual.id)).length,3);
  await service.setSubscriptionStatus(manual.id,'ended');await service.recordSubscriptionPurchase(manual.id,{...input,purchaseKey:'purchase-restore-004',validUntil:'2032-04-30'});item=await repo.getSubscription(manual.id);assert.equal(item.status,'active');assert.equal(membershipState(item,today),'active');
  const stats=subscriptionPreviewStats([item],await repo.listSubscriptionPayments(item.id),today);assert.deepEqual(stats.remaining,{});assert.equal(stats.actual[today.slice(0,7)].CNY,39876);
  await assert.rejects(service.recordSubscriptionPayment(item.id,parseSubscriptionPayment({scheduledFor:today,paidOn:today,amount:'10',currency:'CNY'})),/记录购买/);
  const fixed=await service.createSubscription(parseNewSubscription({name:'ChatGPT',amount:'20',currency:'USD',billingIntervalValue:1,billingIntervalUnit:'month',startedOn:past,nextRenewalOn:past,autoRenew:true}));
  assert.equal((await repo.listSubscriptionPayments(fixed.id)).length,1);assert.equal((await repo.getSubscription(fixed.id)).mode,'recurring');
  await assert.rejects(service.recordSubscriptionPurchase(fixed.id,input),/不是手动/);
  const paymentHistory=await repo.listSubscriptionPayments(item.id);
  await service.updateSubscription(item.id,parseSubscriptionPatch({mode:'recurring',amount:'10',currency:'CNY',billingIntervalValue:1,billingIntervalUnit:'month',nextRenewalOn:future,autoRenew:false}));
  assert.deepEqual(await repo.listSubscriptionPayments(item.id),paymentHistory);
  await service.updateSubscription(item.id,parseSubscriptionPatch({mode:'manual',expiresOn:'2033-01-01',autoRenew:true}));assert.equal((await repo.getSubscription(item.id)).autoRenew,false);
  const {createResourceRegistry}=await import('./src/lib/mcp/resource-registry.ts');
  const registry=createResourceRegistry({subscription:{search:service.listSubscriptions,get:service.getSubscriptionDetail,create:service.createSubscription,update:service.updateSubscription,setStatus:service.setSubscriptionStatus,recordPayment:service.recordSubscriptionPayment,recordPurchase:service.recordSubscriptionPurchase}});
  assert.equal((await registry.get('subscription',item.id)).mode,'manual');assert.equal((await registry.get('subscription',item.id)).membership_state,'active');
  const mcpInput={purchase_key:'mcp-purchase-005',paid_on:today,amount:10,currency:'CNY',valid_until:'2032-01-01',bonus_value:1,bonus_unit:'month'};
  const mcpPayment=await registry.action('subscription',{id:item.id,action:'record_purchase',data:mcpInput});
  assert.equal((await repo.getSubscription(item.id)).expiresOn,'2032-01-01','latest official date overrides earlier expiry');
  assert.equal((await registry.action('subscription',{id:item.id,action:'record_purchase',data:mcpInput})).id,mcpPayment.id);
  await service.updateSubscription(item.id,parseSubscriptionPatch({expiresOn:'2033-01-01'}));
  const snapshot=await getSubscriptionsReadonlySnapshot('synthetic');validateSubscriptionsSnapshot(snapshot,'synthetic');const malformed=structuredClone(snapshot);malformed.items.find(i=>i.id===item.id).autoRenew=true;assert.throws(()=>validateSubscriptionsSnapshot(malformed,'synthetic'));
  const {BACKUP_TABLES,BACKUP_VERSION,BACKUP_SCHEMA_VERSION,emptyBackupResources,sanitizeExportRow}=await import('./src/lib/data-backup.ts');const {writeFileSync}=await import('node:fs');
  const sql=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
  const resources=emptyBackupResources();for(const table of BACKUP_TABLES)resources[table]=sql.prepare('SELECT * FROM "'+table+'"').all().map(row=>sanitizeExportRow(table,row));
  writeFileSync(process.env.MEMBERSHIP_BACKUP_PATH,JSON.stringify({backup_version:BACKUP_VERSION,exported_at:new Date().toISOString(),schema:{supabase_migration:BACKUP_SCHEMA_VERSION},source:{backend:'supabase'},resources}));sql.close();
 `);
 const restore=spawnSync(process.execPath,['scripts/restore-backup.mjs',env.MEMBERSHIP_BACKUP_PATH],{encoding:'utf8',env});assert.equal(restore.status,0,restore.stderr||restore.stdout);
 run(String.raw`import assert from 'node:assert/strict';import {getRepository} from './src/lib/repositories/index.ts';const r=await getRepository();const item=(await r.listSubscriptions({query:'Cloud'}))[0];assert.equal(item.mode,'manual');assert.equal(item.expiresOn,'2033-01-01');assert.equal((await r.listSubscriptionPayments(item.id)).filter(p=>p.purchaseKey).length,5);assert.equal((await r.getReminder(item.reminderId)).leadTimeMinutes,5*1440);`);
 }finally{rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});

test('purchase editing updates one payment, chronological expiry and reminders without overwriting independent corrections',()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'eo-purchase-edit-'));
 try{
 const result=spawnSync(process.execPath,['--experimental-loader',pathToFileURL(path.resolve('scripts/typescript-test-loader.mjs')).href,'--input-type=module','--eval',`
  import assert from 'node:assert/strict';
  import {getRepository} from './src/lib/repositories/index.ts';
  import * as service from './src/lib/services/subscription.ts';
  import {parseNewSubscription,parseSubscriptionPurchase} from './src/lib/validation.ts';
  import {dateInEvaOrbit,shiftDate,zonedDateTimeToUtc} from './src/lib/time.ts';
  const repo=await getRepository(),today=dateInEvaOrbit(),past=shiftDate(today,-10);
  const item=await service.createSubscription(parseNewSubscription({name:'Editable membership',mode:'manual',expiresOn:'2030-01-01',reminderEnabled:true,reminderTime:'09:30',reminderDaysBefore:2}));
  const first=parseSubscriptionPurchase({purchaseKey:'edit-first-0001',paidOn:past,amount:'99',currency:'CNY',validUntil:'2031-01-01'});
  const second={...first,purchaseKey:'edit-second-002',paidOn:today,validUntil:'2032-01-01'};
  const a=await service.recordSubscriptionPurchase(item.id,first),b=await service.recordSubscriptionPurchase(item.id,second);
  const changed={...second,amountMinor:12345,currency:'USD',validUntil:'2033-01-01',bonusValue:3,bonusUnit:'month',note:'Corrected promotion'};
  const edited=await service.updateSubscriptionPurchase(item.id,b.id,changed,second);
  assert.equal(edited.id,b.id);assert.equal(edited.createdAt,b.createdAt);assert.equal(edited.purchaseKey,b.purchaseKey);
  let current=await repo.getSubscription(item.id);assert.equal(current.paymentCount,2);assert.deepEqual(current.spendByCurrency,{CNY:9900,USD:12345});assert.equal(current.expiresOn,'2033-01-01');
  assert.equal((await repo.getReminder(current.reminderId)).nextDueAt,zonedDateTimeToUtc('2033-01-01','09:30'));
  assert.equal((await service.updateSubscriptionPurchase(item.id,b.id,changed,second)).id,b.id,'acknowledged edits are retry safe');
  await assert.rejects(service.updateSubscriptionPurchase(item.id,b.id,{...changed,amountMinor:1},second),/已被修改/);
  await assert.rejects(service.updateSubscriptionPurchase(item.id,b.id,{...changed,purchaseKey:'change-key-000'},changed),/标识/);
  await assert.rejects(service.updateSubscriptionPurchase(item.id,b.id,{...changed,paidOn:shiftDate(today,1)},changed),/晚于今天/);
  const older={...first,amountMinor:100,validUntil:'2030-02-01'};
  await service.updateSubscriptionPurchase(item.id,a.id,older,first);assert.equal((await repo.getSubscription(item.id)).expiresOn,'2033-01-01','older history cannot replace newest expiry');
  const moved={...changed,paidOn:shiftDate(past,-1)};
  await service.updateSubscriptionPurchase(item.id,b.id,moved,changed);assert.equal((await repo.getSubscription(item.id)).expiresOn,'2030-02-01','editing date recomputes latest chronological purchase');
  await service.updateSubscription(item.id,{expiresOn:'2035-01-01'});
  await service.updateSubscriptionPurchase(item.id,a.id,{...older,validUntil:'2034-01-01'},older);assert.equal((await repo.getSubscription(item.id)).expiresOn,'2035-01-01','explicit expiry override survives history edits');
  await service.setSubscriptionStatus(item.id,'ended');await service.updateSubscriptionPurchase(item.id,b.id,{...moved,note:'Note only'},moved);assert.equal((await repo.getSubscription(item.id)).status,'ended','edit is not a renewal');
  const other=await service.createSubscription(parseNewSubscription({name:'Other',mode:'manual',expiresOn:'2030-01-01'}));
  await assert.rejects(service.updateSubscriptionPurchase(other.id,a.id,older,first),/不存在/);
  assert.equal((await repo.listSubscriptionPayments(item.id)).length,2);
 `],{encoding:'utf8',env:{...process.env,EVAORBIT_DATA_BACKEND:'sqlite',EVAORBIT_SQLITE_PATH:path.join(directory,'test.db'),VERCEL:''}});
 assert.equal(result.status,0,result.stderr||result.stdout);
 }finally{rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});

test('SQLite migration upgrades a populated legacy payment table without losing ids or billing uniqueness',()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'eo-membership-upgrade-'));
 const env={...process.env,EVAORBIT_DATA_BACKEND:'sqlite',EVAORBIT_SQLITE_PATH:path.join(directory,'legacy.db'),VERCEL:''};
 const run=code=>{const result=spawnSync(process.execPath,['--experimental-loader',pathToFileURL(path.resolve('scripts/typescript-test-loader.mjs')).href,'--input-type=module','--eval',code],{encoding:'utf8',env});assert.equal(result.status,0,result.stderr||result.stdout);};
 try{
 run(String.raw`
  import './src/lib/db.ts';import {DatabaseSync} from 'node:sqlite';const sql=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
  sql.exec("DROP TRIGGER subscription_manual_insert;DROP TRIGGER subscription_manual_update;DROP TRIGGER IF EXISTS subscription_payment_mode;DROP TABLE subscription_payments;ALTER TABLE subscriptions DROP COLUMN mode;ALTER TABLE subscriptions DROP COLUMN expires_on;DELETE FROM migrations WHERE version=87;");
  sql.exec("CREATE TABLE subscription_payments(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL DEFAULT 'local',subscription_id INTEGER NOT NULL,scheduled_for TEXT NOT NULL,paid_on TEXT NOT NULL,amount_minor INTEGER NOT NULL,currency TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(subscription_id,user_id) REFERENCES subscriptions(id,user_id) ON DELETE CASCADE,UNIQUE(user_id,subscription_id,scheduled_for));");
  sql.exec("INSERT INTO subscriptions(id,name,current_amount_minor,currency,billing_interval_value,billing_interval_unit,started_on,next_renewal_on,auto_renew) VALUES(7,'Original',1200,'CNY',1,'month','2026-01-01','2099-01-01',0);INSERT INTO subscription_payments(id,subscription_id,scheduled_for,paid_on,amount_minor,currency,note)VALUES(41,7,'2026-01-01','2026-01-01',1100,'CNY','Keep exact history');");sql.close();
 `);
 run(String.raw`import assert from 'node:assert/strict';import {getRepository} from './src/lib/repositories/index.ts';const r=await getRepository();assert.equal((await r.getSubscription(7)).mode,'recurring');const p=(await r.listSubscriptionPayments(7))[0];assert.equal(p.id,41);assert.equal(p.note,'Keep exact history');assert.equal(p.purchaseKey,null);const input={scheduledFor:'2026-02-01',paidOn:'2026-02-01',amountMinor:1200,currency:'CNY',note:'',updateCurrentPrice:false};assert.equal((await r.recordSubscriptionPayment(7,input,'2099-02-01')).id,42);await assert.rejects(r.recordSubscriptionPayment(7,input,'2099-03-01'),/账期/);`);
 }finally{rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});

test('membership Postgres migration preserves recurring payments, atomic purchase deduplication and account RLS',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create function public.set_updated_at() returns trigger language plpgsql as $$begin NEW.updated_at=now();return NEW;end$$;
  grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;
  insert into auth.users values('10000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002');
  create table reminders(id bigint primary key,user_id uuid,source_type text,source_id bigint,target_type text);
  create table notification_deliveries(id bigint,target_type text);`);
 await db.exec(readFileSync('supabase/migrations/202609140003_subscriptions.sql','utf8'));
 await db.exec(`set role authenticated;set request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';insert into subscriptions(name,current_amount_minor,currency,billing_interval_value,billing_interval_unit,started_on,next_renewal_on)values('Existing',2000,'USD',1,'month','2026-01-01','2026-02-01');select record_subscription_payment(1,'2026-01-01','2026-01-01',2000,'USD','Old payment','2026-02-01',false);reset role;`);
 await db.exec(readFileSync('supabase/migrations/202610260001_manual_subscription_memberships.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/202610260002_edit_subscription_purchases.sql','utf8'));

 assert.equal((await db.query('select mode from subscriptions where id=1')).rows[0].mode,'recurring');assert.equal((await db.query('select count(*) n from subscription_payments')).rows[0].n,1);
 await db.exec(`set role authenticated;set request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';insert into subscriptions(name,mode,expires_on,current_amount_minor,currency,billing_interval_value,billing_interval_unit,started_on,next_renewal_on,auto_renew)values('Cloud','manual','2026-11-01',0,'CNY',1,'month','2026-01-01','2026-11-01',false);`);
 const call=`select * from record_subscription_purchase(2,'purchase-0001','2026-10-20',19900,'CNY','Promo','2028-02-01',12,'month',3,'month')`;
 const first=(await db.query(call)).rows[0];assert.equal((await db.query(call)).rows[0].id,first.id);
 await assert.rejects(db.query(call.replace('19900','29900')),/Purchase key/);
 await db.query(call.replace('purchase-0001','purchase-0002').replace('2028-02-01','2029-01-01'));
 assert.equal((await db.query('select count(*) n from subscription_payments where subscription_id=2')).rows[0].n,2);
 assert.equal((await db.query('select expires_on::text from subscriptions where id=2')).rows[0].expires_on,'2029-01-01');
 await assert.rejects(db.exec(`select record_subscription_payment(2,'2026-12-01','2026-12-01',100,'CNY','','2027-01-01',false)`),/record_purchase/);
 await assert.rejects(db.exec(`update subscriptions set auto_renew=true where id=2`));
 const original={purchaseKey:'purchase-0002',paidOn:'2026-10-20',amountMinor:19900,currency:'CNY',note:'Promo',validUntil:'2029-01-01',purchasedValue:12,purchasedUnit:'month',bonusValue:3,bonusUnit:'month'};
 const edit={...original,amountMinor:12345,currency:'USD',validUntil:'2030-01-01'};
 const secondId=(await db.query("select id from subscription_payments where purchase_key='purchase-0002'")).rows[0].id;
 const editCall=(input,expected)=>db.query('select * from update_subscription_purchase($1,$2,$3::jsonb,$4::jsonb)',[2,secondId,JSON.stringify(input),JSON.stringify(expected)]);
 assert.equal((await editCall(edit,original)).rows[0].id,secondId);await editCall(edit,original);
 assert.equal((await db.query('select expires_on::text from subscriptions where id=2')).rows[0].expires_on,'2030-01-01');
 assert.equal((await db.query('select count(*) n from subscription_payments where subscription_id=2')).rows[0].n,2);
 await assert.rejects(editCall({...edit,amountMinor:1},original),/Purchase changed/);
 await db.exec("update subscriptions set expires_on='2035-01-01',next_renewal_on='2035-01-01' where id=2");
 const revised={...edit,validUntil:'2031-01-01'};await editCall(revised,edit);
 assert.equal((await db.query('select expires_on::text from subscriptions where id=2')).rows[0].expires_on,'2035-01-01');
 await db.exec(`set request.jwt.claim.sub='20000000-0000-4000-8000-000000000002'`);assert.equal((await db.query('select * from subscriptions')).rows.length,0);assert.equal((await db.query('select * from subscription_payments')).rows.length,0);
 await assert.rejects(editCall(edit,original),/not found/);await assert.rejects(db.query(call),/not found/);await assert.rejects(db.exec(`insert into subscription_payments(user_id,subscription_id,scheduled_for,paid_on,amount_minor,currency)values('10000000-0000-4000-8000-000000000001',2,'2026-10-20','2026-10-20',1,'CNY')`));
 }finally{await db.close();}
});
