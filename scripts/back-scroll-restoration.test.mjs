import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

test("Back waits for asynchronous list height, preserves the departing position, and yields to user gestures", () => {
  const win = new EventTarget(), doc = new EventTarget(), hooks = [], effects = [], frames = new Map();
  let cursor = 0, frameId = 0, resize = () => {};
  Object.assign(win, { location: { origin: "https://eo.test", pathname: "/inbox", search: "" }, scrollY: 600, innerHeight: 874, scrollTo: ({ top }) => { win.scrollY = top; }, setTimeout: () => 1, clearTimeout: () => {} });
  Object.assign(doc, { body: {}, documentElement: { scrollHeight: 3000 }, closest: () => ({ origin: win.location.origin, pathname: "/projects", search: "", target: "" }) });
  const react = {
    useRef(initial) { return hooks[cursor++] ??= { current: initial }; },
    useState(initial) { const index = cursor++; const slot = hooks[index] ??= { value: initial }; return [slot.value, next => { slot.value = next; }]; },
    useEffect(effect, deps) { const index = cursor++, previous = hooks[index]; if (!previous || deps.some((value, i) => value !== previous.deps[i])) effects.push(() => { previous?.cleanup?.(); hooks[index] = { deps, cleanup: effect() }; }); },
  };
  const raf = callback => { const id = ++frameId; frames.set(id, callback); return id; };
  react.useLayoutEffect = react.useEffect;
  const cancel = id => frames.delete(id);
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); };
  class Observer { constructor(callback) { resize = callback; } observe() {} disconnect() {} }
  const code = ts.transpileModule(readFileSync("src/components/use-back-scroll-restoration.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const loaded = {};
  new Function("require", "exports", "window", "document", "ResizeObserver", "requestAnimationFrame", "cancelAnimationFrame", code)(() => react, loaded, win, doc, Observer, raf, cancel);
  const render = () => { cursor = 0; loaded.useBackScrollRestoration(win.location.pathname+win.location.search); effects.splice(0).forEach(effect => effect()); };
  const leave = () => {
    doc.dispatchEvent(new Event("click"));
    win.scrollY = 0; win.dispatchEvent(new Event("scroll")); // Next may scroll before its history update.
    win.location.pathname = "/projects"; render();
  };
  const back = () => {
    win.location.pathname = "/inbox"; doc.documentElement.scrollHeight = 900;
    win.dispatchEvent(new Event("popstate")); render(); flush();
  };
  try {
    render(); win.dispatchEvent(new Event("scroll")); leave(); back();
    assert.equal(win.scrollY, 0, "do not restore against a short placeholder");
    doc.documentElement.scrollHeight = 3000; resize(); flush();
    assert.equal(win.scrollY, 600, "restore only after the cached list has rendered");
    leave(); back(); win.dispatchEvent(new Event("touchstart"));
    doc.documentElement.scrollHeight = 3000; resize(); flush();
    assert.equal(win.scrollY, 0, "never fight a new user gesture");
    // Next may retain the departing scroll when its short loading page is already visible.
    win.scrollY=600;win.location.pathname="/food/places/12";render();flush();
    assert.equal(win.scrollY,0,"forward navigation to a Place starts at the top without relying on Next");
    win.scrollY=140;doc.documentElement.scrollHeight=5000;resize();flush();render();
    assert.equal(win.scrollY,140,"asynchronous content and rerenders must not reset a user's new scroll");
    win.location.search="?view=menu";render();
    assert.equal(win.scrollY,140,"same-page filters preserve scroll");
    win.location.hash="#history";win.location.pathname="/food/places/13";render();
    assert.equal(win.scrollY,140,"hash navigation is left to the browser/router");
    win.location.hash="";win.location.search="";
    win.scrollY=220;win.dispatchEvent(new Event("scroll"));
    win.location.pathname="/food/places/14";render();flush();assert.equal(win.scrollY,0);
    win.location.pathname="/food/places/13";win.dispatchEvent(new Event("popstate"));render();
    assert.equal(win.scrollY,0,"history positions are restored by the existing height-aware path");
    flush();assert.equal(win.scrollY,220,"Back retains the destination's saved position rather than resetting to top");
  } finally { hooks.forEach(hook => hook?.cleanup?.()); }
});
