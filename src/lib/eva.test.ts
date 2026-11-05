import assert from "node:assert/strict";
import test from "node:test";
import { EVA_PAPER_PROMPT, evaUsage, parseEvaResult, type EvaTask } from "./eva.ts";

const task: EvaTask = { title: "取快递", notes: "", dueDate: "2026-11-05", dueTime: null, remind: false, review: false, evidence: "明天取快递", dateEvidence: "明天", timeEvidence: "", reminderEvidence: "" };
test("paper validation preserves date-only records and refuses invented evidence or duplicate actions", () => {
  const input = { summary: "记下取快递", remaining: "", review: false, tasks: [task] };
  assert.equal(parseEvaResult(input, "明天取快递").tasks[0].dueTime, null);
  assert.throws(() => parseEvaResult({ ...input, tasks: [{ ...task, dueTime: "00:00" }] }, "明天取快递"), /Time evidence/);
  assert.throws(() => parseEvaResult({ ...input, tasks: [{ ...task, remind: true }] }, "明天取快递"), /Reminder evidence/);
  assert.throws(() => parseEvaResult({ ...input, tasks: [{ ...task, dueDate: "2026-02-30" }] }, "明天取快递"));
  assert.throws(() => parseEvaResult(input, "我只是吃了一顿饭"), /Task evidence/);
  assert.throws(() => parseEvaResult({ ...input, tasks: [task, task] }, "明天取快递"), /Duplicate/);
  assert(parseEvaResult({ ...input, review: true }, "明天取快递").tasks[0].review);
  assert(EVA_PAPER_PROMPT.length < 1800, "Stable prompt remains small; no full tool catalogue");
});
test("usage honors cache reporting and keeps missing billing data unknown", () => {
  const pricing = { model: "test", currency: "CNY" as const, input: 2, output: 8, cachedInput: 0.2, version: "v1" };
  const usage = evaUsage({ usage: { prompt_tokens: 1000, completion_tokens: 100, prompt_cache_hit_tokens: 800 } }, "test", pricing);
  assert.equal(usage.cached, 800); assert(Math.abs(usage.cost! - 0.00136) < 1e-10);
  assert.equal(evaUsage({ usage: { prompt_tokens: 1000, completion_tokens: 100 } }, "test", pricing).cost, null);
  assert.equal(evaUsage({}, "test", pricing).input, null);
  assert.equal(evaUsage({ usage: { prompt_tokens: 1000, completion_tokens: 100, prompt_tokens_details: { cached_tokens: 0 } } }, "other", pricing).cost, null);
});
