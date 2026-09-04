import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_UI_LANGUAGE, UI_LANGUAGES, normalizeUiLanguage } from "./locale.ts";

test("UI language preferences expose the supported values", () => {
  assert.deepEqual(UI_LANGUAGES, ["zh-CN", "en"]);
  assert.equal(DEFAULT_UI_LANGUAGE, "zh-CN");
});

test("UI language normalization preserves known values and falls back safely", () => {
  for (const language of UI_LANGUAGES) assert.equal(normalizeUiLanguage(language), language);
  assert.equal(normalizeUiLanguage("fr"), "zh-CN");
  assert.equal(normalizeUiLanguage(null), "zh-CN");
});
