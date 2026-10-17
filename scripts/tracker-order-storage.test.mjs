import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { readTrackerOrder } from "../src/lib/tracker-order.ts";

test("Tracker sorting persists per account, tolerates corrupt data and surfaces blocked storage", () => {
  const stored = new Map(), win = new EventTarget(), exports = {};
  let blocked = false;
  const storage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => { if (blocked) throw Error("Blocked"); stored.set(key, value); } };
  const react = { useSyncExternalStore: (_, read) => read() };
  const source = ts.transpileModule(readFileSync("src/app/trackers/tracker-sort-sheet.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("require", "exports", "window", "localStorage", source)(name => name === "react" ? react : name.includes("tracker-order") ? { readTrackerOrder } : {}, exports, win, storage);
  const saved = { groups: ["Daily"], entries: [2, 1] };
  exports.useTrackerOrder("alice")[1](saved);
  assert.deepEqual(exports.useTrackerOrder("alice")[0], saved);
  assert.deepEqual(exports.useTrackerOrder("bob")[0], { groups: [], entries: [] });
  assert.deepEqual(exports.useTrackerOrder(null)[0], { groups: [], entries: [] });
  assert.throws(() => exports.useTrackerOrder(null)[1](saved), /Missing account/);
  stored.set("eo:tracker-order:alice", "corrupt");
  assert.deepEqual(exports.useTrackerOrder("alice")[0], { groups: [], entries: [] });
  exports.useTrackerOrder("alice")[1](saved);
  blocked = true;
  assert.throws(() => exports.useTrackerOrder("alice")[1]({ groups: [], entries: [] }), /Blocked/);
  assert.deepEqual(exports.useTrackerOrder("alice")[0], saved);
});
