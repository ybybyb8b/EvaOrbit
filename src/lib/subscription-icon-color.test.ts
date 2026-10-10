import test from "node:test";
import assert from "node:assert/strict";
import { representativeIconColor, subscriptionCardPalette, iconContrast } from "./subscription-icon-color.ts";

test("icon sampling ignores transparency and neutral backgrounds and is deterministic", () => {
  const pixels = [255,255,255,255, 0,0,0,255, 255,0,0,0, 210,40,55,255, 210,40,55,255, 30,90,200,255];
  assert.equal(representativeIconColor(pixels), "#d22837");
  assert.equal(representativeIconColor(pixels), representativeIconColor(pixels));
  assert.equal(representativeIconColor([0,0,0,255, 255,255,255,255]), null);
  assert.equal(representativeIconColor([210,40,55,0]), null);
});

test("brand tints keep main and auxiliary text readable on both gradient stops", () => {
  for (const surface of [[45,46,48], [255,254,249]] as [number,number,number][]) {
    for (const accent of [[250,36,60], [30,215,96], [255,255,0], [0,0,0]] as [number,number,number][]) {
      const palette = subscriptionCardPalette(accent, surface, surface, [100,100,100]);
      for (const ink of [palette.ink, palette.muted]) for (const stop of [palette.start, palette.end]) assert.ok(iconContrast(ink, stop) >= 4.5);
    }
  }
});
