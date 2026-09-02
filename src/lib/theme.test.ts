import assert from "node:assert/strict";
import test from "node:test";
import {
  APPEARANCE_MODES,
  COLOR_THEMES,
  normalizeAppearanceMode,
  normalizeColorTheme,
} from "./theme.ts";

test("appearance preferences expose the supported values", () => {
  assert.deepEqual(APPEARANCE_MODES, ["system", "light", "dark"]);
  assert.deepEqual(COLOR_THEMES, ["editorial", "rosewood"]);
});

test("appearance preference normalization preserves known values", () => {
  for (const mode of APPEARANCE_MODES) assert.equal(normalizeAppearanceMode(mode), mode);
  for (const theme of COLOR_THEMES) assert.equal(normalizeColorTheme(theme), theme);
});

test("appearance preference normalization falls back safely", () => {
  assert.equal(normalizeAppearanceMode("sepia"), "system");
  assert.equal(normalizeAppearanceMode(null), "system");
  assert.equal(normalizeColorTheme("unknown"), "editorial");
  assert.equal(normalizeColorTheme(undefined), "editorial");
});
