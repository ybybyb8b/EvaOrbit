import assert from "node:assert/strict";
import test from "node:test";
import { isBilibiliVideoUrl, resolveTrainingVideo, trainingVideoInput } from "./training-video.ts";
import { parseTrainingPlanWrite, trainingDayDraft, trainingTemplate } from "./training-plan.ts";
import { parseTrainingSessionDetails } from "./validation.ts";

test("share text, safe redirects, part titles and snapshots work without changing old links", async () => {
  const url = "https://www.bilibili.com/video/BV17x411w7KC/?p=2";
  assert.deepEqual(trainingVideoInput(`【训练视频-哔哩哔哩】 ${url}&share_source=copy`), { url, title: "训练视频" });
  assert.equal(trainingVideoInput("https://example.com/video?a=1").url, "https://example.com/video?a=1");
  for (const value of ["https://b23.tv.evil.com/abc", "https://user@b23.tv/abc", "https://b23.tv:444/abc", "http://127.0.0.1/a", "https://www.bilibili.com/other"]) assert.equal(isBilibiliVideoUrl(value), false);
  const calls: string[] = [];
  const request: typeof fetch = async input => {
    calls.push(String(input));
    return calls.length === 1 ? new Response(null, { status: 302, headers: { location: url } }) : Response.json({ code: 0, data: { bvid: "BV17x411w7KC", title: "核心训练", pages: [{ page: 2, part: "拉伸" }] } });
  };
  assert.deepEqual(await resolveTrainingVideo("https://b23.tv/abc", request), { url, title: "核心训练 · P2 拉伸" });
  assert.equal(calls.length, 2);
  let redirects = 0;
  await assert.rejects(resolveTrainingVideo("https://b23.tv/abc", async () => { redirects++; return new Response(null, { status: 302, headers: { location: "https://127.0.0.1/private" } }); }));
  assert.equal(redirects, 1);
  await assert.rejects(resolveTrainingVideo(url, async () => Response.json({ code: -412 })));

  const template = trainingTemplate();
  template.days[0].videoUrls = [url];
  template.days[0].videoTitles = { [url]: "核心训练", unused: "discard" };
  const plan = parseTrainingPlanWrite({ ...template, expectedVersion: 0 });
  assert.deepEqual(plan.days[0].videoTitles, { [url]: "核心训练" });
  const draft = trainingDayDraft({ ...plan, version: 1, updatedAt: "" });
  assert.equal(parseTrainingSessionDetails(draft.sessionDetails)?.videos[0].title, "核心训练");
  template.days[0].videoTitles[url] = "later";
  assert.equal(draft.sessionDetails.videos[0].title, "核心训练");
  assert.equal(parseTrainingSessionDetails({ plan: null, exercises: [], videos: [{ url, completed: false }] })?.videos[0].title, undefined);
});
