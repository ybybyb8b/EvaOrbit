import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

test("renewal date corrections never book the overdue plan and move its existing reminder", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "eo-subscription-reschedule-"));
  try {
    const result = spawnSync(process.execPath, ["--experimental-loader", pathToFileURL(path.resolve("scripts/typescript-test-loader.mjs")).href, "--input-type=module", "--eval", String.raw`
      import assert from 'node:assert/strict';
      import {getRepository} from './src/lib/repositories/index.ts';
      import {updateSubscription,catchUpAutomaticSubscriptionPayments} from './src/lib/services/subscription.ts';
      import {parseNewSubscription,parseSubscriptionPatch} from './src/lib/validation.ts';
      import {dateInEvaOrbit,shiftDate,zonedDateTimeToUtc} from './src/lib/time.ts';
      const repo=await getRepository(),today=dateInEvaOrbit(),past=shiftDate(today,-9),future=shiftDate(today,10);
      const create=async(autoRenew)=>repo.createSubscription(parseNewSubscription({name:'Netflix',amount:'60',currency:'CNY',billingIntervalValue:3,billingIntervalUnit:'month',startedOn:'2024-07-15',nextRenewalOn:past,autoRenew,reminderEnabled:true,reminderTime:'09:00'}));
      const item=await create(true);
      await repo.recordSubscriptionPayment(item.id,{scheduledFor:'2024-07-15',paidOn:'2024-07-15',amountMinor:4500,currency:'CNY',note:'Original payment',updateCurrentPrice:false},past);
      const history=await repo.listSubscriptionPayments(item.id);
      const updated=await updateSubscription(item.id,parseSubscriptionPatch({nextRenewalOn:future}));
      assert.equal(updated.nextRenewalOn,future);assert.equal(updated.autoRenew,true);
      assert.deepEqual(await repo.listSubscriptionPayments(item.id),history);
      assert.deepEqual(await repo.listSubscriptionPriceChanges(item.id),[]);
      const reminder=await repo.getReminder(updated.reminderId);
      assert.equal(reminder.nextDueAt,zonedDateTimeToUtc(future,'09:00'));
      const later=shiftDate(today,20),moved=await updateSubscription(item.id,parseSubscriptionPatch({nextRenewalOn:later}));
      assert.equal(moved.reminderId,updated.reminderId,'reuse the reminder');
      await assert.rejects(updateSubscription(item.id,parseSubscriptionPatch({nextRenewalOn:past})),/未来/);
      await assert.rejects(updateSubscription(item.id,parseSubscriptionPatch({nextRenewalOn:'2020-01-01'})),/开始日期/);
      assert.equal((await repo.getSubscription(item.id)).nextRenewalOn,later);
      const manual=await create(false),manualDate=shiftDate(today,-3);
      await updateSubscription(manual.id,parseSubscriptionPatch({nextRenewalOn:manualDate}));
      assert.equal((await repo.getSubscription(manual.id)).nextRenewalOn,manualDate);
      assert.deepEqual(await repo.listSubscriptionPayments(manual.id),[]);
      const automatic=await create(true);
      await catchUpAutomaticSubscriptionPayments(new Date(),automatic.id);
      assert.equal((await repo.listSubscriptionPayments(automatic.id)).length,1,'unchanged auto-entry semantics');
      const combined=await create(true);
      await updateSubscription(combined.id,parseSubscriptionPatch({name:'Netflix edited',nextRenewalOn:future,amount:'65'}));
      assert.deepEqual(await repo.listSubscriptionPayments(combined.id),[],'full editor also corrects dates without booking');
      assert.equal((await repo.listSubscriptionPriceChanges(combined.id)).length,1);
      assert.equal(await updateSubscription(999999,parseSubscriptionPatch({nextRenewalOn:future})),null);
      assert.throws(()=>parseSubscriptionPatch({nextRenewalOn:'2026-02-30'}));
    `], { encoding: "utf8", env: { ...process.env, EVAORBIT_DATA_BACKEND: "sqlite", EVAORBIT_SQLITE_PATH: path.join(directory, "test.db"), VERCEL: "" } });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally { rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
});
