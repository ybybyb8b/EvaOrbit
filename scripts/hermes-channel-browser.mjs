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
let failSend = true, failRead = false, pageSize = Infinity, sequence = 0;
let interruptedSend;
let delayedConversationRead;
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
        if (failRead) return route.fulfill({ status: 503, json: { error: "模拟查询失败" } });
        if(url.searchParams.get("view")==="activity") return route.fulfill({json:{connection,threads:conversations.map(c=>{const rows=messages.filter(m=>m.conversation_id===c.id),latest=rows.at(-1),pending=rows.find(m=>m.role==="user"&&["queued","received","processing"].includes(m.status));return {id:c.id,title:c.title,latestSeq:latest?.seq??0,preview:latest?.content??"",unread:rows.filter(m=>m.role==="assistant"&&m.seq>(seen.get(c.id)??0)).length,pending:pending?.status??null,question:rows.some(m=>m.presentation?.state==="pending"),error:rows.find(m=>["failed","interrupted"].includes(m.status)&&m.seq>(seen.get(c.id)??0))?.error??null};}),receipt:messages.find(m=>m.id===url.searchParams.get("receiptId"))??null}});
        if (delayedConversationRead) await delayedConversationRead;
        const pending = (url.searchParams.get("pending") || "").split(","), after = Number(url.searchParams.get("after") ?? -1), before = Number(url.searchParams.get("before") ?? Number.MAX_SAFE_INTEGER);
        const rows = messages.filter(m => m.conversation_id === url.searchParams.get("conversationId") && m.seq < before && (m.seq > after || pending.includes(m.id)));
        return route.fulfill({ json: { connection, conversations, messages: rows.slice(-pageSize), hasMore: rows.length > pageSize } });
      }
      const body = request.postDataJSON();writes.push(body);
      if(body.action==="seen"){seen.set(body.conversationId,Math.max(seen.get(body.conversationId)??0,body.seq));return route.fulfill({json:{seen:true}});}
      if (body.action === "send") {
        if (failSend) { failSend = false; return route.fulfill({ status: 500, json: { error: "模拟服务异常\nTraceback: synthetic gateway diagnostic", code: "hermes_fixture" } }); }
        const interruption = interruptedSend;
        interruptedSend = undefined;
        if (interruption) {
          await interruption.background;
          if (!interruption.saved) return route.abort("connectionreset");
        }
        let message = messages.find(m => m.id === body.id);
        if (!message) { message = { id: body.id, seq: ++sequence, conversation_id: body.conversationId, role: "user", content: body.content, status: "queued", attempt_id: body.id, reply_to: body.responseTo ?? null, error: null, presentation:body.note?{kind:"note"}:body.responseTo?{kind:"response"}:body.content==="/stop"?{kind:"command"}:{}, created_at: now, updated_at: now };messages.push(message); }
        if (!conversations.some(c => c.id === body.conversationId)) conversations.unshift({ id: body.conversationId, title: body.content.slice(0, 50), created_at: now, updated_at: now });
        if(body.responseTo) { messages.find(m=>m.id===body.responseTo).presentation.state="answered";message.status="done"; }
        if (interruption) return route.abort("connectionreset");
        return route.fulfill({ json: message });
      }
      if (body.action === "pair") { connection.paired = true;return route.fulfill({ json: { url: "https://fixture.supabase.co", key: "public-fixture", token: "eo_" + "a".repeat(43), userId: accountId } }); }
      if (body.action === "disconnect") { connection.paired = false;connection.online = false;return route.fulfill({ json: { paired: false } }); }
      if (body.action === "rename") {
        if (writes.filter(write => write.action === "rename").length === 1) return route.fulfill({ status: 504, json: { error: "模拟改名超时" } });
        const conversation = conversations.find(c => c.id === body.conversationId);
        conversation.title = body.title;
        return route.fulfill({ json: { id: conversation.id, title: conversation.title } });
      }
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
  const floating=page.locator("[data-hermes-activity]");await floating.waitFor({state:"visible"});await floating.tap();
  const input = page.getByRole("textbox", { name: "消息内容", exact: true });await input.waitFor();assert.equal(await floating.isVisible(),false,"floating entry hides inside Hermes");
  await page.getByRole('button',{name:'Hermes 命令',exact:true}).click();const commandList=page.getByRole('listbox',{name:'Hermes 命令',exact:true});await commandList.waitFor();assert.equal(await commandList.getByRole('option').count(),4);await page.screenshot({path:'tmp/hermes-qa/commands-mobile.png',animations:'disabled'});await commandList.getByRole('option',{name:/\/status/}).click();assert.equal(await input.inputValue(),'/status');assert.equal(sendWrites().length,0,'selecting a command only fills the composer');await input.fill('/st');assert.equal(await commandList.getByRole('option').count(),2);await input.press('ArrowDown');await input.press('Enter');assert.equal(await input.inputValue(),'/status');await input.fill('');
  await input.fill("明天给 tcyy 选礼物，睡醒后再打扫。");await page.getByRole("button", { name: "发送", exact: true }).click();
  const banner = page.locator("#evaorbit-error-banner");
  await banner.getByText("Hermes 消息服务暂时出错。", { exact: true }).waitFor();
  assert.equal(await banner.locator("pre").count(), 0, "technical details stay hidden by default");
  await banner.getByRole("button", { name: "查看报错详情", exact: true }).click();
  await banner.locator("pre").waitFor();
  assert.match(await banner.locator("pre").textContent(), /Traceback: synthetic gateway diagnostic/);
  assert.match(await banner.locator("pre").textContent(), /\[EO:hermes_fixture\]/);
  await Promise.all([
    page.waitForResponse(response => response.url().includes("/eo-api/business/hermes?") && response.request().method() === "GET"),
    page.evaluate(() => window.dispatchEvent(new Event("focus"))),
  ]);
  await banner.getByRole("button", { name: "收起报错详情", exact: true }).click();
  assert.equal(await banner.locator("pre").count(), 0);
  assert.match(await input.inputValue(), /tcyy/);
  await page.getByRole("button", { name: "发送", exact: true }).click();await page.getByText("已保存 · 等待 Hermes 上线", { exact: true }).waitFor();
  assert.equal(sendWrites()[0].id, sendWrites()[1].id);assert.equal(sendWrites()[0].conversationId, sendWrites()[1].conversationId);
  await page.screenshot({ path: "tmp/hermes-qa/offline-mobile.png" });
  connection.paired = true;connection.online = true;connection.lastSeenAt = new Date().toISOString();messages[0].status = "received";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));await page.getByText("Hermes 已接收", { exact: true }).waitFor();
  messages[0].status = "processing";await page.evaluate(() => window.dispatchEvent(new Event("focus")));await page.getByText("Hermes 正在处理", { exact: true }).waitFor();assert.equal(await page.locator('[data-state="processing"]').textContent(),"已发送");
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
  assert(await thinking.evaluate(button => !button.closest("[data-bubble-tail]") && button.closest(".eo-disclosure").nextElementSibling?.querySelector(".markdown-content")), "thinking stays outside the reply bubble");
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"long code stays inside bubble");
  assert.equal(await page.getByRole("button", { name: /便利贴/ }).count(), 0);
  const legacyNote = { ...messages[0], id: "20000000-0000-4000-8000-000000000011", seq: ++sequence,
    content: "睡醒后让扫地机器人打扫", presentation: { kind: "note" } };
  messages.push(legacyNote);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.locator("#hermes-" + legacyNote.id).locator("[data-note]").getByText(legacyNote.content, { exact: true }).waitFor();
  const question={...answer,id:"20000000-0000-4000-8000-000000000003",seq:++sequence,content:"你更想先处理哪一个？",presentation:{kind:"choices",promptId:"test-prompt",state:"pending",options:["先挑礼物","先打扫"],multi:false}};messages.push(question);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const choiceDialog=page.getByRole("dialog",{name:"Hermes 在问",exact:true});await choiceDialog.waitFor();
  assert((seen.get(question.conversation_id) ?? 0) < question.seq, "an automatically opened question does not acknowledge its covered bubble");
  await choiceDialog.getByRole("textbox",{name:"填写回答",exact:true}).fill("也可以先休息");await choiceDialog.getByRole("button",{name:"关闭",exact:true}).click();await choiceDialog.waitFor({state:"detached"});
  await page.getByRole("button",{name:"查看选项",exact:true}).click();await choiceDialog.waitFor();assert.equal(await choiceDialog.getByRole("textbox",{name:"填写回答",exact:true}).inputValue(),"也可以先休息");
  await page.locator('.form-sheet-layer[data-state="open"]').waitFor();await page.screenshot({path:"tmp/hermes-qa/options-mobile.png",animations:"disabled"});
  failSend=true;await choiceDialog.getByRole("button",{name:/先挑礼物/}).click();await choiceDialog.getByText("Hermes 消息服务暂时出错。",{exact:true}).waitFor();assert(await choiceDialog.isVisible(),"failed choice stays open");
  await choiceDialog.getByRole("button",{name:/先挑礼物/}).click();await choiceDialog.waitFor({state:"detached"});await page.getByText("已回复",{exact:true}).waitFor();assert.equal(sendWrites().at(-1).responseTo,question.id);assert.equal(sendWrites().at(-1).id,sendWrites().at(-2).id);
  const multiple={...question,id:"20000000-0000-4000-8000-000000000004",seq:++sequence,content:"睡醒后想做哪些事？",presentation:{kind:"choices",promptId:"multi-prompt",state:"pending",multi:true,options:["先喝一杯水","挑一份适合 tcyy 的生日礼物，也可以先想想她平时喜欢什么，时间不用马上确定","让扫地机器人出来打扫"]}};messages.push(multiple);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));await choiceDialog.waitFor();await choiceDialog.getByRole("button",{name:/先喝一杯水/}).click();await choiceDialog.getByRole("button",{name:/让扫地机器人/}).click();
  assert.equal(await choiceDialog.getByRole("button",{pressed:true}).count(),2);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:"tmp/hermes-qa/options-desktop.png",animations:"disabled"});await page.setViewportSize({width:402,height:874});
  await choiceDialog.getByRole("button",{name:/确认选择/}).click();await choiceDialog.waitFor({state:"detached"});assert.deepEqual(JSON.parse(sendWrites().at(-1).content),["先喝一杯水","让扫地机器人出来打扫"]);
  const selectionBubble = page.locator(`[id="hermes-${sendWrites().at(-1).id}"]`);
  assert.deepEqual(await selectionBubble.getByRole("listitem").allTextContents(), ["先喝一杯水", "让扫地机器人出来打扫"]);
  const custom={...question,id:"20000000-0000-4000-8000-000000000005",seq:++sequence,content:"还有其他想法吗？",presentation:{kind:"choices",promptId:"free-prompt",state:"pending",multi:false,options:[]}};messages.push(custom);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));await choiceDialog.waitFor();await choiceDialog.getByRole("textbox",{name:"填写回答",exact:true}).fill("睡醒之后再决定");await choiceDialog.getByRole("button",{name:"发送回答",exact:true}).click();await choiceDialog.waitFor({state:"detached"});assert.equal(sendWrites().at(-1).content,"睡醒之后再决定");
  await page.screenshot({path:"tmp/hermes-qa/rich-mobile.png"});
  assert.equal(await page.evaluate(()=>scrollY),0,"only the message pane scrolls; page header stays outside global navigation");
  await page.getByRole("button", { name: "返回上一页" }).click();await floating.waitFor({state:"visible"});
  await page.locator('.mobile-nav a[href="/"]').waitFor();
  messages.push({...custom,id:"20000000-0000-4000-8000-000000000006",seq:++sequence,role:"assistant",content:"收到，睡醒后再决定。",presentation:{},status:"done"});
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await page.locator('[data-hermes-activity][data-tone="reply"]').waitFor();
  const floatBounds=await floating.boundingBox();await page.mouse.move(floatBounds.x+26,floatBounds.y+26);await page.mouse.down();await page.mouse.move(30,350,{steps:8});await page.mouse.up();assert((await floating.boundingBox()).x<30,"widget snaps to the chosen side");
  await page.screenshot({path:"tmp/hermes-qa/floating-home.png"});await floating.click({delay:550});
  const statusDialog=page.getByRole("dialog",{name:"Hermes",exact:true});await statusDialog.waitFor();await statusDialog.getByRole("button",{name:"关闭",exact:true}).click();await statusDialog.waitFor({state:"detached"});
  await floating.tap();await input.waitFor();await page.getByText("收到，睡醒后再决定。",{exact:true}).waitFor();assert.equal(await floating.isVisible(),false,"floating entry hides again after opening a specific conversation");
  await page.waitForFunction(()=>document.querySelector('[data-hermes-activity]')?.dataset.tone!=="reply");assert(writes.some(write=>write.action==="seen"));
  await page.getByRole("button", { name: "新对话", exact: true }).click();await input.fill("另一件独立的事");await page.getByRole("button", { name: "发送", exact: true }).click();await page.locator("[data-hermes-chat]").getByText("等待 Hermes 接收", { exact: true }).waitFor();
  assert(await page.getByRole("button", { name: "等待 Hermes 接收后可停止", exact: true }).isDisabled());
  assert.notEqual(sendWrites()[0].conversationId, sendWrites().at(-1).conversationId);assert.equal(sendWrites().at(-1).messages, undefined, "EO must not send chat history to Hermes");
  await page.getByRole("button", { name: "历史对话", exact: true }).click();
  const history = page.getByRole("dialog", { name: "历史对话" });
  await history.getByRole("button", { name: "修改名称：另一件独立的事", exact: true }).click();
  const renameDialog = page.getByRole("dialog", { name: "修改对话名称" });
  const titleInput = renameDialog.getByRole("textbox", { name: "对话名称" });
  assert.equal(await titleInput.inputValue(), "另一件独立的事");
  await titleInput.fill("  ");
  const saveTitle = renameDialog.getByRole("button", { name: "保存", exact: true });
  await saveTitle.and(page.locator(":disabled")).waitFor();
  await titleInput.fill("  独立计划  ");
  await saveTitle.click();
  await renameDialog.getByText("请求超时。", { exact: true }).waitFor();
  assert.equal(await titleInput.inputValue(), "  独立计划  ");
  await saveTitle.click();
  const renamed = history.getByRole("button", { name: "独立计划", exact: true });
  await renamed.waitFor();
  assert.equal(await renamed.getAttribute("aria-current"), "true");
  assert.deepEqual(writes.findLast(write => write.action === "rename"), {
    action: "rename", conversationId: sendWrites().at(-1).conversationId, title: "独立计划",
  });
  await renamed.click();
  await page.getByText("另一件独立的事", { exact: true }).waitFor();
  const latest = messages.at(-1);latest.status = "failed";latest.error = "模型请求超时";await page.evaluate(() => window.dispatchEvent(new Event("focus")));await page.getByText("请求超时。", { exact: true }).waitFor();
  await page.getByRole("button", { name: "重新处理", exact: true }).click();await page.locator("[data-hermes-chat]").getByText("等待 Hermes 接收", { exact: true }).waitFor();
  await page.getByRole("button", { name: "online", exact: true }).click();await page.getByRole("button", { name: "下载连接文件", exact: true }).click();await page.getByRole("button", { name: "确认", exact: true }).click();
  // Rotation creates a private file, never plaintext credentials in the conversation DOM.
  assert(!await page.locator("body").innerText().then(text => text.includes("eo_" + "a".repeat(43))));
  await page.getByRole("button", { name: "关闭", exact: true }).click();await page.locator(".form-sheet-layer").waitFor({ state: "detached" });
  const mobileNav = page.locator(".mobile-nav");
  assert.equal(await mobileNav.count(), 0, "Hermes hides the bottom navigation even before focusing the composer");
  assert.equal(await page.locator(".home-quick-log-trigger").count(), 0);
  await input.focus();
  await page.evaluate(() => {
    const viewport = window.visualViewport;
    Object.defineProperty(viewport, "height", { configurable: true, value: 480 });
    Object.defineProperty(viewport, "offsetTop", { configurable: true, value: 24 });
    viewport.dispatchEvent(new Event("resize"));
  });
  await page.waitForFunction(() => document.querySelector("[data-hermes-chat]")?.dataset.keyboardOpen === "true");
  assert.equal(await page.locator("[data-hermes-chat]").getAttribute("data-keyboard-open"), "true", JSON.stringify(await input.evaluate(element => ({
    focused: document.activeElement === element,
    viewportHeight: window.visualViewport.height,
    viewportScale: window.visualViewport.scale,
    layoutHeight: window.innerHeight,
    touch: matchMedia("(any-pointer: coarse)").matches,
  }))));
  assert.equal(await mobileNav.count(), 0);
  const keyboardGap = await input.evaluate(element => window.visualViewport.height - element.form.getBoundingClientRect().bottom);
  assert(keyboardGap >= 0 && keyboardGap <= 6, "composer stays just above the keyboard when a reported offset has not moved the page");
  await page.evaluate(() => {
    const viewport = window.visualViewport;
    Reflect.deleteProperty(viewport, "height");
    Reflect.deleteProperty(viewport, "offsetTop");
    viewport.dispatchEvent(new Event("resize"));
  });
  assert.equal(await mobileNav.count(), 0, "closing the keyboard keeps Hermes in full-screen mode");
  await input.blur();
  await page.setViewportSize({ width: 402, height: 520 });assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const composerAction = page.locator("[data-hermes-chat] form:has(textarea) > button");
  const composer = await composerAction.boundingBox();assert(composer.y + composer.height <= 520, "composer stays in the reduced viewport");
  await page.setViewportSize({ width: 1440, height: 1000 });await page.screenshot({ path: "tmp/hermes-qa/desktop.png" });
  const desktopComposer = await composerAction.boundingBox();assert(desktopComposer.y + desktopComposer.height < 1000);
  await page.setViewportSize({ width: 402, height: 874 });await page.emulateMedia({ reducedMotion: "reduce" });await page.evaluate(() => { document.documentElement.dataset.mode = "dark"; });await page.screenshot({ path: "tmp/hermes-qa/dark-mobile.png" });
  const previewConversation = "20000000-0000-4000-8000-000000000020";
  conversations.unshift({ id: previewConversation, title: "明天再整理", created_at: now, updated_at: now });
  const previewMessage = { ...messages[0], id: "20000000-0000-4000-8000-000000000021", conversation_id: previewConversation, seq: ++sequence, role: "user", status: "done", error: null, presentation: {}, content: "今天先把想法记下来，剩下的明天再整理。" };
  messages.push(previewMessage, { ...previewMessage, id: "20000000-0000-4000-8000-000000000022", seq: ++sequence, role: "assistant", content: "好，先记在这里。明天你回来时，我们可以从最想做的一件事开始。", reply_to: previewMessage.id });
  const longCode = `const value = "${"long value ".repeat(15)}";`;
  messages.push(
    { ...previewMessage, id: "20000000-0000-4000-8000-000000000023", seq: ++sequence, role: "assistant", content: "```js\n" + longCode + "\n```", reply_to: previewMessage.id },
    { ...previewMessage, id: "20000000-0000-4000-8000-000000000024", seq: ++sequence, role: "assistant", content: "💾 Self-improvement review: Skill 'hermes-agent' patched", presentation: { notice: true } },
    { ...previewMessage, id: "20000000-0000-4000-8000-000000000025", seq: ++sequence, role: "assistant", content: "♻️ Gateway online — Hermes is back and ready.", reply_to: null },
    { ...previewMessage, id: "20000000-0000-4000-8000-000000000026", seq: ++sequence, role: "assistant", content: `✅ Home channel set to **EvaOrbit** (ID: ${previewConversation}).\nCron jobs and cross-platform messages will be delivered here.`, reply_to: previewMessage.id },
    { ...previewMessage, id: "20000000-0000-4000-8000-000000000027", seq: ++sequence, role: "assistant", content: "🧑🏽‍💻 Gateway diagnostics", presentation: { notice: true } },
    { ...previewMessage, id: "20000000-0000-4000-8000-000000000028", seq: ++sequence, role: "assistant", content: "Gateway advisory", presentation: { notice: true } },
  );
  await page.reload({ waitUntil: "networkidle" });
  await floating.tap();
  await page.evaluate(() => { document.documentElement.dataset.mode = "dark"; });
  await page.getByText("好，先记在这里。明天你回来时，我们可以从最想做的一件事开始。", { exact: true }).waitFor();
  const systemNotice = page.locator("[data-hermes-notice]");
  await systemNotice.getByText("Self-improvement review: Skill 'hermes-agent' patched", { exact: true }).waitFor();
  await systemNotice.getByText("Gateway online — Hermes is back and ready.", { exact: true }).waitFor();
  await systemNotice.locator("strong").getByText("EvaOrbit", { exact: true }).waitFor();
  for (const [emoji, body] of [["💾", "Self-improvement review"], ["♻️", "Gateway online"], ["✅", "Home channel set"], ["🧑🏽‍💻", "Gateway diagnostics"]]) {
    const notice = systemNotice.filter({ hasText: body });
    assert.equal(await notice.locator(":scope > span").textContent(), emoji);
    assert(!((await notice.locator(".markdown-content").textContent()).includes(emoji)));
  }
  await systemNotice.filter({ hasText: "Gateway advisory" }).locator(":scope > span > svg:visible").waitFor();
  assert.equal(await systemNotice.locator("article,[data-bubble-tail],[data-hermes-avatar]").count(), 0);
  const codeBlock = page.locator(".markdown-code-block").filter({ hasText: longCode });
  const contrast = () => codeBlock.evaluate(block => {
    function luminance(css) {
      return css.match(/\d+(?:\.\d+)?/g).slice(0, 3).map(Number).reduce((sum, value, index) => {
        const v = value / 255;
        return sum + [0.2126, 0.7152, 0.0722][index] * (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      }, 0);
    }
    const fg = luminance(getComputedStyle(block.querySelector("code")).color);
    const bg = luminance(getComputedStyle(block).backgroundColor);
    return (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05);
  });
  for (const mode of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.mode = value; }, mode);
    assert((await contrast()) >= 4.5, `${mode} code text must be readable`);
    assert(await codeBlock.locator("pre").evaluate(pre => pre.scrollWidth > pre.clientWidth), "long code stays horizontally scrollable");
    await page.screenshot({ path: `tmp/hermes-qa/code-notice-${mode}.png`, animations: "disabled" });
  }
  const appearanceButton = page.getByRole("button", { name: "聊天外观", exact: true });
  await appearanceButton.click();
  const appearanceDialog = page.getByRole("dialog", { name: "聊天外观", exact: true });
  for (const [label, file] of [
    ["Hermes 头像", "public/images/lucius-profile-portrait-v2.png"],
    ["你的头像", "public/eva-home-cat.png"],
    ["聊天背景", "public/images/lucius-cover-dark.png"],
  ]) {
    await appearanceDialog.getByLabel(label, { exact: true }).setInputFiles(file);
    await appearanceDialog.getByRole("button", { name: `恢复${label}`, exact: true }).waitFor();
  }
  await appearanceDialog.getByRole("button", { name: "关闭", exact: true }).click();
  await appearanceDialog.waitFor({ state: "detached" });
  await page.locator("[data-hermes-wallpaper]").waitFor();
  await page.locator('article[data-role="assistant"] [data-hermes-avatar]').first().waitFor();
  await page.locator('article[data-role="user"] [data-hermes-avatar]').first().waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
    const wallpaper = document.querySelector("[data-hermes-wallpaper]");
    const image = new Image();
    image.src = wallpaper.style.backgroundImage.slice(5, -2);
    await Promise.all([image.decode(), ...Array.from(document.querySelectorAll("[data-hermes-avatar]"), avatar => avatar.decode())]);
  });
  for (const [name, viewport, mode] of [
    ["mobile-light", { width: 402, height: 874 }, "light"],
    ["mobile-dark", { width: 402, height: 874 }, "dark"],
    ["desktop-light", { width: 1440, height: 940 }, "light"],
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(value => { document.documentElement.dataset.mode = value; }, mode);
    const coverage = await page.locator("[data-hermes-wallpaper]").evaluate(wallpaper => {
      const bounds = wallpaper.getBoundingClientRect();
      const main = wallpaper.closest("main").getBoundingClientRect();
      const style = getComputedStyle(wallpaper);
      const chat = wallpaper.parentElement.querySelector("[data-hermes-chat]");
      const header = chat.querySelector("header");
      const fade = getComputedStyle(header, "::before");
      return { bounds: bounds.toJSON(), main: main.toJSON(), viewportHeight: window.innerHeight,
        size: style.backgroundSize, overlay: getComputedStyle(wallpaper, "::after").content,
        headerFill: getComputedStyle(header).backgroundColor,
        fade: [fade.backgroundColor, fade.backdropFilter, fade.maskImage],
        glass: [header.querySelector(".page-back-button"), header.querySelector("nav"), chat.querySelector("form")].map(element => {
          const material = getComputedStyle(element);
          return [material.backgroundColor, material.backdropFilter, material.boxShadow];
        }) };
    });
    await page.screenshot({ path: `tmp/hermes-qa/wallpaper-${name}.png`, animations: "disabled" });
    assert(Math.abs(coverage.bounds.top - Math.max(0, coverage.main.top)) < 1
      && ["left", "right"].every(edge => Math.abs(coverage.bounds[edge] - coverage.main[edge]) < 1)
      && coverage.bounds.bottom >= coverage.viewportHeight - 1 && coverage.size === "cover", `${name} wallpaper coverage ${JSON.stringify(coverage)}`);
    assert.equal(coverage.overlay === "none", mode === "light");
    assert.equal(coverage.headerFill, "rgba(0, 0, 0, 0)");
    assert.equal(coverage.fade[0], coverage.headerFill);
    assert.match(coverage.fade[1], /blur\(/);
    assert.match(coverage.fade[2], /linear-gradient\(/);
    assert.deepEqual(coverage.glass.slice(0, 2), [coverage.glass[2], coverage.glass[2]], "both header controls use the composer's material");
    assert.match(coverage.glass[2][0], /^rgba\(.+, 0\.72\)$/, "composer keeps its glass tint");
  }
  await page.setViewportSize({ width: 402, height: 874 });
  const wallpaper = page.locator("[data-hermes-wallpaper]");
  await page.waitForFunction(() => document.querySelector("[data-hermes-wallpaper]")?.getBoundingClientRect().height === innerHeight);
  const restingWallpaper = await wallpaper.boundingBox();
  const back = page.getByRole("button", { name: "返回上一页" });
  const restingHeader = await back.boundingBox();
  const restingComposer = await input.evaluate(element => element.form.getBoundingClientRect().bottom);
  assert.equal(await input.evaluate(element => getComputedStyle(element).scrollMarginBottom), "0px");
  await input.focus();
  for (const [height, top, pan, visibleTop] of [[790, 0, 0, 0], [528, 346, 0, 0], [480, 125, 0, 125], [160, 0, 0, 0], [495, 84, 84, 0]]) {
    const gap = await input.evaluate(async (element, { height, top, pan, visibleTop }) => {
      const viewport = window.visualViewport;
      element.closest("main").style.translate = `0 -${pan}px`;
      Object.defineProperty(viewport, "height", { configurable: true, value: height });
      Object.defineProperty(viewport, "offsetTop", { configurable: true, value: top });
      Object.defineProperty(viewport, "pageTop", { configurable: true, value: scrollY + visibleTop });
      viewport.dispatchEvent(new Event("resize"));
      viewport.dispatchEvent(new Event("scroll"));
      await new Promise(resolve => requestAnimationFrame(resolve));
      return visibleTop + height - element.form.getBoundingClientRect().bottom;
    }, { height, top, pan, visibleTop });
    const bounds = await wallpaper.boundingBox();
    assert.equal(bounds.height, restingWallpaper.height, "keyboard motion must not recrop the wallpaper");
    assert(Math.abs(bounds.y - visibleTop - restingWallpaper.y) <= 1, "wallpaper stays anchored in the visible viewport");
    assert(Math.abs((await back.boundingBox()).y - visibleTop - restingHeader.y) <= 1, "header stays at its resting position in the visible viewport");
    assert(gap >= 3 && gap <= 5, `composer follows keyboard motion, got ${gap}px`);
  }
  const originalDraft = await input.inputValue();
  const keyboardFormHeight = await input.evaluate(element => element.form.getBoundingClientRect().height);
  await input.fill("单行");
  const fittedBottoms = await input.evaluate(async element => {
    const bottoms = [element.form.getBoundingClientRect().bottom];
    for (const [inputType, height] of [["insertText", 494], ["deleteContentBackward", 497], ["deleteContentBackward", 519], ["insertText", 495], ["insertText", 448], ["deleteContentBackward", 520]]) {
      element.dispatchEvent(new InputEvent("beforeinput", { inputType, bubbles: true }));
      Object.defineProperty(window.visualViewport, "height", { configurable: true, value: height });
      window.visualViewport.dispatchEvent(new Event("resize"));
      await new Promise(resolve => requestAnimationFrame(resolve));
      bottoms.push(element.form.getBoundingClientRect().bottom);
    }
    return bottoms;
  });
  assert.deepEqual(fittedBottoms, [491, 491, 491, 491, 491, 444, 444], "typing and deleting ignore small jitter and transient extra space, but immediately clear a taller keyboard");
  await page.waitForFunction(() => Math.abs(document.querySelector("[data-hermes-chat] textarea").form.getBoundingClientRect().bottom - 516) <= 1);
  assert.equal(await input.evaluate(element => getComputedStyle(element.form).outlineStyle), "none", "focusing the input does not outline the composer");
  await input.fill("中文输入测试\n候选词变化\n继续输入第三行");
  assert(await input.evaluate(element => element.form.getBoundingClientRect().height) > keyboardFormHeight, "multiline drafts can expand with the keyboard open");
  assert(await input.evaluate(element => {
    const log = element.closest("[data-hermes-chat]").querySelector("header + div");
    const formBottom = element.form.getBoundingClientRect().bottom;
    return log.getBoundingClientRect().bottom <= element.form.getBoundingClientRect().top && Math.abs(formBottom - 516) <= 1;
  }), "composer growth uses space from the message list and keeps the same keyboard gap");
  await page.screenshot({ path: "tmp/hermes-qa/keyboard-mobile.png", clip: { x: 0, y: 0, width: 402, height: 520 } });
  await input.fill(originalDraft);
  await input.blur();
  await input.evaluate(async element => {
    const viewport = window.visualViewport;
    element.closest("main").style.removeProperty("translate");
    Reflect.deleteProperty(viewport, "height");
    Reflect.deleteProperty(viewport, "pageTop");
    window.dispatchEvent(new Event("evaorbit:native-active"));
    await new Promise(resolve => requestAnimationFrame(resolve));
  });
  assert.deepEqual(await wallpaper.boundingBox(), restingWallpaper);
  assert.deepEqual(await back.boundingBox(), restingHeader);
  assert.equal(await input.evaluate(element => element.form.getBoundingClientRect().bottom), restingComposer);
  await page.evaluate(() => Reflect.deleteProperty(window.visualViewport, "offsetTop"));
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("[data-hermes-activity]").tap();
  await page.locator("[data-hermes-wallpaper]").waitFor();
  assert(await page.evaluate(() => !window.dispatchEvent(new Event("evaorbit:native-back-start", { cancelable: true }))));
  assert(await page.evaluate(() => !window.dispatchEvent(new Event("evaorbit:native-back", { cancelable: true }))));
  await mobileNav.waitFor();
  await floating.tap();
  await page.locator("[data-hermes-wallpaper]").waitFor();
  await appearanceButton.click();
  for (const label of ["Hermes 头像", "你的头像", "聊天背景"]) {
    await appearanceDialog.getByRole("button", { name: `恢复${label}`, exact: true }).click();
  }
  await page.locator("[data-hermes-wallpaper]").waitFor({ state: "detached" });

  await appearanceDialog.getByRole("button", { name: "关闭", exact: true }).click();
  await appearanceDialog.waitFor({ state: "detached" });
  const openPreview = async () => {
    await page.getByRole("button", { name: "历史对话", exact: true }).click();
    await history.getByRole("button", { name: "明天再整理", exact: true }).click();
    await history.waitFor({ state: "detached" });
  };
  await openPreview();
  await input.fill("普通草稿要跨刷新");
  await page.getByRole("button", { name: "新对话", exact: true }).click();
  assert.equal(await input.inputValue(), "", "a new conversation does not inherit the previous draft");
  await openPreview();
  assert.equal(await input.inputValue(), "普通草稿要跨刷新");
  const appendPreview = (content, fields = {}) => {
    const seq = ++sequence;
    const row = { ...previewMessage, id: `30000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
      seq, role: "assistant", content, ...fields };
    messages.push(row);
    return row;
  };
  for (let index = 1; index <= 20; index++) appendPreview(`历史消息 ${index}`);
  seen.set(previewConversation, sequence);
  pageSize = 12;
  await page.reload({ waitUntil: "networkidle" });
  await floating.tap();
  await openPreview();
  await page.getByText("历史消息 20", { exact: true }).waitFor();
  assert.equal(await input.inputValue(), "普通草稿要跨刷新");
  await appearanceButton.click();
  const covered = appendPreview("弹窗背后收到的回复");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByText(covered.content, { exact: true }).waitFor({ state: "attached" });
  assert((seen.get(previewConversation) ?? 0) < covered.seq, "a covered reply cannot be acknowledged before the appearance dialog closes");
  await Promise.all([page.waitForRequest(request => request.method() === "POST" && request.postDataJSON()?.seq === covered.seq),
    appearanceDialog.getByRole("button", { name: "关闭", exact: true }).click()]);
  await appearanceDialog.waitFor({ state: "detached" });
  const pane = page.locator("[data-hermes-message]").first().locator("../..");
  await pane.evaluate(element => { element.scrollTop = 0; });
  const olderButton = page.getByRole("button", { name: "更早的消息", exact: true });
  await olderButton.waitFor();
  const anchor = page.locator("[data-hermes-message]").first();
  const anchorId = await anchor.getAttribute("id");
  const anchorTop = (await anchor.boundingBox()).y;
  await olderButton.click();
  await page.getByText("历史消息 1", { exact: true }).waitFor();
  assert(Math.abs((await page.locator(`[id="${anchorId}"]`).boundingBox()).y - anchorTop) < 2, "loading earlier messages preserves the reading position");
  const longReply = heading => [heading, ...Array.from({ length: 25 }, (_, i) => `第 ${i + 1} 段测试正文。这条消息的长度超过一屏，用来核对回看时的阅读位置。`)].join("\n\n");
  const waitForReplyStart = row => page.waitForFunction(id => {
    const message = document.getElementById(`hermes-${id}`);
    const pane = message?.parentElement?.parentElement;
    const header = pane?.previousElementSibling;
    return header && Math.abs(message.getBoundingClientRect().top - header.getBoundingClientRect().bottom - 14) < 2;
  }, row.id);
  const newReply = appendPreview(longReply("翻看历史期间的新回复"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const jump = page.getByRole("button", { name: "有新消息", exact: true });
  await jump.waitFor();
  assert((seen.get(previewConversation) ?? 0) < newReply.seq);
  await jump.click();
  await jump.waitFor({ state: "detached" });
  await waitForReplyStart(newReply);
  assert((seen.get(previewConversation) ?? 0) < newReply.seq, "showing the start of a long reply does not acknowledge the unseen end");

  await pane.evaluate(element => { element.scrollTop = 120; });
  await page.getByRole("button", { name: "回到最新", exact: true }).waitFor();
  const savedScroll = await pane.evaluate(element => element.scrollTop);
  let releaseRead;
  delayedConversationRead = new Promise(resolve => { releaseRead = resolve; });
  try {
    await back.click();
    await mobileNav.waitFor();
    await page.evaluate(id => {
      window.__evaorbitPendingPath = `/ai?conversation=${id}`;
      window.dispatchEvent(new Event("evaorbit:open-path"));
    }, previewConversation);
    await page.getByText("历史消息 1", { exact: true }).waitFor({ state: "attached" });
    assert.equal(await pane.evaluate(element => element.scrollTop), savedScroll, "reopening restores the cached reading position before any network response");
  } finally {
    delayedConversationRead = undefined;
    releaseRead();
  }
  await page.getByRole("button", { name: "回到最新", exact: true }).click();
  await page.waitForFunction(id => {
    const row = document.getElementById(`hermes-${id}`);
    const pane = row?.parentElement?.parentElement;
    return pane && pane.scrollHeight - pane.clientHeight - pane.scrollTop < 2;
  }, newReply.id);
  const liveReply = appendPreview(longReply("当前对话收到的长回复"));
  const headerBefore = await back.boundingBox();
  const composerBefore = await input.boundingBox();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await waitForReplyStart(liveReply);
  assert.deepEqual(await back.boundingBox(), headerBefore, "scrolling to the reply leaves the header in place");
  assert.deepEqual(await input.boundingBox(), composerBefore, "scrolling to the reply leaves the composer in place");
  await page.getByRole("button", { name: "回到最新", exact: true }).click();
  await back.click();
  await mobileNav.waitFor();
  const barkReply = appendPreview(longReply("从通知回来看到的第一条未读回复"));
  appendPreview("从通知回来看到的第二条未读回复");
  await page.evaluate(id => {
    window.__evaorbitPendingPath = `/ai?conversation=${id}`;
    window.dispatchEvent(new Event("evaorbit:open-path"));
  }, previewConversation);
  await waitForReplyStart(barkReply);
  await page.getByRole("button", { name: "回到最新", exact: true }).click();
  failRead = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByRole("button", { name: "连接异常", exact: true }).waitFor();
  failRead = false;
  connection.lastSeenAt = new Date().toISOString();
  const activeWork = appendPreview("长任务", { role: "user", status: "processing" });
  activeWork.presentation = { toolActivity: { attemptId: activeWork.attempt_id, total: 36, running: 2, failed: 0,
    tools: [{ name: "search", count: 30 }, { name: "read_file", count: 4 }] } };
  await page.getByRole("button", { name: "重试连接", exact: true }).click();
  const toolActivity = page.getByRole("button", { name: /调用了 36 次工具/ });
  await toolActivity.waitFor();
  assert(await toolActivity.evaluate(button => !button.closest("article") && button.closest(".eo-disclosure").previousElementSibling?.matches('article[data-role="user"]')), "tool activity is a separate timeline row for its request");
  assert.equal(await toolActivity.getAttribute("aria-expanded"), "false");
  assert.match(await toolActivity.textContent(), /2 项执行中/);
  await toolActivity.click();
  const toolDetails = toolActivity.locator("../..");
  assert(await toolDetails.evaluate(section => [section, section.firstElementChild, section.querySelector(".eo-disclosure-body")].every(element => getComputedStyle(element).backgroundColor === "rgba(0, 0, 0, 0)")), "tool title and expanded details have no background");
  assert.deepEqual(await toolDetails.getByRole("listitem").allTextContents(), ["search×30", "read_file×4"]);
  await toolDetails.getByText("另有 2 次调用", { exact: true }).waitFor();
  const workingStatus = page.getByText("Hermes 正在处理", { exact: true });
  const toolBounds = await toolDetails.boundingBox();
  const workingBounds = await workingStatus.boundingBox();
  assert(workingBounds.y - toolBounds.y - toolBounds.height >= 12, "expanded tools leave a clear gap before the working status");
  activeWork.presentation.toolActivity = { ...activeWork.presentation.toolActivity, running: 0, failed: 1 };
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await toolActivity.getByText("1 项异常", { exact: true }).waitFor();
  assert.equal(await toolActivity.getAttribute("aria-expanded"), "true");
  const stop = page.getByRole("button", { name: "停止", exact: true });
  assert.equal(await stop.and(composerAction).count(), 1, "the send button becomes the stop button");
  const stopBounds = await stop.boundingBox();
  await stop.click();
  assert(await page.getByRole("button", { name: "已请求停止", exact: true }).isDisabled());
  assert.equal(sendWrites().at(-1).content, "/stop");
  assert.equal(sendWrites().at(-1).conversationId, previewConversation);
  assert.equal(await input.inputValue(), "普通草稿要跨刷新");
  activeWork.status = "interrupted";
  messages.find(message => message.id === sendWrites().at(-1).id).status = "done";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const resumedSend = page.getByRole("button", { name: "发送", exact: true });
  await resumedSend.waitFor();
  assert.deepEqual(await resumedSend.boundingBox(), stopBounds, "the action returns to Send in the same place");
  for (const saved of [true, false]) {
    await page.getByRole("button", { name: "新对话", exact: true }).click();
    assert.equal(await page.getByText("想到什么，直接说。", { exact: true }).evaluate(element => getComputedStyle(element).backgroundColor), "rgba(0, 0, 0, 0)");
    const content = saved ? "退到后台时云端已保存" : "退到后台时请求未送达";
    const sendButton = page.getByRole("button", { name: "发送", exact: true });
    const before = sendWrites().length;
    let release;
    interruptedSend = { saved, background: new Promise(resolve => { release = resolve; }) };
    await input.fill(content);
    await sendButton.click();
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    release();
    await page.locator("[data-hermes-chat]").getByText("正在确认送达…", { exact: true }).waitFor();
    const id = sendWrites().at(-1).id;
    const receiptRequest = page.waitForRequest(request => new URL(request.url()).searchParams.get("pending") === id);
    await page.evaluate(() => {
      Reflect.deleteProperty(document, "hidden");
      Reflect.deleteProperty(document, "visibilityState");
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("evaorbit:native-active"));
    });
    await receiptRequest;
    if (saved) {
      await page.locator(`[id="hermes-${id}"]`).getByText(content, { exact: true }).waitFor();
      await page.waitForFunction(() => document.querySelector("[data-hermes-chat] textarea")?.value === "");
      assert.equal(sendWrites().length, before + 1, "a recovered receipt never resends the message");
      assert.equal(await page.getByText("未确认送达，草稿已保留，可再次发送重试。", { exact: true }).count(), 0);
    } else {
      await page.getByText("未确认送达，草稿已保留，可再次发送重试。", { exact: true }).waitFor();
      assert.equal(await input.inputValue(), content);
      assert.equal(sendWrites().length, before + 1, "an unconfirmed delivery waits for a manual retry");
      await sendButton.click();
      await page.locator(`[id="hermes-${id}"]`).getByText(content, { exact: true }).waitFor();
      assert.equal(sendWrites().at(-1).id, id);
      assert.equal(messages.filter(message => message.id === id).length, 1);
    }
  }
  const userDraft = appendPreview("我发的第一段\n\n我发的第二段", { role: "user", presentation: {} });
  const segmented = appendPreview([
    "第一段保留[参考链接][guide]。", "这是第二段。", "### 步骤\n\n1. 保留列表\n2. 保留序号",
    "```js\nconst a = 1;\n\nconsole.log(a);\n```", "| 名称 | 值 |\n| --- | --- |\n| A | 1 |",
    "[guide]: https://example.invalid/guide",
  ].join("\n\n"), { presentation: {} });
  await openPreview();
  const segmentedRow = page.locator(`[id="hermes-${segmented.id}"]`);
  await segmentedRow.waitFor({ state: "attached" });
  const bubbles = segmentedRow.locator("[data-segment]");
  assert.equal(await bubbles.count(), 0, "reply segmentation starts off");
  await appearanceButton.click();
  const segmentSwitch = appearanceDialog.getByRole("switch", { name: "自动分段气泡", exact: true });
  await segmentSwitch.check();
  await appearanceDialog.getByRole("button", { name: "关闭", exact: true }).click();
  await appearanceDialog.waitFor({ state: "detached" });
  assert.equal(await bubbles.count(), 5);
  assert.equal(await bubbles.first().getByRole("link", { name: "参考链接" }).getAttribute("href"), "https://example.invalid/guide");
  assert.equal(await bubbles.nth(2).locator("h3 + ol > li").count(), 2, "a heading and its list stay together");
  assert.equal(await bubbles.nth(3).locator("pre code").textContent(), "const a = 1;\n\nconsole.log(a);");
  assert.equal(await bubbles.last().locator("table").count(), 1);
  assert(await bubbles.last().locator(".markdown-table-wrap").evaluate(table => table.scrollWidth <= table.clientWidth + 1), "a short table fits in its bubble");
  assert.equal(await bubbles.last().locator("[data-bubble-tail]").count(), 1);
  assert.equal(await page.locator(`[id="hermes-${userDraft.id}"] [data-segment]`).count(), 0);
  await page.locator("[data-hermes-chat] > header + div").evaluate(pane => { pane.scrollTop = pane.scrollHeight; });
  await page.screenshot({ path: "tmp/hermes-qa/segmented-mobile.png" });
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("[data-hermes-activity]").tap();
  await openPreview();
  await bubbles.last().waitFor({ state: "attached" });
  await appearanceButton.click();
  assert.equal(await segmentSwitch.isChecked(), true, "segmentation is restored after reload");
  await segmentSwitch.uncheck();
  await appearanceDialog.getByRole("button", { name: "关闭", exact: true }).click();
  await appearanceDialog.waitFor({ state: "detached" });
  assert.equal(await bubbles.count(), 0);
  assert.equal(await segmentedRow.locator(".markdown-content").count(), 1);
  assert.deepEqual(errors, []);console.log(JSON.stringify({ passed: true, screenshots: 10, writes: writes.length, errors }));
} finally { await context?.close();await browser?.close();await server.close(); }
