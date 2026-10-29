import assert from "node:assert/strict";
import test from "node:test";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import {readSubscriptionsSnapshot,validateSubscriptionsSnapshot} from "../src/lib/subscriptions-readonly.ts";
const empty=()=>({format:"eo-subscriptions-readonly-v1",accountId:"a",capturedAt:"2026-10-20T00:00:00Z",today:"2026-10-20",items:[],iconSources:{}});
test("Native JSON key order cannot invalidate the latest payment; real mismatches still reject the snapshot",()=>{
  const payment={id:2,subscriptionId:1,purchaseKey:null,validUntil:null,purchasedValue:null,purchasedUnit:null,bonusValue:null,bonusUnit:null,scheduledFor:"2026-10-01",paidOn:"2026-10-02",amountMinor:1000,currency:"CNY",note:"Private note",createdAt:"2026-10-02T00:00:00Z"};
  const older={...payment,id:1,paidOn:"2026-10-01"};
  const item={id:1,name:"Private name",mode:"recurring",currentAmountMinor:1000,currency:"CNY",billingIntervalValue:1,billingIntervalUnit:"month",startedOn:"2026-10-01",nextRenewalOn:"2026-11-01",status:"active",autoRenew:true,reminderEnabled:false,iconPath:"",payments:[older,payment],priceChanges:[],latestPayment:Object.fromEntries(Object.entries(payment).reverse()),paymentCount:2,totalSpentMinor:2000,spendByCurrency:{CNY:2000}};
  const value={...empty(),items:[item]},before=JSON.stringify(value);
  assert.equal(validateSubscriptionsSnapshot(value,"a"),value);
  assert.equal(JSON.stringify(value),before,"validation must not rewrite cached data");
  for(const change of [p=>({...p,id:1}),p=>({...p,amountMinor:1001}),p=>({...p,currency:"USD"}),p=>({...p,paidOn:"2026-10-01"}),p=>({...p,note:"Changed"}),p=>({...p,purchaseKey:"different-key"}),p=>{delete p.bonusUnit;return p;},p=>({...p,extra:true}),()=>null,()=>[]]){
    const broken=structuredClone(value);broken.items[0].latestPayment=change({...payment});
    assert.throws(()=>validateSubscriptionsSnapshot(broken,"a"),/subscription #1: latest payment does not match payment history.*previous cache preserved/);
  }
  const legacy=structuredClone(value);delete legacy.items[0].latestPayment;validateSubscriptionsSnapshot(legacy,"a");
  const noPayments=structuredClone(value);Object.assign(noPayments.items[0],{payments:[],latestPayment:null,paymentCount:0,totalSpentMinor:0,spendByCurrency:{}});validateSubscriptionsSnapshot(noPayments,"a");
  noPayments.items[0].latestPayment=payment;assert.throws(()=>validateSubscriptionsSnapshot(noPayments,"a"),/latest payment/);
  const wrongCount=structuredClone(value);wrongCount.items[0].paymentCount=3;assert.throws(()=>validateSubscriptionsSnapshot(wrongCount,"a"),/payment count/);
  const wrongTotal=structuredClone(value);wrongTotal.items[0].totalSpentMinor=1;assert.throws(()=>validateSubscriptionsSnapshot(wrongTotal,"a"),/spending totals/);
  const wrongOwner=structuredClone(value);wrongOwner.items[0].payments[0].subscriptionId=9;assert.throws(()=>validateSubscriptionsSnapshot(wrongOwner,"a"),/payment #1: subscription reference mismatch/);
  const missing=structuredClone(value);missing.items[0]=null;assert.throws(()=>validateSubscriptionsSnapshot(missing,"a"),/invalid or duplicate subscription ID/);
  assert.throws(()=>validateSubscriptionsSnapshot(value,"b"),/account mismatch/);
});

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
  assert.equal(readSubscriptionsSnapshot(value,"/api/subscriptions/library").status,503);
  const software={id:1,name:"Test",platforms:["iOS"],license:"perpetual",acquisition:"giveaway",iconPath:"",createdAt:value.capturedAt,updatedAt:value.capturedAt};
  const extended={...value,library:[software],libraryIconSources:{}};
  validateSubscriptionsSnapshot(extended,"a");
  assert.deepEqual(await readSubscriptionsSnapshot(extended,"/api/subscriptions/library").json(),[software]);
  for(const broken of [{...extended,library:[software,software]},{...extended,library:Array.from({length:501},(_,i)=>({...software,id:i+1}))},{...extended,libraryIconSources:{1:"https://invalid/icon.png"}},{...extended,library:[{...software,iconPath:"../secret"}]}])assert.throws(()=>validateSubscriptionsSnapshot(broken,"a"));
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
      assert.equal(snapshot.library.length,1);assert.equal(snapshot.library[0].name,'Offline software');
      assert.match(snapshot.libraryIconSources[snapshot.library[0].id],/^data:image\/png;base64,/);
      assert.deepEqual(await readSubscriptionsSnapshot(snapshot,'/api/subscriptions/library').json(),snapshot.library);
      await assert.rejects(withSubscriptionsReadOnlyRepository(async()=>(await getRepository()).deleteSoftwareLibraryEntry(snapshot.library[0].id)),/refused/);
      assert.deepEqual(await readSubscriptionsSnapshot(snapshot,'/api/subscriptions/'+item.id).json(),item);
      assert.deepEqual(await repository.getSubscription(automatic.id),original);assert.deepEqual(await repository.listSubscriptionPayments(automatic.id),payments);
      await assert.rejects(withSubscriptionsReadOnlyRepository(()=>listSubscriptions()),/refused/);
      await assert.rejects(withSubscriptionsReadOnlyRepository(async()=>(await getRepository()).setSubscriptionStatus(item.id,'paused')),/refused/);
      for(const mutate of [s=>s.items[0].payments.push({...s.items[0].payments[0]}),s=>s.items[0].paymentCount++,s=>{s.items[0].spendByCurrency={CNY:999};},s=>{s.items[0].payments[0].subscriptionId=999;},s=>{s.iconSources={};}]){const broken=structuredClone(snapshot);mutate(broken);assert.throws(()=>validateSubscriptionsSnapshot(broken,'a'));}
      db.close();
    `],{encoding:"utf8",env:{...process.env,EVAORBIT_DATA_BACKEND:"sqlite",EVAORBIT_SQLITE_PATH:path.join(directory,"test.db"),EVAORBIT_SUBSCRIPTION_ICON_DIR:path.join(directory,"icons"),EVAORBIT_SOFTWARE_ICON_DIR:path.join(directory,"software-icons"),VERCEL:""}});
    assert.equal(result.status,0,result.stderr||result.stdout);
  }finally{rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});
