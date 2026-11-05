// Real bundled UI with a synthetic account; no cloud, Apple writes or notifications.
import assert from "node:assert/strict";
import path from "node:path";
import { createServer } from "vite";
import { freeLocalPort, navigateLocal } from "./local-navigation-browser.mjs";
const { chromium } = await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE || "playwright");
const port = await freeLocalPort();
const server = await createServer({ configFile: path.resolve("vite.trackers.config.ts"), server: { host: "127.0.0.1", port, strictPort: true } });
let browser;
try {
  await server.listen();
  console.log(JSON.stringify({ pid: process.pid, port, synthetic: true }));
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true });
  await context.addInitScript(() => { localStorage.setItem("evaorbit.uiLanguage", "en"); });
  const accountId = "10000000-0000-4000-8000-000000000099";
  await context.route("**/eo-api/**", route => {
    assert.equal(route.request().method(), "GET");
    return route.fulfill({ json: new URL(route.request().url()).pathname === "/eo-api/session"
      ? { authenticated: true, accountId, email: "fixture@example.invalid", settingsConfigurationProtocol: 1 } : [] });
  });
  await context.route("**/api/**", route => route.abort());
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}`, { waitUntil: "networkidle" });
  await page.evaluate(async accountId => {
    const db = await new Promise(resolve => { const r = indexedDB.open("eo-tracker-local-v1", 1); r.onsuccess = () => resolve(r.result); });
    await new Promise((resolve, reject) => { const tx = db.transaction("session", "readwrite"); tx.objectStore("session").put({ accountId, email: "fixture@example.invalid" }, "current"); tx.oncomplete = resolve; tx.onerror = reject; });
    db.close();
  }, accountId);
  await page.addInitScript(() => { window.__evaorbitPendingPath = "/settings/notifications?reminderId=42"; });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Notifications", exact: true, level: 1 }).waitFor();
  assert.equal(await page.evaluate(() => window.__evaorbitPendingPath), undefined);
  await navigateLocal(page, "Settings");
  await page.getByRole("heading", { name: "Settings", exact: true, level: 1 }).waitFor();
  await page.evaluate(() => { window.__evaorbitPendingPath = "/settings/notifications?reminderId=99#history"; window.dispatchEvent(new Event("evaorbit:open-path")); });
  await page.getByRole("heading", { name: "Notifications", exact: true, level: 1 }).waitFor();
  assert.equal(await page.evaluate(() => window.__evaorbitPendingPath), undefined);
  assert.equal(new URL(page.url()).hostname, "127.0.0.1");
  console.log("Native cold-start and foreground routes stay in the bundled UI and consume once");
} finally {
  await browser?.close();
  await server.close();
}
