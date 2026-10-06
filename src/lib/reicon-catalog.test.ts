import assert from "node:assert/strict";
import test from "node:test";
import { reiconNames, reiconSvg } from "./reicon-catalog.ts";

test("installed Reicon catalog serves every icon without executing modules or accepting arbitrary paths", async () => {
  const names = await reiconNames();
  assert.ok(names.length > 2600);
  for (const name of ["Iphone", "Tv", "Gamepad", "Book"]) assert.ok(names.includes(name));
  for (const name of ["../Iphone", "../../package.json", "NotAnInstalledIcon", ""]) assert.equal(await reiconSvg(name), null);
  await Promise.all(names.map(async name => {
    const svg = await reiconSvg(name);
    assert.match(svg!, /^<svg.*viewBox="0 0 24 24"/);
    assert.doesNotMatch(svg!, /<script|onload=|javascript:|\$\{/i);
  }));
});
