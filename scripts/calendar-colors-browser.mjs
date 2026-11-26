// Synthetic Native session and preference store, with no real Apple or cloud writes.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";
import { freeLocalPort, navigateLocal } from "./local-navigation-browser.mjs";
const { chromium } = await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE || "playwright");
const port = await freeLocalPort();
let server, browser;
try {
  server = await createServer({ configFile: path.resolve("vite.trackers.config.ts"), server: { port, strictPort: true } });
  await server.listen();
  console.log(JSON.stringify({ pid: process.pid, port }));
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 402, height: 874 } });
  await context.addInitScript(() => {
    localStorage.setItem("evaorbit.uiLanguage", "en");
    localStorage.setItem("evaorbit.trackerMode", "readonly");
    window.fixtureColor = "#65b59c";
    window.fixtureFail = false;
    window.fixturePreferences = null;
    window.fixtureRevision = 0;
    window.fixtureWrites = [];
    const accountId = "10000000-0000-4000-8000-000000000001";
    const source = () => ({ identifier: "sleep", title: "Sleep Calendar", sourceIdentifier: "cloud", sourceTitle: "iCloud", allowsContentModifications: true, ...(window.fixtureColor ? { color: window.fixtureColor } : {}) });
    const methods = ["native.invoke", "native.api", "eventkit.getStatus", "eventkit.requestAccess", "eventkit.fetch", "eventkit.save", "eventkit.delete"];
    window.EvaOrbitNative = { version: 1, call: async (method, params = {}) => {
      let result;
      if (method === "host.getInfo") result = { methods };
      else if (method === "trackers.getSession") result = { accountId, email: "fixture@example.invalid" };
      else if (method === "eventkit.getStatus") result = { available: true, installationId: "fixture", calendarPermission: "full_access", reminderPermission: "full_access", calendars: [source()], reminderLists: [] };
      else if (method === "healthkit.getStatus") result = { credentialConfigured: false, authorizationRequested: false };
      else if (method === "native.invoke" && params.method === "host.getInfo") result = { methods };
      else if (method === "native.api") {
        if (params.path !== "/api/preferences/eventkit") result = { status: 200, body: [] };
        else {
          if (params.method === "PUT") {
            if (window.fixtureFail) return { ok: true, result: { status: 503, body: { error: "Synthetic save failure" } } };
            const body = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(params.bodyBase64), c => c.charCodeAt(0))));
            assertRevision(body.revision);
            window.fixturePreferences = body.preferences;
            window.fixtureRevision++;
            window.fixtureWrites.push(body);
          }
          result = { status: 200, body: { available: true, userId: accountId, revision: window.fixtureRevision, preferences: window.fixturePreferences } };
        }
      } else if (method === "appearance.setPreference") result = null;
      else return { ok: false, error: { code: "fixture", message: "Not downloaded in fixture" } };
      return { ok: true, result };
    } };
    function assertRevision(revision) { if (revision !== window.fixtureRevision) throw Error("Revision mismatch"); }
  });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${port}`);
  await navigateLocal(page, "Settings");
  await page.getByRole("button", { name: /Apple Integration/ }).click();
  const section = page.locator(".eventkit-section");
  await section.getByText("Calendar sync settings", { exact: true }).click();
  const color = section.getByRole("combobox", { name: "Sleep Calendar timeline color" });
  await color.waitFor();
  await color.selectOption("#668675");
  await page.waitForFunction(() => window.fixturePreferences?.sources[0]?.colorOverride === "#668675");
  await color.waitFor({ state: "visible" });
  assert.equal(await color.inputValue(), "#668675");
  assert.equal(await page.evaluate(() => window.fixturePreferences.sources[0].mode), "off");
  assert.equal(await page.evaluate(() => window.fixturePreferences.sources[0].color), "#65b59c");
  await page.evaluate(() => { window.fixtureFail = true; });
  await color.selectOption("#a07886");
  await page.getByText("Could not complete this action.", { exact: true }).waitFor();
  assert.equal(await color.inputValue(), "#668675");
  await page.evaluate(() => { window.fixtureFail = false; });
  await color.selectOption("");
  await page.waitForFunction(() => !window.fixturePreferences.sources[0].colorOverride);
  assert.equal(await color.inputValue(), "");
  await page.evaluate(() => { window.fixtureColor = "#daa066"; window.dispatchEvent(new Event("evaorbit:native-active")); });
  await page.waitForFunction(() => window.fixturePreferences.sources[0].color === "#daa066");
  await page.evaluate(() => { window.fixtureColor = undefined; window.dispatchEvent(new Event("evaorbit:native-active")); });
  await color.selectOption("#8b819f");
  await page.waitForFunction(() => window.fixturePreferences.sources[0].colorOverride === "#8b819f");
  assert.equal(await page.evaluate(() => window.fixturePreferences.sources[0].color), "#daa066", "old Host preserves the last known Apple color");
  await fs.mkdir("tmp", { recursive: true });
  for (const width of [320, 402, 1280]) {
    await page.setViewportSize({ width, height: 874 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  await page.setViewportSize({ width: 402, height: 874 });
  await section.screenshot({ path: "tmp/calendar-source-colors.png", animations: "disabled" });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, checks: ["source selection", "failed save keeps the selected color", "follow Apple color", "Apple color refresh", "old Host fallback", "320/402/1280 layout"], cloudWrites: 0 }));
} finally {
  await browser?.close();
  await server?.close();
  const { createServer: probeServer } = await import("node:net");
  await new Promise((resolve, reject) => { const probe = probeServer(); probe.once("error", reject); probe.listen(port, "127.0.0.1", () => probe.close(resolve)); });
  console.log(JSON.stringify({ closedTestPort: port }));
}
