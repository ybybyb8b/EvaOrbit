import assert from "node:assert/strict";
import test from "node:test";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import {readSubscriptionsSnapshot,validateSubscriptionsSnapshot} from "../src/lib/subscriptions-readonly.ts";
const empty=()=>({format:"eo-subscriptions-readonly-v1",accountId:"a",capturedAt:"2026-10-20T00:00:00Z",today:"2026-10-20",items:[],iconSources:{}});
test("Subscription snapshots reject account, date, size and unlisted read/write paths",async()=>{
  const value=empty();assert.equal(validateSubscriptionsSnapshot(value,"a"),value);
  assert.throws(()=>validateSubscriptionsSnapshot(value,"b"));
  assert.throws(()=>validateSubscriptionsSnapshot({...value,today:"2026-02-30"},"a"));
  assert.throws(()=>validateSubscriptionsSnapshot({...value,iconSources:{1:"https://evil.invalid/image.png"}},"a"));
  assert.throws(()=>validateSubscriptionsSnapshot({...value,extra:"x".repeat(8*1024*1024)},"a"),/limit/);
  for(const method of ["POST","PUT","PATCH","DELETE"])assert.throws(()=>readSubscriptionsSnapshot(value,"/api/subscriptions",{method}));
  for(const url of ["https://evil.invalid/api/subscriptions","/api/subscriptions/../session","/api/subscriptions/1/icon","/api/subscriptions/1/status","/api/subscriptions?limit=500"])assert.throws(()=>readSubscriptionsSnapshot(value,url));
  assert.equal(readSubscriptionsSnapshot(value,"/api/subscriptions/1").status,404);
  assert.deepEqual(await readSubscriptionsSnapshot(value,"/api/subscriptions").json(),[]);
});
test("Actual subscription snapshot cannot catch up overdue renewals, change reminders, prices or payments",()=>{
  const directory=mkdtempSync(path.join(tmpdir(),"eo-subscriptions-readonly-"));
  try{
    const result=spawnSync(process.execPath,["--experimental-loader",pathToFileURL(path.resolve("scripts/typescript-test-loader.mjs")).href,"--input-type=module","--eval",String.raw`
      import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
      import {seedSubscriptions} from './scripts/subscriptions-readonly-fixture.mjs';
      import {getSubscriptionsReadonlySnapshot} from './src/lib/services/subscriptions-readonly.ts';
      import {listSubscriptions} from './src/lib/services/subscription.ts';
      import {withSubscriptionsReadOnlyRepository,getRepository} from './src/lib/repositories/index.ts';
      import {validateSubscriptionsSnapshot,readSubscriptionsSnapshot} from './src/lib/subscriptions-readonly.ts';
      const {automatic}=await seedSubscriptions();const repository=await getRepository();
      const original=await repository.getSubscription(automatic.id),payments=await repository.listSubscriptionPayments(automatic.id);
      const db=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
      for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all())for(const op of ['INSERT','UPDATE','DELETE'])db.exec('CREATE TRIGGER "subs_no_'+op+'_'+name+'" BEFORE '+op+' ON "'+name+'" BEGIN SELECT RAISE(ABORT,\'Subscription readonly wrote business data\'); END;');
      const snapshot=await getSubscriptionsReadonlySnapshot('a');validateSubscriptionsSnapshot(snapshot,'a');
      const item=snapshot.items.find(i=>i.id===automatic.id);assert.equal(snapshot.items.length,4);
      assert.equal(item.nextRenewalOn,'2025-01-01');assert.equal(item.paymentCount,1);assert.equal(item.currentAmountMinor,4900);
      assert.deepEqual(item.spendByCurrency,{USD:2000});assert.equal(item.totalSpentMinor,0);assert(item.priceChanges.length>0);
      assert.match(snapshot.iconSources[item.id],/^data:image\/png;base64,/);
      assert.deepEqual(await readSubscriptionsSnapshot(snapshot,'/api/subscriptions/'+item.id).json(),item);
      assert.deepEqual(await repository.getSubscription(automatic.id),original);assert.deepEqual(await repository.listSubscriptionPayments(automatic.id),payments);
      await assert.rejects(withSubscriptionsReadOnlyRepository(()=>listSubscriptions()),/refused/);
      await assert.rejects(withSubscriptionsReadOnlyRepository(async()=>(await getRepository()).setSubscriptionStatus(item.id,'paused')),/refused/);
      for(const mutate of [s=>s.items[0].payments.push({...s.items[0].payments[0]}),s=>s.items[0].paymentCount++,s=>{s.items[0].spendByCurrency={CNY:999};},s=>{s.items[0].payments[0].subscriptionId=999;},s=>{s.iconSources={};}]){const broken=structuredClone(snapshot);mutate(broken);assert.throws(()=>validateSubscriptionsSnapshot(broken,'a'));}
      db.close();
    `],{encoding:"utf8",env:{...process.env,EVAORBIT_DATA_BACKEND:"sqlite",EVAORBIT_SQLITE_PATH:path.join(directory,"test.db"),EVAORBIT_SUBSCRIPTION_ICON_DIR:path.join(directory,"icons"),VERCEL:""}});
    assert.equal(result.status,0,result.stderr||result.stdout);
  }finally{rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});
