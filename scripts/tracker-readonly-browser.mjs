import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { preview } from "vite";
import { trackerFromRow, trackerFieldFromRow, trackerEntryFromRow } from "../src/lib/tracker-rows.ts";
import { readonlyTrackerState } from "../src/lib/tracker-readonly.ts";
import { groupTrackerTimeline } from "../src/lib/tracker-timeline.ts";
import { validateTrackerBackup } from "./tracker-readonly-backup.mjs";

const { chromium } = await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE || "playwright");
const backupPath = path.resolve(process.argv[2] || "");
const backup = JSON.parse(await fs.readFile(backupPath, "utf8"));
validateTrackerBackup(backup);
const snapshot = { format: "eo-trackers-readonly-v1", accountId: backup.accountId, capturedAt: backup.capturedAt, details: backup.records.trackers.map(row => {
  const tracker = trackerFromRow(row), fields = backup.records.tracker_fields.filter(field => field.tracker_id === row.id).map(trackerFieldFromRow), entries = backup.records.tracker_entries.filter(entry => entry.tracker_id === row.id).map(trackerEntryFromRow);
  return { tracker, fields, entries, stats: { total: entries.length } };
}) };
readonlyTrackerState(snapshot, backup.accountId);
const directory = path.dirname(backupPath), profile = await fs.mkdtemp(path.join(directory, "browser-"));
const oldState = { schemaVersion: 1, accountId: backup.accountId, revision: 1, records: [], outbox: [{ mutationId: "canary", localId: "never-upload", resourceType: "tracker", operation: "create", payload: { name: "Safety canary" }, wire: { mutationId: "canary" } }] };
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const originalDigest = digest(oldState), errors = [], writes = [];
const server = await preview({ configFile: path.resolve("vite.trackers.config.ts"), preview: { host: "127.0.0.1", port: 4188, strictPort: true } });
let context, phase="startup";
const report = { environment: "Windows Chrome / bundled UI / real read-only backup / isolated browser canary queue", trackers: snapshot.details.length, fields: backup.records.tracker_fields.length, entries: backup.records.tracker_entries.length, viewedForms: 0 };
try {
  const open = async () => {
    context = await chromium.launchPersistentContext(profile, { channel: "chrome", headless: true, viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true });
    const page = context.pages()[0];
    page.on("pageerror", error=>errors.push(error.name));
    page.on("request", request=>{ if(!["GET","HEAD"].includes(request.method())) writes.push({method:request.method()}); });
    return page;
  };
  let page = await open();
  await page.goto("http://127.0.0.1:4188", { waitUntil: "networkidle" });
  await page.evaluate(async ({snapshot,oldState}) => {
    const db = await new Promise((resolve,reject)=>{const request=indexedDB.open("eo-tracker-local-v1",1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error("DB open failed"));});
    await new Promise((resolve,reject)=>{const tx=db.transaction(["states","session"],"readwrite");tx.objectStore("session").put({accountId:snapshot.accountId,email:"真实账户只读验收"},"current");tx.objectStore("states").put(snapshot,"readonly:"+snapshot.accountId);tx.objectStore("states").put(oldState,snapshot.accountId);tx.oncomplete=resolve;tx.onabort=()=>reject(Error("DB seed failed"));});
    db.close();
  }, {snapshot,oldState});
  const active = snapshot.details.filter(detail=>!detail.tracker.archivedAt);
  phase="real data render";
  const started=Date.now(); await page.reload({waitUntil:"domcontentloaded"});
  await page.locator(".tracker-card").first().waitFor();
  assert.equal(await page.locator(".tracker-card").count(),active.length);
  report.cachedListLoadMs=Date.now()-started;
  assert.equal(await page.getByRole("button",{name:"新增观测",exact:true}).count(),0);
  assert.equal(await page.locator(".tracker-quick").count(),0);
  await page.screenshot({path:path.join(directory,"readonly-list-mobile.png"),fullPage:true});
  for(let index=0;index<active.length;index++) {
    phase="history and forms "+index;
    await page.locator('a[href="#tracker-readonly:tracker:'+active[index].tracker.id+'"]').click();
    await page.waitForFunction(name=>document.querySelector(".tracker-title > span:last-child")?.textContent===name,active[index].tracker.name);
    assert.equal(await page.locator(".tracker-entry-list article").count(),active[index].entries.length);
    const ordered = groupTrackerTimeline(active[index].entries).flatMap(group=>group.entries);
    for(let entryIndex=0;entryIndex<ordered.length;entryIndex++) {
      await page.locator(".tracker-entry-actions summary").nth(entryIndex).click();
      assert.equal(await page.locator(".tracker-entry-actions[open] button").count(),1);
      await page.locator(".tracker-entry-actions[open] button").click();
      await page.locator('.form-sheet-layer[data-state="open"]').waitFor();
      assert.equal(await page.locator("#tracker-entry-form > fieldset").evaluate(fieldset=>fieldset.disabled),true);
      assert.equal(await page.locator("#tracker-entry-form input").first().isDisabled(),true);
      assert.equal(await page.locator('button[form="tracker-entry-form"]').count(),0);
      assert.equal(await page.locator('#tracker-entry-form textarea').inputValue(),ordered[entryIndex].note);
      await page.locator("#tracker-entry-form").evaluate(form=>form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
      await page.locator(".form-sheet-header button").click();
      await page.locator("#tracker-entry-form").waitFor({state:"detached"});
      report.viewedForms++;
    }
    await page.getByRole("tab",{name:"洞察",exact:true}).click();
    await page.getByRole("heading",{name:"记录概览",exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    if(await page.locator(".error-banner").count()) await page.getByRole("button",{name:"收起错误提示",exact:true}).click();
    await page.getByRole("button",{name:"返回 Trackers",exact:true}).click();
  }
  phase="restart"; await context.close(); context=null; page=await open();
  await page.goto("http://127.0.0.1:4188",{waitUntil:"networkidle"});
  assert.equal(await page.locator(".tracker-card").count(),active.length);
  const preserved=await page.evaluate(async accountId=>{const request=indexedDB.open("eo-tracker-local-v1",1);const db=await new Promise(resolve=>{request.onsuccess=()=>resolve(request.result);});const tx=db.transaction("states","readonly"),read=tx.objectStore("states").get(accountId);const value=await new Promise(resolve=>{tx.oncomplete=()=>resolve(read.result);});db.close();return value;},backup.accountId);
  assert.equal(digest(preserved),originalDigest,"old frozen queue must remain byte-equivalent as JSON");
  const cached=await page.evaluate(async accountId=>{const request=indexedDB.open("eo-tracker-local-v1",1);const db=await new Promise(resolve=>{request.onsuccess=()=>resolve(request.result);});const tx=db.transaction("states","readonly"),read=tx.objectStore("states").get("readonly:"+accountId);const value=await new Promise(resolve=>{tx.oncomplete=()=>resolve(read.result);});db.close();return value;},backup.accountId);
  assert.equal(digest(cached),digest(snapshot),"viewing historical forms must not mutate the cached cloud data");
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  Object.assign(report,{queuePreserved:true,cloudBusinessWrites:0,restartPassed:true,nativeDeviceVerified:false});
  await fs.writeFile(path.join(directory,"browser-readonly-report.json"),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
}catch(error){await fs.writeFile(path.join(directory,"browser-failure-private.txt"),String(error.stack??error));console.error(JSON.stringify({phase,result:"failed",details:"Private failure file saved alongside backup"}));process.exitCode=1;}
finally{await context?.close();await new Promise((resolve,reject)=>server.httpServer.close(error=>error?reject(error):resolve()));}
