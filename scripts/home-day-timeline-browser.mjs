import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";
import { buildCalendarTimelineEvents } from "../src/lib/calendar-timeline.ts";
import { dateRange } from "../src/lib/time.ts";
import { freeLocalPort } from "./local-navigation-browser.mjs";

const { chromium } = await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE || "playwright");
const output = process.argv[2] ?? "tmp/home-day-timeline.png";
const accountId = "10000000-0000-4000-8000-000000000001";
const date = "2026-11-25", previous = "2026-11-24", earlier = "2026-11-23";
const at = (time, day = date) => new Date(`${day}T${time}+08:00`).toISOString();
const capturedAt = at("13:30");

function record(id, sourceType, title, occurredAt, endAt = null, hasExplicitTime = true, detail = "", metadata = {}) {
  return { id: `${sourceType}:${id}`, sourceId: id, eventType: `${sourceType}.record`, sourceType, title, occurredAt,
    endAt, hasExplicitTime, detail, href: `/${sourceType}`, metadata, relatedPeople: [], relatedPets: [] };
}

function calendar(id, title, startAt, endAt, isAllDay = false) {
  return { id, title, startAt, endAt, isAllDay, status: "confirmed", timezone: "Asia/Shanghai", notes: "", location: "", createdAt: capturedAt, updatedAt: capturedAt };
}

const days = {
  [date]: [
    ...buildCalendarTimelineEvents([
      calendar(1, "图书馆还书日", date, "2026-11-26", true),
      calendar(2, "写作 · 上午专注", at("09:30"), at("11:00")),
    ], dateRange(date)),
    record(3, "cat", "给小满梳毛", at("12:00"), null, false),
    record(4, "food", "早餐", at("08:45"), null, true, "鸡蛋吐司"),
    record(5, "tracker", "晨间播放列表", at("10:05"), at("10:55")),
    record(6, "drink", "热拿铁", at("10:40:05")),
    record(7, "health", "站起来伸展", at("10:40:41")),
    record(8, "food", "午餐", at("12:30"), at("13:00"), false, "鳗鱼饭", {
      calendarMeal: { startAt: at("12:30"), endAt: at("13:00") },
    }),
  ],
  [previous]: [
    ...buildCalendarTimelineEvents([
      calendar(9, "跨夜阅读", at("23:25", earlier), at("00:35", previous)),
      calendar(10, "整理相册", at("01:00", previous), at("01:05", previous)),
    ], dateRange(previous)),
    record(11, "tracker", "喝水", at("01:05", previous)),
    record(16, "health", "记下今天的心情", at("01:05", previous)),
  ],
  [earlier]: Array.from({ length: 4 }, (_, index) => record(index + 12, "cat", `无时刻记录 ${index + 1}`, at("12:00", earlier), null, false)),
};

const port = await freeLocalPort();
let server, browser;
try {
  server = await createServer({ configFile: path.resolve("vite.trackers.config.ts"), server: { port, strictPort: true } });
  await server.listen();
  console.log(JSON.stringify({ pid: process.pid, port }));
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await context.addInitScript(() => {
    localStorage.setItem("evaorbit.uiLanguage", "zh");
    localStorage.setItem("evaorbit.appearanceMode", "light");
    localStorage.setItem("evaorbit.trackerMode", "readonly");
  });
  await context.route("**/eo-api/**", route => {
    const request = route.request();
    assert.equal(request.method(), "GET");
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/eo-api/session") return route.fulfill({ json: { authenticated: true, accountId, email: "timeline-preview@example.invalid" } });
    const match = /^\/eo-api\/home-readonly\/(day|month|due)\/([^/]+)$/.exec(pathname);
    if (!match) return route.fulfill({ status: 404, json: { error: "Fixture only" } });
    const [, kind, key] = match;
    const data = kind === "due" ? [] : kind === "month" ? { month: key, days: {}, periods: [] } : {
      date: key, events: days[key] ?? [], tasks: [], meals: [], journal: [], sleep: null, activities: [], activityRecords: [], calendarInterpretation: { categories: [], rules: [] },
    };
    return route.fulfill({ json: { format: "eo-home-readonly-v1", accountId, kind, key, capturedAt, data } });
  });

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  await page.clock.setFixedTime(new Date(capturedAt));
  await page.goto(`http://127.0.0.1:${port}`);
  await page.evaluate(async accountId => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("eo-tracker-local-v1", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("session", "readwrite");
      transaction.objectStore("session").put({ accountId, email: "timeline-preview@example.invalid" }, "current");
      transaction.oncomplete = resolve;
      transaction.onerror = reject;
    });
    db.close();
  }, accountId);
  await page.reload();
  const timeline = page.locator(".home-day-timeline");
  const ticks = timeline.locator('[class*="timeTick"]');
  const bands = timeline.locator('[data-interval]');
  const dots = timeline.locator('[class*="timeDot"]');
  const coffee = timeline.getByRole("link", { name: /热拿铁/ });
  const stretch = timeline.getByRole("link", { name: /站起来伸展/ });
  await coffee.waitFor();
  const coffeeBox = await coffee.boundingBox(), stretchBox = await stretch.boundingBox();
  assert.equal(coffeeBox.y, stretchBox.y, "simultaneous records align vertically");
  assert(coffeeBox.x + coffeeBox.width < stretchBox.x || stretchBox.x + stretchBox.width < coffeeBox.x, "two records get independent targets on opposite sides");
  assert.equal(await timeline.getByText("全天", { exact: true }).count(), 1);
  assert.equal(await timeline.getByText("仅日期", { exact: true }).count(), 1);
  const untimedRows = timeline.locator('[class*="untimedList"] > li');
  const mixedRows = await Promise.all((await untimedRows.all()).map(row => row.boundingBox()));
  assert.equal(mixedRows[0].x, mixedRows[1].x);
  assert(mixedRows[1].y >= mixedRows[0].y + mixedRows[0].height);
  assert.equal(await dots.count(), 2, "same-minute point records share a mark");
  await timeline.getByText("间隔 90 分钟", { exact: true }).waitFor();
  const boxes = async locator => Promise.all((await locator.all()).map(item => item.boundingBox()));
  const points = await boxes(dots);
  const writing = await boxes(timeline.locator(`[data-interval="calendar:2:${date}"]`));
  const playlist = await timeline.locator('[data-interval="tracker:5"]').boundingBox();
  const lunch = await timeline.locator('[data-interval="food:8"]').boundingBox();
  const hour = (points[1].y - points[0].y) * 60 / 115;
  assert.equal(await ticks.count(), 0, "axis has no ruler ticks");
  assert(Math.abs(writing.reduce((total, band) => total + band.height, 0) - hour * 1.5) < .1);
  assert(Math.abs(playlist.height - hour * 50 / 60) < .1);
  assert(Math.abs(lunch.height - hour / 2) < .1, "Calendar-resolved meal colors the axis");
  const writingEnd = Math.max(...writing.map(band => band.y + band.height));
  assert(Math.abs(lunch.y - writingEnd - 62) < 1, "long empty interval is compressed and labeled");
  assert.equal(writing[1].y, playlist.y);
  assert.equal(playlist.x, writing[1].x);
  assert.equal(playlist.width, writing[1].width);
  assert.equal(await timeline.locator('[data-interval="tracker:5"]').getAttribute("data-overlap"), "true");

  await page.evaluate(() => document.fonts.ready);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await timeline.screenshot({ path: output, animations: "disabled", style: ".mobile-global-header, .mobile-nav, [data-parlor-activity], .home-quick-log-trigger { visibility: hidden !important; }" });
  await page.locator("html").evaluate(element => { element.dataset.mode = "dark"; });
  await timeline.screenshot({ path: output.replace(/\.png$/, "-dark.png"), animations: "disabled", style: ".mobile-global-header, .mobile-nav, [data-parlor-activity], .home-quick-log-trigger { visibility: hidden !important; }" });
  await page.locator("html").evaluate(element => { element.dataset.mode = "light"; });
  await timeline.locator('[class*="timePlot"]').evaluate(element => { element.dataset.overlapStyle = "blend"; });
  await timeline.screenshot({ path: output.replace(/\.png$/, "-blend.png"), animations: "disabled", style: ".mobile-global-header, .mobile-nav, [data-parlor-activity], .home-quick-log-trigger { visibility: hidden !important; }" });
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 874 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  await page.setViewportSize({ width: 402, height: 874 });
  await page.getByRole("button", { name: new RegExp(`^${previous}`) }).click();
  await timeline.getByRole("button", { name: /跨夜阅读/ }).waitFor();
  assert.match(await timeline.getByRole("button", { name: /跨夜阅读/ }).innerText(), /前一日 23:25/);
  const midnight = await timeline.locator('[class*="timeRuler"]').boundingBox();
  const overnight = await bands.first().boundingBox();
  assert(Math.abs(midnight.y + hour / 4 - overnight.y) < 1);
  assert(Math.abs(overnight.height - hour * 35 / 60) < .1);
  await timeline.getByRole("button", { name: /01:00 \/ 01:05/ }).click();
  const nearby = page.getByRole("dialog", { name: "01:00 / 01:05 · 3 条记录" });
  await nearby.getByRole("button", { name: /整理相册/ }).click();
  const calendarDetail = page.getByRole("dialog", { name: "日历事项" });
  await calendarDetail.getByRole("heading", { name: "整理相册" }).waitFor();
  await calendarDetail.locator(".form-sheet-header button").click();
  await calendarDetail.waitFor({ state: "detached" });

  await page.getByRole("button", { name: new RegExp(`^${earlier}`) }).click();
  await timeline.getByRole("button", { name: "再显示 1 条" }).click();
  await timeline.getByRole("link", { name: /无时刻记录 4/ }).waitFor();
  assert.equal(await timeline.getByText("全天", { exact: true }).count(), 0);
  assert.equal(await timeline.getByText("仅日期", { exact: true }).count(), 4);
  assert.equal(await ticks.count(), 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ screenshot: path.resolve(output), widths: [320, 402, 1280], proportional: true, simultaneous: true, crossMidnight: true, dateOnly: true }));
} finally {
  await browser?.close();
  await server?.close();
  const { createServer: probeServer } = await import("node:net");
  await new Promise((resolve, reject) => {
    const probe = probeServer();
    probe.once("error", reject);
    probe.listen(port, "127.0.0.1", () => probe.close(error => error ? reject(error) : resolve()));
  });
  console.log(JSON.stringify({ closedTestPort: port }));
}
