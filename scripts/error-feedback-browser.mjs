import {navigateLocal} from "./local-navigation-browser.mjs";
import assert from "node:assert/strict";
import path from "node:path";
import { preview } from "vite";
const { chromium } = await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE || "playwright");
const server = await preview({ configFile: path.resolve("vite.trackers.config.ts"), preview: { host: "127.0.0.1", port: 4186, strictPort: true } });
let browser;
try {
  console.log(JSON.stringify({ serverPid: process.pid, port: 4186 }));
  browser = await chromium.launch({ channel: process.env.EVAORBIT_BROWSER_CHANNEL || "chrome", headless: true });
  for (const mobile of [true, false]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 402, height: 874 } : { width: 1440, height: 1000 }, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage(), errors = [];
    await context.addInitScript(() => { localStorage.setItem('evaorbit.uiLanguage','zh-CN'); localStorage.setItem('evaorbit.englishFont','zen'); });
    page.on("pageerror", error => errors.push(String(error)));
    // The shipped bundle intentionally blocks browser networking via CSP.
    // This exercises a real connection failure without contacting production.
    await page.goto("http://127.0.0.1:4186", { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "回到 EvaOrbit", exact: true }).waitFor();
    await page.locator('input[type="email"]').fill("preview@example.com");
    await page.locator('input[type="password"]').fill("unsent-draft");
    const submit = page.locator('#local-login button[type="submit"]'), banner = page.locator(".error-banner");
    await submit.click();
    await banner.waitFor();
    await banner.getByText("暂时无法连接登录服务，请检查网络后重试。", { exact: true }).waitFor();
    await page.waitForTimeout(2700);
    assert.equal(await banner.count(), 1, "errors must outlive success capsules");
    assert.equal(await banner.evaluate(el => el.inert || Boolean(el.closest("[inert]"))), false);
    const bounds = await banner.boundingBox();
    assert(bounds.y >= 0 && bounds.x >= 0 && bounds.x + bounds.width <= (mobile ? 402 : 1440));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `tmp/error-banner-${mobile ? "mobile" : "desktop"}.png`, fullPage: true });
    if (mobile) {
      const cdp = await context.newCDPSession(page);
      const x = bounds.x + 55, y = bounds.y + bounds.height - 5;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - 15 }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      assert.equal(await banner.count(), 1, "a small drag must not dismiss");
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - 55 }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else {
      await page.getByRole("button", { name: "收起错误提示" }).focus();
      await page.keyboard.press("Enter");
    }
    await banner.waitFor({ state: "detached" });
    assert.equal(await page.locator('input[type="email"]').inputValue(), "preview@example.com");
    assert.equal(await page.locator('input[type="password"]').inputValue(), "unsent-draft");
    assert.equal(await page.locator("#local-login").isVisible(), true, "dismissing feedback must retain the editor");
    await submit.click();
    await banner.waitFor();
    await page.getByRole("button", { name: "收起错误提示" }).click();
    await banner.waitFor({ state: "detached" });
    await page.getByRole("button", { name: "本机预览", exact: true }).click();
    await navigateLocal(page,"观测");
    await page.getByRole("button", { name: "新增观测", exact: true }).first().click();
    await page.locator('.form-sheet-layer[data-state="open"]').waitFor();
    await page.locator('.tracker-basic-fields input').first().fill("保留失败草稿");
    await page.evaluate(() => {
      const transaction = IDBDatabase.prototype.transaction;
      window.restoreTestStorage = () => { IDBDatabase.prototype.transaction = transaction; };
      IDBDatabase.prototype.transaction = function (...args) {
        if (args[1] === "readwrite") throw new DOMException("本机空间不足，请释放空间后重试。", "QuotaExceededError");
        return transaction.apply(this, args);
      };
    });
    const createSubmit = page.locator('button[form="tracker-create-form"]');
    await createSubmit.click();
    await banner.getByText("本机空间不足，请释放空间后重试。", { exact: true }).waitFor();
    await createSubmit.focus();
    await page.keyboard.press("Tab");
    assert.equal(await page.getByRole("button", { name: "收起错误提示" }).evaluate(el => el === document.activeElement), true, "modal focus trap must include feedback");
    await page.keyboard.press("Enter");
    await banner.waitFor({ state: "detached" });
    assert.equal(await page.locator('.tracker-basic-fields input').first().inputValue(), "保留失败草稿");
    await page.evaluate(() => window.restoreTestStorage());
    await createSubmit.click();
    await page.getByRole("heading", { name: "保留失败草稿", exact: true }).waitFor();
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log("PASS persistent errors, real touch swipe, keyboard dismissal inside modal, retry and preserved drafts on mobile and desktop");
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}
