import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import test from "node:test";

test("subscription icon migration preserves ledgers; replacements roll back and reset safely", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "eo-subscription-icons-"));
  const env = {...process.env,EVAORBIT_DATA_BACKEND:"sqlite",EVAORBIT_SQLITE_PATH:path.join(directory,"test.db"),EVAORBIT_SUBSCRIPTION_ICON_DIR:path.join(directory,"icons"),VERCEL:""};
  const loader = pathToFileURL(path.join(process.cwd(),"scripts/typescript-test-loader.mjs")).href;
  const run = code => {
    const result = spawnSync(process.execPath,["--experimental-loader",loader,"--input-type=module","--eval",code],{encoding:"utf8",env});
    assert.equal(result.status,0,result.stderr || result.stdout);
  };
  try {
    run(`
      import * as db from './src/lib/db.ts'; import {DatabaseSync} from 'node:sqlite';
      const item=db.createSubscription({name:'Existing',currentAmountMinor:1200,currency:'CNY',billingIntervalValue:1,billingIntervalUnit:'month',startedOn:'2026-01-01',nextRenewalOn:'2099-01-01',autoRenew:false,reminderEnabled:false,reminderDaysBefore:3,reminderTime:null,notes:'Keep me'});
      db.recordSubscriptionPayment(item.id,{scheduledFor:'2026-01-01',paidOn:'2026-01-01',amountMinor:1200,currency:'CNY',note:'Original payment',updateCurrentPrice:false},'2099-01-01');
      const sql=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);sql.exec('ALTER TABLE subscriptions DROP COLUMN icon_path;DELETE FROM migrations WHERE version=76');sql.close();
    `);
    run(`
      import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {DatabaseSync} from 'node:sqlite';
      import * as db from './src/lib/db.ts';import {saveSubscriptionIcon,readSubscriptionIcon,resetSubscriptionIcon} from './src/lib/services/subscription-icon.ts';
      const item=db.listSubscriptions()[0];assert.equal(item.iconPath,'');assert.equal(item.notes,'Keep me');assert.equal(item.paymentCount,1);assert.equal(item.totalSpentMinor,1200);
      const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jK1sAAAAASUVORK5CYII=','base64');
      const image=new File([bytes],'icon.png',{type:'image/png'});
      await assert.rejects(saveSubscriptionIcon(item.id,new File(['<svg/>'],'fake.png')));
      await assert.rejects(saveSubscriptionIcon(item.id,new File([new Uint8Array(4194305)],'huge.png')));
      assert.equal(await saveSubscriptionIcon(999999,image),null);
      const first=await saveSubscriptionIcon(item.id,image);const second=await saveSubscriptionIcon(item.id,image);
      assert.notEqual(first.iconPath,second.iconPath);assert.equal(await readSubscriptionIcon(item.id,first.iconPath),null);
      assert.deepEqual(Buffer.from((await readSubscriptionIcon(item.id,second.iconPath)).bytes),bytes);
      const folder=path.join(process.env.EVAORBIT_SUBSCRIPTION_ICON_DIR,String(item.id));assert.deepEqual(await fs.readdir(folder),[second.iconPath]);
      const sql=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);sql.exec("CREATE TRIGGER reject_icon BEFORE UPDATE OF icon_path ON subscriptions BEGIN SELECT RAISE(ABORT,'test rollback'); END");
      await assert.rejects(saveSubscriptionIcon(item.id,image));await assert.rejects(resetSubscriptionIcon(item.id));
      assert.equal(db.getSubscription(item.id).iconPath,second.iconPath);assert.deepEqual(await fs.readdir(folder),[second.iconPath]);
      sql.exec('DROP TRIGGER reject_icon');const reset=await resetSubscriptionIcon(item.id);assert.equal(reset.iconPath,'');assert.deepEqual(await fs.readdir(folder),[]);
      assert.equal(await readSubscriptionIcon(item.id,null),null);assert.equal(reset.paymentCount,1);assert.equal(reset.totalSpentMinor,1200);assert.equal(db.listSubscriptionPriceChanges(item.id).length,0);
      assert.equal(sql.prepare('SELECT count(*) AS count FROM migrations WHERE version=76').get().count,1);assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);sql.close();
    `);
    run(`import assert from 'node:assert/strict';import * as db from './src/lib/db.ts';assert.equal(db.listSubscriptions()[0].iconPath,'');`);
  }finally{fs.rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});
