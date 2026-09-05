import assert from "node:assert/strict";
import fs from "node:fs";
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

test("Lucius profile text participates in the shared font preferences", () => {
  const css = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.lucius-profile-page\s*\{[\s\S]*?font-family:var\(--font-ui\);/);
  assert.match(css, /\.lucius-profile-bio\s*\{[^}]*font:[^;}]*var\(--font-ui\)/);
  assert.match(css, /\.lucius-post p\s*\{[^}]*font:[^;}]*var\(--font-ui\)/);
  assert.match(css, /\.lucius-profile-list > a > p\s*\{[^}]*font:[^;}]*var\(--font-ui\)/);
});
