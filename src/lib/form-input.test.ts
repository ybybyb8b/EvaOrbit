import test from "node:test";
import assert from "node:assert/strict";
import { matchInputValues, parseInputTags, uniqueInputValues } from "./form-input.ts";

test("suggestions retain original labels, remove empty and case duplicates, and search literally", () => {
  assert.deepEqual(uniqueInputValues([" Tea ", "tea", "", "茶"]), ["Tea", "茶"]);
  assert.deepEqual(matchInputValues(["Tea", "Coffee", "茶"], " TE "), ["Tea"]);
  assert.deepEqual(matchInputValues(["a[b", "ab"], "["), ["a[b"]);
});

test("tag input supports paste and Chinese separators without losing an uncommitted final tag", () => {
  assert.deepEqual(parseInputTags("生活，工作\n生活, Personal,personal, 本周"), ["生活", "工作", "Personal", "本周"]);
});
