import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function fixture(file) {
  let scope = "alice", cursor = 0;
  const slots = [], storage = new Map(), win = new EventTarget();
  win.location = { pathname: "/memo", search: "" };
  const react = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial; return [slots[index], next => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }]; },
    useCallback(callback) { return callback; },
    useSyncExternalStore(_, read) { return read(); },
  };
  const session = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), get length() { return storage.size; }, key: index => [...storage.keys()][index], removeItem: key => storage.delete(key) };
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function("require", "exports", "window", "sessionStorage", code)(name => name === "react" ? react : { clientCacheScope: () => scope }, exports, win, session);
  return { exports, react, storage, win, account: value => { scope = value; }, render: action => { cursor = 0; return action(); } };
}

test("remembered filters restore by account, route and query; functional setters and logout cleanup remain safe", () => {
  const f = fixture("src/components/use-remembered-state.ts");
  const render = () => f.render(() => f.exports.useRememberedState("test-search", ""));
  let [value, set] = render(); assert.equal(value, "");
  set("saved query"); assert.equal(render()[0], "saved query");
  render()[1](previous => previous + "!"); assert.equal(render()[0], "saved query!");
  f.account("bob"); assert.equal(render()[0], "");
  render()[1]("Bob query"); f.account("alice"); assert.equal(render()[0], "saved query!");
  f.win.location.search = "?tag=explicit"; assert.equal(render()[0], "");
  f.win.location.pathname = "/projects"; assert.equal(render()[0], "");
  f.exports.clearRememberedViews(); assert.equal(f.storage.size, 0);
  f.win.location.pathname = "/memo"; f.win.location.search = ""; assert.equal(render()[0], "");
});

test("server refresh updates records without resetting drafts, and filtered data can reject an unfiltered server seed", () => {
  const f = fixture("src/components/use-data-refresh.ts");
  const render = (initial, accept = true) => f.render(() => ({ data: f.exports.useServerDataState(initial, accept), draft: f.react.useState("") }));
  const initial = [{ id: 1 }], updated = [{ id: 1 }, { id: 2 }];
  let view = render(initial); view.draft[1]("unsaved");
  render(updated); view = render(updated);
  assert.deepEqual(view.data[0], updated); assert.equal(view.draft[0], "unsaved");
  view.data[1]([{ id: 2 }]); const newer = [{ id: 3 }];
  render(newer, false); view = render(newer, false);
  assert.deepEqual(view.data[0], [{ id: 2 }]); assert.equal(view.draft[0], "unsaved");
});
