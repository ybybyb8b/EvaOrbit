import assert from "node:assert/strict";
import test from "node:test";
import { CHINESE_FONTS, ENGLISH_FONTS, normalizeChineseFont, normalizeEnglishFont } from "./font-preferences.ts";

test("font preferences expose only bundled choices", () => {
  assert.deepEqual(CHINESE_FONTS, ["canger", "lxgw", "alimama", "ibm"]);
  assert.deepEqual(ENGLISH_FONTS, ["zen", "ibm", "polyamine", "cormorant"]);
});

test("font preferences normalize invalid stored values", () => {
  assert.equal(normalizeChineseFont("lxgw"), "lxgw");
  assert.equal(normalizeChineseFont("unknown"), "canger");
  assert.equal(normalizeEnglishFont("polyamine"), "polyamine");
  assert.equal(normalizeEnglishFont(null), "zen");
});
