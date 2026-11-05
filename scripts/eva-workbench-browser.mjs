// Synthetic local shell and mocked business API. No real account or model calls.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";
import { freeLocalPort, navigateLocal } from "./local-navigation-browser.mjs";

const { chromium } = await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE || "playwright");
const server = await createServer({ configFile: path.resolve("vite.trackers.config.ts"), server: { host: "127.0.0.1", port: await freeLocalPort(), strictPort: true } });
let browser, context;
await fs.mkdir("tmp/eva-qa", { recursive: true });
await server.listen();
console.log(JSON.stringify({ pid: process.pid, port: server.httpServer.address().port, synthetic: true }));
const accountId = "10000000-0000-4000-8000-000000000099", date = "2026-11-04", now = "2026-11-04T10:00:00.000Z";
const settings = { enabled: true, pricing: null }, jobs = [], calls = [], writes = [], errors = [];
let failCapture = true;
const day = { date, events: [], tasks: [], meals: [], journal: [], sleep: null, activities: [], activityRecords: [], calendarInterpretation: { categories: [], rules: [] } };
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  context = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await context.addInitScript(() => {
    localStorage.setItem("evaorbit.designTheme", "vintage");if(!localStorage.getItem("evaorbit.uiLanguage"))localStorage.setItem("evaorbit.uiLanguage", "zh");localStorage.setItem("evaorbit.appearanceMode", "light");localStorage.setItem("evaorbit.trackerMode", "readonly");
  });
  await context.route("**/eo-api/**", async route => {
    const r = route.request(), url = new URL(r.url());
    if (url.pathname === "/eo-api/business/eva") {
      if (r.method() === "GET") return route.fulfill({ json: url.searchParams.get("view") === "status" ? settings : { settings, jobs, calls } });
      const body = r.postDataJSON();writes.push(body);
      if (body.action === "settings") { Object.assign(settings, body);return route.fulfill({ json: settings }); }
      if (body.action === "capture") {
        if (failCapture) { failCapture = false;return route.fulfill({ status: 500, json: { error: "模拟保存失败，请重试。" } }); }
        const job = { id: body.key, inboxId: 1, content: body.content, status: body.process && settings.enabled ? "queued" : "held", result: null, taskIds: [], context: [], attempts: 0, lease: null, leaseUntil: null, error: null, createdAt: now, updatedAt: now };
        if (!jobs.some(j => j.id === job.id)) jobs.unshift(job);return route.fulfill({ status: 201, json: job });
      }
      if (body.action === "keep") { jobs.find(j => j.id === body.id).status = "done";return route.fulfill({ json: jobs[0] }); }
      throw Error("Unexpected Eva action " + body.action);
    }
    if (url.pathname === "/eo-api/session") return route.fulfill({ json: { authenticated: true, accountId, email: "preview@example.invalid", onlineBusinessProtocol: 1, onlineBusinessAccountAllowed: true } });
    const home = url.pathname.match(/^\/eo-api\/home-readonly\/(day|month|due)\/(.+)$/);
    if (home) return route.fulfill({ json: { format: "eo-home-readonly-v1", kind: home[1], key: home[2], accountId, capturedAt: now, data: home[1] === "day" ? { ...day, date: home[2] } : home[1] === "month" ? { month: home[2], days: {}, periods: [] } : [] } });
    return route.fulfill({ json: [] });
  });
  const page = await context.newPage();page.setDefaultTimeout(12000);page.on("pageerror", e => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`, { waitUntil: "networkidle" });
  await page.evaluate(async accountId => {
    const db = await new Promise((resolve, reject) => { const req = indexedDB.open("eo-tracker-local-v1", 1);req.onsuccess = () => resolve(req.result);req.onerror = () => reject(req.error); });
    await new Promise((resolve, reject) => { const tx = db.transaction("session", "readwrite");tx.objectStore("session").put({ accountId, email: "preview@example.invalid" }, "current");tx.oncomplete = resolve;tx.onerror = reject; });db.close();
  }, accountId);
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".home-quick-log-trigger").click();
  await page.getByRole("textbox", {name:"纸条内容"}).waitFor();
  const compactInput = page.getByRole("textbox", {name:"纸条内容"});
  const initialHeight = await compactInput.evaluate(el => el.getBoundingClientRect().height);
  assert(initialHeight < 100, "initial paper is compact");
  await compactInput.fill(Array.from({length:12},()=>"多写一点内容。").join("\n"));
  const expandedHeight = await compactInput.evaluate(el => el.getBoundingClientRect().height);
  assert(expandedHeight > initialHeight && expandedHeight <= 280, "paper grows up to its cap");
  await compactInput.fill("");
  assert.equal(await compactInput.evaluate(el => el.getBoundingClientRect().height), initialHeight, "paper shrinks when cleared");
  assert.match(await compactInput.evaluate(el => getComputedStyle(el).boxShadow), /inset/, "Vintage recess is preserved");
  await page.screenshot({animations:"disabled", path: "tmp/eva-qa/vintage-log-mobile.png" });
  const input = page.getByRole("textbox", { name: "纸条内容" });await input.fill("明天取快递。也想重新布置一下书架，还没想好。");
  await page.getByRole("button", { name: "交给 Eva", exact: true }).waitFor();
  await page.screenshot({animations:"disabled", path: "tmp/eva-qa/vintage-paper-mobile.png" });
  await page.getByRole("button", { name: "交给 Eva", exact: true }).click();
  await page.getByText(/模拟保存失败，请重试。/).waitFor().catch(async e=>{console.log(JSON.stringify({writes,body:await page.locator("body").innerText()}));throw e;});assert.match(await input.inputValue(), /明天取快递/);
  await page.getByRole("button", { name: "交给 Eva", exact: true }).click();await input.waitFor({ state: "detached" });
  const submissions = writes.filter(w => w.action === "capture");assert.equal(submissions.length, 2);assert.equal(submissions[0].key, submissions[1].key);
  jobs[0].status = "review";jobs[0].taskIds = [71, 0];jobs[0].result = { summary: "已记下明天取快递。书架的想法留在 Inbox，等你想好了再说。", remaining: "想重新布置书架，具体怎么做还没决定。", review: false, tasks: [{ title: "取快递", notes: "", dueDate: "2026-11-05", dueTime: null, remind: false, review: false }, { title: "整理书架", notes: "先确定要不要做", dueDate: null, dueTime: null, remind: false, review: true }] };
  calls.push({ id: "call", jobId: jobs[0].id, createdAt: now, model: "fixture-model", input: 450, output: 120, cached: 320, cost: null, currency: null, pricing: null, promptVersion: "paper-1" });
  await navigateLocal(page, "Eva");await page.getByText("等你看一眼", { exact: true }).waitFor();
  assert.equal(await page.getByRole("link", { name: "取快递", exact: true }).getAttribute("href"), "/tasks?taskId=71");
  await page.screenshot({animations:"disabled", path: "tmp/eva-qa/vintage-workbench-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "用量与费用", exact: true }).click();await page.getByRole("cell", { name: /未知/ }).waitFor();
  await page.screenshot({animations:"disabled", path: "tmp/eva-qa/vintage-usage-mobile.png", fullPage: true });
  await page.getByRole("switch", { name: "Eva 后台整理" }).click();await page.getByText("Eva 已关闭",{exact:true}).waitFor();assert.equal(settings.enabled, false);
  await page.getByRole("button", { name: "放一张纸条" }).click();await page.locator(".form-sheet-layer[data-state=open]").waitFor();await page.locator(".form-sheet-panel").evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished)));await page.getByRole("textbox", { name: "纸条内容" }).fill("就先记在这里");assert(await page.getByRole("button", { name: "交给 Eva", exact: true }).isDisabled());
  await page.getByRole("button", { name: "存入散落", exact: true }).click();await page.getByRole("textbox", { name: "纸条内容" }).waitFor({ state: "detached" });
  assert.equal(writes.filter(w => w.action === "capture").at(-1).process, false);
  await page.getByRole("button", { name: "纸条与整理" }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });await page.screenshot({animations:"disabled", path: "tmp/eva-qa/vintage-workbench-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 402, height: 874 });await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });await page.evaluate(() => { document.documentElement.dataset.mode = "dark"; });
  await page.screenshot({animations:"disabled", path: "tmp/eva-qa/vintage-workbench-dark.png", fullPage: true });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.evaluate(()=>localStorage.setItem("evaorbit.uiLanguage","en"));await page.reload({waitUntil:"networkidle"});
  await page.locator(".home-quick-log-trigger").click();
  await page.getByRole("textbox",{name:"Paper content"}).waitFor();
  const save=page.getByRole("button",{name:"Save to Inbox",exact:true}),send=page.getByRole("button",{name:"Send to Eva",exact:true});
  await save.waitFor();await send.waitFor();
  const buttonStyles=await Promise.all([save,send].map(button=>button.evaluate(el=>{const s=getComputedStyle(el);return{height:s.height,fontSize:s.fontSize,background:s.backgroundColor,shadow:s.boxShadow,borderRadius:s.borderRadius};})));
  assert.deepEqual(buttonStyles[0],buttonStyles[1],"paper actions share one button material and size");assert.equal(buttonStyles[0].fontSize,"13px");
  assert.equal(buttonStyles[0].shadow,"none","disabled paper actions stay flat while their text remains readable");
  assert.equal(await page.getByRole("button",{name:/存入散落|交给 Eva/}).count(),0);
  await page.screenshot({animations:"disabled",path:"tmp/eva-qa/vintage-log-english.png"});
  const contrasts=[];
  for(const mode of ["light","dark"]){
    await page.evaluate(mode=>{document.documentElement.dataset.mode=mode;},mode);
    for(const content of ["","A paper"]){
      await page.getByRole("textbox",{name:"Paper content"}).fill(content);
      await page.evaluate(()=>Promise.all(document.getAnimations().filter(animation=>animation.effect?.getTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{}))));
      const readings=await page.locator(".eva-paper-action").evaluateAll(buttons=>{
        const ctx=document.createElement("canvas").getContext("2d");
        const luminance=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);const rgb=[...ctx.getImageData(0,0,1,1).data].slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
        return buttons.map(el=>{const s=getComputedStyle(el),a=luminance(s.color),b=luminance(s.backgroundColor);return{color:s.color,background:s.backgroundColor,disabled:el.disabled,contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),opacity:s.opacity};});
      });
      for(const reading of readings){assert(reading.contrast>=4.5,`${mode} paper action contrast ${reading.contrast}`);assert.equal(reading.opacity,"1");}
      contrasts.push({mode,filled:Boolean(content),readings});
    }
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, screenshots: 7, writes: writes.length, contrasts, errors }));
} finally { await context?.close();await browser?.close();await server.close(); }
