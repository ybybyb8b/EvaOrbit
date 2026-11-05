// Synthetic account + channel. Never connects to the user's gateway or a model.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";
import { freeLocalPort } from "./local-navigation-browser.mjs";
const { chromium } = await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE || "playwright");
const server = await createServer({ configFile: path.resolve("vite.trackers.config.ts"), server: { host: "127.0.0.1", port: await freeLocalPort(), strictPort: true } });
let browser, context;
const accountId = "10000000-0000-4000-8000-000000000099", now = "2026-11-05T16:00:00.000Z";
const connection = { paired: false, online: false, lastSeenAt: null, commands:[{name:"help",description:"Show commands",argsHint:"",aliases:[]},{name:"new",description:"New session",argsHint:"[name]",aliases:["reset"]},{name:"stop",description:"Stop active work",argsHint:"",aliases:[]},{name:"status",description:"Show session status",argsHint:"",aliases:[]}] }, conversations = [], messages = [], writes = [], errors = [];
const seen = new Map(), sendWrites = () => writes.filter(write => write.action === "send");
let failSend = true, sequence = 0;
await fs.mkdir("tmp/hermes-qa", { recursive: true });
await server.listen();console.log(JSON.stringify({ pid: process.pid, port: server.httpServer.address().port, synthetic: true }));
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  context = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true });
  await context.addInitScript(() => {
    localStorage.setItem("evaorbit.designTheme", "vintage");localStorage.setItem("evaorbit.uiLanguage", "zh");localStorage.setItem("evaorbit.appearanceMode", "light");localStorage.setItem("evaorbit.trackerMode", "readonly");
  });
  await context.route("**/eo-api/**", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === "/eo-api/session") return route.fulfill({ json: { authenticated: true, accountId, email: "preview@example.invalid", onlineBusinessProtocol: 1, onlineBusinessAccountAllowed: true } });
    if (url.pathname === "/eo-api/business/hermes") {
      if (request.method() === "GET") {
        if(url.searchParams.get("view")==="activity") return route.fulfill({json:{connection,threads:conversations.map(c=>{const rows=messages.filter(m=>m.conversation_id===c.id),latest=rows.at(-1),pending=rows.find(m=>m.role==="user"&&["queued","received","processing"].includes(m.status));return {id:c.id,title:c.title,latestSeq:latest?.seq??0,preview:latest?.content??"",unread:rows.filter(m=>m.role==="assistant"&&m.seq>(seen.get(c.id)??0)).length,pending:pending?.status??null,question:rows.some(m=>m.presentation?.state==="pending"),error:rows.find(m=>["failed","interrupted"].includes(m.status)&&m.seq>(seen.get(c.id)??0))?.error??null};}),receipt:messages.find(m=>m.id===url.searchParams.get("receiptId"))??null}});
        const pending = (url.searchParams.get("pending") || "").split(","), after = Number(url.searchParams.get("after") ?? -1), before = Number(url.searchParams.get("before") ?? Number.MAX_SAFE_INTEGER);
        return route.fulfill({ json: { connection, conversations, messages: messages.filter(m => m.conversation_id === url.searchParams.get("conversationId") && m.seq < before && (m.seq > after || pending.includes(m.id))), hasMore: false } });
      }
      const body = request.postDataJSON();writes.push(body);
      if(body.action==="seen"){seen.set(body.conversationId,Math.max(seen.get(body.conversationId)??0,body.seq));return route.fulfill({json:{seen:true}});}
      if (body.action === "send") {
        if (failSend) { failSend = false; return route.fulfill({ status: 500, json: { error: "模拟网络中断" } }); }
        let message = messages.find(m => m.id === body.id);
        if (!message) { message = { id: body.id, seq: ++sequence, conversation_id: body.conversationId, role: "user", content: body.content, status: "queued", attempt_id: body.id, reply_to: null, error: null, presentation:body.note?{kind:"note"}:body.responseTo?{kind:"response"}:{}, created_at: now, updated_at: now };messages.push(message); }
        if (!conversations.some(c => c.id === body.conversationId)) conversations.unshift({ id: body.conversationId, title: body.content.slice(0, 50), created_at: now, updated_at: now });
        if(body.responseTo) { messages.find(m=>m.id===body.responseTo).presentation.state="answered";message.status="done"; }
        return route.fulfill({ json: message });
      }
      if (body.action === "pair") { connection.paired = true;return route.fulfill({ json: { url: "https://fixture.supabase.co", key: "public-fixture", token: "eo_" + "a".repeat(43), userId: accountId } }); }
      if (body.action === "disconnect") { connection.paired = false;connection.online = false;return route.fulfill({ json: { paired: false } }); }
      if (body.action === "clear") { const index = conversations.findIndex(c => c.id === body.conversationId);if (index >= 0) conversations.splice(index, 1);return route.fulfill({ json: { cleared: true } }); }
      if (body.action === "retry") { const message = messages.find(m => m.id === body.id);message.status = "queued";message.error = null;return route.fulfill({ json: message }); }
      throw Error("Unexpected channel action " + body.action);
    }
    const home = url.pathname.match(/^\/eo-api\/home-readonly\/(day|month|due)\/(.+)$/);
    if (home) return route.fulfill({ json: { format: "eo-home-readonly-v1", kind: home[1], key: home[2], accountId, capturedAt: now, data: home[1] === "day" ? { date: home[2], events: [], tasks: [], meals: [], journal: [], sleep: null, activities: [], activityRecords: [], calendarInterpretation: { categories: [], rules: [] } } : home[1] === "month" ? { month: home[2], days: {}, periods: [] } : [] } });
    return route.fulfill({ json: [] });
  });
  const page = await context.newPage();page.setDefaultTimeout(12000);page.on("pageerror", e => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`, { waitUntil: "networkidle" });
  await page.evaluate(async accountId => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open("eo-tracker-local-v1", 1);request.onsuccess = () => resolve(request.result);request.onerror = () => reject(request.error); });
    await new Promise((resolve, reject) => { const tx = db.transaction("session", "readwrite");tx.objectStore("session").put({ accountId, email: "preview@example.invalid" }, "current");tx.oncomplete = resolve;tx.onerror = reject; });db.close();
  }, accountId);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button",{name:"快速记录",exact:true}).click();const logDialog=page.getByRole("dialog",{name:"快速记录",exact:true});await logDialog.waitFor();assert.equal(await logDialog.getByRole("textbox").count(),0,"Home Log only offers record buttons");assert.equal(await logDialog.locator('.home-quick-log-grid > button').count(),10);await page.screenshot({path:"tmp/hermes-qa/home-log-buttons.png",animations:"disabled"});await logDialog.getByRole("button",{name:"关闭",exact:true}).click();await logDialog.waitFor({state:"detached"});
  const floating=page.locator("[data-hermes-activity]");await floating.waitFor({state:"visible"});await floating.click();await page.getByRole("button",{name:"打开 Hermes",exact:true}).click();
  const input = page.getByRole("textbox", { name: "消息内容", exact: true });await input.waitFor();assert.equal(await floating.isVisible(),false,"floating entry hides inside Hermes");
  await page.getByRole('button',{name:'Hermes 命令',exact:true}).click();const commandList=page.getByRole('listbox',{name:'Hermes 命令',exact:true});await commandList.waitFor();assert.equal(await commandList.getByRole('option').count(),4);await page.screenshot({path:'tmp/hermes-qa/commands-mobile.png',animations:'disabled'});await commandList.getByRole('option',{name:/\/status/}).click();assert.equal(await input.inputValue(),'/status');assert.equal(sendWrites().length,0,'selecting a command only fills the composer');await input.fill('/st');assert.equal(await commandList.getByRole('option').count(),2);await input.press('ArrowDown');await input.press('Enter');assert.equal(await input.inputValue(),'/status');await input.fill('');
  await input.fill("明天给 tcyy 选礼物，睡醒后再打扫。");await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.getByText(/模拟网络中断/).waitFor();assert.match(await input.inputValue(), /tcyy/);
  await page.getByRole("button", { name: "发送", exact: true }).click();await page.getByText("已保存 · 等待 Hermes 上线", { exact: true }).waitFor();
  assert.equal(sendWrites()[0].id, sendWrites()[1].id);assert.equal(sendWrites()[0].conversationId, sendWrites()[1].conversationId);
  await page.screenshot({ path: "tmp/hermes-qa/offline-mobile.png" });
  connection.paired = true;connection.online = true;connection.lastSeenAt = new Date().toISOString();messages[0].status = "received";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));await page.getByText("Hermes 已接收", { exact: true }).waitFor();
  messages[0].status = "processing";await page.evaluate(() => window.dispatchEvent(new Event("focus")));await page.getByText("Hermes 正在处理…", { exact: true }).first().waitFor();
  await page.screenshot({ path: "tmp/hermes-qa/processing-mobile.png" });
  messages[0].status = "done";messages.push({...messages[0],id:"20000000-0000-4000-8000-000000000010",seq:++sequence,content:"预算三百以内就好。"});messages.push({ ...messages[0], id: "20000000-0000-4000-8000-000000000001", seq: ++sequence, role: "assistant", content: "先从预算三百以内、实用一点的礼物开始挑。打扫可以留在睡醒以后。", reply_to: messages[0].id });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));await page.getByText(/先从预算三百以内/).waitFor();
  assert.equal(await page.locator('article[data-role="user"] time').count(),1);assert.equal(await page.locator('article[data-role="user"] [data-bubble-tail]').count(),1);assert.equal(await page.locator('article[data-role="user"]').first().locator('[data-state="done"]').count(),1,"per-message receipts stay visible inside a group");
  await page.screenshot({ path: "tmp/hermes-qa/reply-mobile.png" });
  const answer=messages.at(-1);answer.presentation={reasoning:"只展示 Hermes 实际提供的思考内容。"};answer.content="**建议**：先选礼物。\n\n```js\nconst longValue = '"+"long-code-".repeat(30)+"';\n```\n\n| 事项 | 建议 |\n|---|---|\n| 礼物 | 睡醒之后 |";
  // Refresh existing assistant messages through their pending projection, then add a new rich card.
  answer.id="20000000-0000-4000-8000-000000000002";answer.seq=++sequence;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));await page.getByRole("button",{name:"思考内容",exact:true}).waitFor();
  assert.equal(await page.locator('article[data-role="assistant"] time').count(),1);assert.equal(await page.locator('article[data-role="assistant"] [data-bubble-tail]').count(),1);assert.equal(await page.locator('article[data-role="assistant"]').first().locator('time,[data-bubble-tail]').count(),0);
  assert.equal(await page.locator('article[data-role="assistant"]').nth(1).evaluate(element=>{const before=element.previousElementSibling.getBoundingClientRect();return Math.round(element.getBoundingClientRect().top-before.bottom);}),12,"consecutive assistant spacing is half the 24px mobile gap");
  const thinking=page.getByRole("button",{name:"思考内容",exact:true});assert.equal(await thinking.getAttribute("aria-expanded"),"false");await thinking.click();await page.getByText("只展示 Hermes 实际提供的思考内容。",{exact:true}).waitFor();await thinking.click();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"long code stays inside bubble");
  await input.fill("普通聊天草稿还在");await page.getByRole("button",{name:"便利贴",exact:true}).last().click();
  const noteDialog=page.getByRole("dialog",{name:"便利贴",exact:true}),noteInput=noteDialog.getByRole("textbox",{name:"便利贴内容",exact:true});await noteInput.fill("睡醒后让扫地机器人打扫");
  assert.equal(await noteDialog.locator('[data-reicon="close"]').count(),1);assert.equal(await noteInput.locator('..').getByRole('button').count(),0);const noteBounds=await noteDialog.locator('.form-sheet-body').evaluate(element=>({width:element.clientWidth,height:element.clientHeight,scrollWidth:element.scrollWidth,scrollHeight:element.scrollHeight,paperHeight:element.querySelector('form').getBoundingClientRect().height,paperWidth:element.querySelector('form').getBoundingClientRect().width,panelHeight:element.parentElement.getBoundingClientRect().height}));assert(noteBounds.scrollWidth<=noteBounds.width&&noteBounds.scrollHeight<=noteBounds.height,JSON.stringify(noteBounds));
  await page.screenshot({path:"tmp/hermes-qa/sticky-note-mobile.png",animations:"disabled"});
  await page.setViewportSize({width:320,height:520});assert(await noteDialog.locator('.form-sheet-body').evaluate(element=>element.scrollWidth<=element.clientWidth&&element.scrollHeight<=element.clientHeight),"small viewport keeps the paper outside scroll containers");const noteSend=await noteDialog.getByRole('button',{name:'交给 Hermes',exact:true}).boundingBox();assert(noteSend.y+noteSend.height<=520);await page.setViewportSize({width:402,height:874});
  await noteDialog.getByRole("button",{name:"稍后再写",exact:true}).click();await noteDialog.waitFor({state:"detached"});assert.equal(await input.inputValue(),"普通聊天草稿还在");
  await page.getByRole("button",{name:"便利贴",exact:true}).first().click();await noteInput.waitFor();assert.equal(await noteInput.inputValue(),"睡醒后让扫地机器人打扫");
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:"tmp/hermes-qa/sticky-note-desktop.png",animations:"disabled"});await page.setViewportSize({width:402,height:874});
  failSend=true;await noteDialog.getByRole("button",{name:"交给 Hermes",exact:true}).click();await page.getByText(/模拟网络中断/).waitFor();assert.equal(await noteInput.inputValue(),"睡醒后让扫地机器人打扫");
  await noteDialog.getByRole("button",{name:"交给 Hermes",exact:true}).click();await noteDialog.waitFor({state:"detached"});await page.getByText("睡醒后让扫地机器人打扫",{exact:true}).waitFor();assert.equal(sendWrites().at(-1).note,true);assert.equal(sendWrites().at(-1).id,sendWrites().at(-2).id);assert.equal(await input.inputValue(),"普通聊天草稿还在");await input.fill("");
  await page.getByRole("button",{name:"便利贴记录",exact:true}).click();await page.getByRole("button",{name:/睡醒后让扫地机器人打扫/}).waitFor();await page.getByRole("button",{name:"关闭",exact:true}).click();
  const question={...answer,id:"20000000-0000-4000-8000-000000000003",seq:++sequence,content:"你更想先处理哪一个？",presentation:{kind:"choices",promptId:"test-prompt",state:"pending",options:["先挑礼物","先打扫"],multi:false}};messages.push(question);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const choiceDialog=page.getByRole("dialog",{name:"Hermes 在问",exact:true});await choiceDialog.waitFor();
  await choiceDialog.getByRole("textbox",{name:"填写回答",exact:true}).fill("也可以先休息");await choiceDialog.getByRole("button",{name:"关闭",exact:true}).click();await choiceDialog.waitFor({state:"detached"});
  await page.getByRole("button",{name:"查看选项",exact:true}).click();await choiceDialog.waitFor();assert.equal(await choiceDialog.getByRole("textbox",{name:"填写回答",exact:true}).inputValue(),"也可以先休息");
  await page.locator('.form-sheet-layer[data-state="open"]').waitFor();await page.screenshot({path:"tmp/hermes-qa/options-mobile.png",animations:"disabled"});
  failSend=true;await choiceDialog.getByRole("button",{name:/先挑礼物/}).click();await choiceDialog.getByText(/选择尚未确认/).waitFor();assert(await choiceDialog.isVisible(),"failed choice stays open");
  await choiceDialog.getByRole("button",{name:/先挑礼物/}).click();await choiceDialog.waitFor({state:"detached"});await page.getByText("已回复",{exact:true}).waitFor();assert.equal(sendWrites().at(-1).responseTo,question.id);assert.equal(sendWrites().at(-1).id,sendWrites().at(-2).id);
  const multiple={...question,id:"20000000-0000-4000-8000-000000000004",seq:++sequence,content:"睡醒后想做哪些事？",presentation:{kind:"choices",promptId:"multi-prompt",state:"pending",multi:true,options:["先喝一杯水","挑一份适合 tcyy 的生日礼物，也可以先想想她平时喜欢什么，时间不用马上确定","让扫地机器人出来打扫"]}};messages.push(multiple);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));await choiceDialog.waitFor();await choiceDialog.getByRole("button",{name:/先喝一杯水/}).click();await choiceDialog.getByRole("button",{name:/让扫地机器人/}).click();
  assert.equal(await choiceDialog.getByRole("button",{pressed:true}).count(),2);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:"tmp/hermes-qa/options-desktop.png",animations:"disabled"});await page.setViewportSize({width:402,height:874});
  await choiceDialog.getByRole("button",{name:/确认选择/}).click();await choiceDialog.waitFor({state:"detached"});assert.deepEqual(JSON.parse(sendWrites().at(-1).content),["先喝一杯水","让扫地机器人出来打扫"]);
  const custom={...question,id:"20000000-0000-4000-8000-000000000005",seq:++sequence,content:"还有其他想法吗？",presentation:{kind:"choices",promptId:"free-prompt",state:"pending",multi:false,options:[]}};messages.push(custom);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));await choiceDialog.waitFor();await choiceDialog.getByRole("textbox",{name:"填写回答",exact:true}).fill("睡醒之后再决定");await choiceDialog.getByRole("button",{name:"发送回答",exact:true}).click();await choiceDialog.waitFor({state:"detached"});assert.equal(sendWrites().at(-1).content,"睡醒之后再决定");
  await page.screenshot({path:"tmp/hermes-qa/rich-mobile.png"});
  assert.equal(await page.evaluate(()=>scrollY),0,"only the message pane scrolls; page header stays outside global navigation");
  await page.locator('.mobile-nav a[href="/"]').click();await floating.waitFor({state:"visible"});
  messages.push({...custom,id:"20000000-0000-4000-8000-000000000006",seq:++sequence,role:"assistant",content:"收到，睡醒后再决定。",presentation:{},status:"done"});
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await page.locator('[data-hermes-activity][data-tone="reply"]').waitFor();
  const floatBounds=await floating.boundingBox();await page.mouse.move(floatBounds.x+26,floatBounds.y+26);await page.mouse.down();await page.mouse.move(30,350,{steps:8});await page.mouse.up();assert((await floating.boundingBox()).x<30,"widget snaps to the chosen side");
  await page.screenshot({path:"tmp/hermes-qa/floating-home.png"});await floating.click();
  const statusDialog=page.getByRole("dialog",{name:"Hermes",exact:true});await statusDialog.waitFor();await statusDialog.getByRole("button",{name:/明天给 tcyy/}).click();await input.waitFor();await page.getByText("收到，睡醒后再决定。",{exact:true}).waitFor();assert.equal(await floating.isVisible(),false,"floating entry hides again after opening a specific conversation");
  await page.waitForFunction(()=>document.querySelector('[data-hermes-activity]')?.dataset.tone!=="reply");assert(writes.some(write=>write.action==="seen"));
  await page.getByRole("button", { name: "新对话", exact: true }).click();await input.fill("另一件独立的事");await page.getByRole("button", { name: "发送", exact: true }).click();await page.locator("[data-hermes-chat]").getByText("等待 Hermes 接收", { exact: true }).waitFor();
  assert.notEqual(sendWrites()[0].conversationId, sendWrites().at(-1).conversationId);assert.equal(sendWrites().at(-1).messages, undefined, "EO must not send chat history to Hermes");
  const latest = messages.at(-1);latest.status = "failed";latest.error = "模型请求超时";await page.evaluate(() => window.dispatchEvent(new Event("focus")));await page.getByText("模型请求超时", { exact: true }).waitFor();
  await page.getByRole("button", { name: "重新处理", exact: true }).click();await page.locator("[data-hermes-chat]").getByText("等待 Hermes 接收", { exact: true }).waitFor();
  await page.getByRole("button", { name: "online", exact: true }).click();await page.getByRole("button", { name: "下载连接文件", exact: true }).click();await page.getByRole("button", { name: "确认", exact: true }).click();
  // Rotation creates a private file, never plaintext credentials in the conversation DOM.
  assert(!await page.locator("body").innerText().then(text => text.includes("eo_" + "a".repeat(43))));
  await page.getByRole("button", { name: "关闭", exact: true }).click();await page.locator(".form-sheet-layer").waitFor({ state: "detached" });
  await page.setViewportSize({ width: 402, height: 520 });assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const composer = await page.getByRole("button", { name: "发送", exact: true }).boundingBox();assert(composer.y + composer.height <= 520, "composer stays in the reduced viewport");
  await page.setViewportSize({ width: 1440, height: 1000 });await page.screenshot({ path: "tmp/hermes-qa/desktop.png" });
  const desktopComposer = await page.getByRole("button", { name: "发送", exact: true }).boundingBox();assert(desktopComposer.y + desktopComposer.height < 1000);
  await page.setViewportSize({ width: 402, height: 874 });await page.emulateMedia({ reducedMotion: "reduce" });await page.evaluate(() => { document.documentElement.dataset.mode = "dark"; });await page.screenshot({ path: "tmp/hermes-qa/dark-mobile.png" });
  assert.deepEqual(errors, []);console.log(JSON.stringify({ passed: true, screenshots: 9, writes: writes.length, errors }));
} finally { await context?.close();await browser?.close();await server.close(); }
