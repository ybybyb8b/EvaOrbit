import assert from "node:assert/strict";
import path from "node:path";
import { preview } from "vite";
import { freeLocalPort, navigateLocal } from "./local-navigation-browser.mjs";

const { chromium } = await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE || "playwright");
const port = await freeLocalPort();
const server = await preview({
  configFile: path.resolve("vite.trackers.config.ts"),
  build: { outDir: path.resolve(process.argv[2] ?? "ios/EvaOrbitHost/Resources/TrackerWeb") },
  preview: { host: "127.0.0.1", port, strictPort: true },
});
console.log(JSON.stringify({ serverPid: process.pid, port }));
let browser;
try {
  browser = await chromium.launch({ channel: process.env.EVAORBIT_BROWSER_CHANNEL || "chrome" });
  const page = await browser.newPage({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true });
  page.setDefaultTimeout(10_000);
  await page.addInitScript(() => localStorage.setItem("evaorbit.uiLanguage", "zh-CN"));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.getByRole("button", { name: "本机预览", exact: true }).click();
  await navigateLocal(page, "观测");
  for (const [name, group] of [["睡眠观察", "日常"], ["散步观察", "日常"], ["读书观察", "学习"]]) {
    await page.getByRole("button", { name: "新增观测", exact: true }).first().click();
    const inputs = page.locator("#tracker-create-form .tracker-basic-fields input");
    await inputs.nth(0).fill(name);
    await inputs.nth(1).fill(group);
    await page.locator('button[form="tracker-create-form"]').click();
    await page.getByRole("heading", { name, exact: true }).waitFor();
    await page.getByRole("button", { name: "返回上一页", exact: true }).click();
  }
  const cards = page.locator(".tracker-card h3");
  assert.deepEqual(await cards.allTextContents(), ["睡眠观察", "散步观察", "读书观察"]);
  await page.getByRole("button", { name: "排序", exact: true }).click();
  await page.getByRole("button", { name: "上移 学习", exact: true }).click();
  const grip = page.getByRole("button", { name: "拖动 散步观察", exact: true });
  await grip.scrollIntoViewIfNeeded();
  const handle = await grip.boundingBox();
  const target = page.locator(".tracker-sort-item").filter({ hasText: "睡眠观察" });
  const row = await target.boundingBox();
  const touch = await page.context().newCDPSession(page);
  const x = Math.round(handle.x + handle.width / 2);
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: Math.round(handle.y + handle.height / 2) }] });
  await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: Math.round(row.y + row.height / 2) }] });
  await page.locator(".tracker-sort-item[data-drop-target]").waitFor();
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.getByRole("button", { name: "保存顺序", exact: true }).click();
  await page.locator("#tracker-sort-form").waitFor({ state: "detached" });
  assert.deepEqual(await cards.allTextContents(), ["读书观察", "散步观察", "睡眠观察"]);
  await page.reload();
  await navigateLocal(page, "观测");
  await page.getByRole("link", { name: /读书观察/ }).waitFor();
  assert.deepEqual(await cards.allTextContents(), ["读书观察", "散步观察", "睡眠观察"]);
  console.log("PASS local Tracker group and item ordering, mobile layout, and reload persistence");
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}
