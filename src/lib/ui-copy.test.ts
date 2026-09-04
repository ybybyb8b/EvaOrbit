import test from "node:test";
import assert from "node:assert/strict";
import { translateUiCopy } from "./ui-copy.ts";

test("UI copy translates in both directions", () => {
  assert.equal(translateUiCopy("新增记录", "en"), "Add record");
  assert.equal(translateUiCopy("Add record", "zh-CN"), "新增记录");
  assert.equal(translateUiCopy("Inbox", "zh-CN"), "散落");
  assert.equal(translateUiCopy("Projects", "zh-CN"), "工坊");
  assert.equal(translateUiCopy("Relations", "zh-CN"), "她们");
  assert.equal(translateUiCopy("Favorites", "zh-CN"), "驻点");
  assert.equal(translateUiCopy("All Spaces", "zh-CN"), "总览");
  assert.equal(translateUiCopy("咪子", "en"), "Cats");
  assert.equal(translateUiCopy("HOUSEHOLD CARE", "zh-CN"), "家庭护理");
  assert.equal(translateUiCopy("唤醒 Eva", "en"), "Wake Eva");
});

test("UI copy translates dynamic counts, dates and ratings", () => {
  assert.equal(translateUiCopy("0 条", "en"), "0 entries");
  assert.equal(translateUiCopy("3 days overdue", "zh-CN"), "逾期 3 天");
  assert.equal(translateUiCopy("Sep 4, 2026", "zh-CN"), "2026年9月4日");
  assert.equal(translateUiCopy("goat+", "zh-CN"), "传奇+");
});

test("UI copy preserves whitespace and unknown personal content", () => {
  assert.equal(translateUiCopy("  Save  ", "zh-CN"), "  保存  ");
  assert.equal(translateUiCopy("用户自己的标题", "en"), "用户自己的标题");
});
