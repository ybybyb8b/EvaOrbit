import assert from "node:assert/strict";
import test from "node:test";
import { parseTrainingPlanCompletion, parseTrainingPlanWrite, retainedTrainingDay, trainingDayDraft, trainingTemplate } from "./training-plan.ts";

test("training template reuses log fields, with no invented duration or video URL", () => {
  const template = trainingTemplate();
  const plan = parseTrainingPlanWrite({ ...template, expectedVersion: 0 });
  assert.equal(plan.days.length, 4);
  assert.deepEqual(plan.days.map(day => day.durationMinutes), [null, 25, null, null]);
  assert.ok(plan.days.every(day => day.videoUrls.length === 0));
  const draft = trainingDayDraft({ ...template, version: 1, updatedAt: "" });
  template.days[0].content = "changed";
  template.days[0].bodyParts.push("背");
  assert.equal(draft.notes, "Anna 手臂塑形视频 + 自主核心训练");
  assert.deepEqual(draft.bodyParts, ["手臂", "核心"]);
  assert.equal(draft.course, "Day 1｜上肢 + 核心");
});

test("reordering preserves current identity; removing it chooses next survivor, and empty has no current day", () => {
  const { days } = trainingTemplate();
  assert.equal(retainedTrainingDay(days, [...days].reverse(), "day-2"), "day-2");
  assert.equal(retainedTrainingDay(days, [days[0], days[2], days[3]], "day-2"), "day-3");
  assert.equal(retainedTrainingDay(days, [days[0], days[1]], "day-4"), "day-1");
  assert.equal(retainedTrainingDay(days, [], "day-2"), null);
  assert.equal(retainedTrainingDay([], [days[0]], null), "day-1");
});

test("plan boundaries reject invalid references, duplicate days, unsafe links and fractional duration", () => {
  const valid = { ...trainingTemplate(), expectedVersion: 0 };
  assert.throws(() => parseTrainingPlanWrite({ ...valid, currentDayId: "missing" }));
  assert.throws(() => parseTrainingPlanWrite({ ...valid, days: [], currentDayId: "day-1" }));
  assert.deepEqual(parseTrainingPlanWrite({ ...valid, days: [], currentDayId: null }).days, []);
  assert.throws(() => parseTrainingPlanWrite({ ...valid, days: [valid.days[0], valid.days[0]] }));
  for (const videoUrls of [["javascript:alert(1)"], ["data:text/html,test"], ["not-a-url"], Array(9).fill("https://example.com")]) {
    assert.throws(() => parseTrainingPlanWrite({ ...valid, days: [{ ...valid.days[0], videoUrls }] }));
  }
  assert.throws(() => parseTrainingPlanWrite({ ...valid, days: [{ ...valid.days[0], durationMinutes: 1.5 }] }));
  const withLinks = parseTrainingPlanWrite({ ...valid, days: [{ ...valid.days[0], videoUrls: ["https://example.com/a", "https://example.com/b"] }] });
  assert.equal(trainingDayDraft({ ...withLinks, version: 1, updatedAt: "" }).notes.split("\n").length, 3);
  assert.throws(() => parseTrainingPlanCompletion({ expectedVersion: 1, dayId: "day-1", requestKey: "invalid", log: {} }));
});
