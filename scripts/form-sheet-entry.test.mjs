import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function fixture(mobile = true) {
  const hooks = [], effects = [], frames = new Map(), timers = new Map();
  let cursor = 0, nextId = 0, tree, focusCount = 0;
  class Element {
    style = { setProperty() {} };
    inert = false;
    contains(node) { return node === this; }
    getClientRects() { return [{}]; }
    focus(options) { assert.equal(options.preventScroll, true); doc.activeElement = this; focusCount++; }
  }
  const outside = new Element(), layer = new Element(), dialog = new Element(), body = new Element(), field = new Element();
  const doc = { activeElement: outside, body: { style: {}, children: [outside, layer] }, documentElement: { clientWidth: 402 } };
  dialog.contains = node => node === dialog || node === field;
  dialog.querySelector = () => null;
  dialog.querySelectorAll = () => [field];
  body.contains = node => node === field;
  body.scrollTop = 100;
  body.getBoundingClientRect = () => ({ top: 100, bottom: 500 });
  field.getBoundingClientRect = () => ({ top: 470, bottom: 510 });
  const win = new EventTarget();
  Object.assign(win, { innerWidth: 402, innerHeight: 874, visualViewport: undefined,
    matchMedia: query => ({ matches: query.includes("720px") && mobile }),
    requestAnimationFrame: callback => { const id = ++nextId; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout: callback => { const id = ++nextId; timers.set(id, callback); return id; }, clearTimeout: id => timers.delete(id),
  });
  const react = {
    useState(initial) { const index = cursor++; const slot = hooks[index] ??= { value: initial }; return [slot.value, value => { slot.value = value; }]; },
    useRef(initial) { return hooks[cursor++] ??= { current: initial }; }, useId: () => "sheet",
    useCallback(callback, deps) { const index = cursor++; if (!hooks[index]) hooks[index] = { callback, deps }; return hooks[index].callback; },
    useEffect(effect, deps) { const index = cursor++, previous = hooks[index]; if (!previous || deps.some((value, i) => value !== previous.deps[i])) effects.push(() => { previous?.cleanup?.(); hooks[index] = { deps, cleanup: effect() }; }); },
  };
  react.useLayoutEffect = react.useEffect;
  const jsx = (type, props) => ({ type, props });
  const require = name => name === "react" ? react : name === "react/jsx-runtime" ? { jsx, jsxs: jsx } : name === "react-dom" ? { createPortal: node => node } : name.includes("locale-controller") ? { useLocale: () => ({ language: "zh-CN" }) } : name.includes("ui-copy") ? { translateUiCopy: value => value } : { SheetSuggestionTarget: { Provider: "provider" } };
  const loaded = {};
  const code = ts.transpileModule(readFileSync("src/components/form-sheet.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("require", "exports", "window", "document", "HTMLElement", "HTMLInputElement", "Element", "getComputedStyle", code)(require, loaded, win, doc, Element, Element, Element, () => ({ scrollPaddingTop: "20px", scrollPaddingBottom: "60px" }));
  function nodes(node = tree) { return !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(child => nodes(child ?? null)) : [node, ...nodes(node.props?.children ?? null)]; }
  function render() {
    cursor = 0; tree = loaded.FormSheet({ title: "新增店铺", onClose() {}, children: null });
    for (const node of nodes()) {
      const target = node.props.className === "form-sheet-layer" ? layer : node.props.className === "form-sheet-panel" ? dialog : node.props.className === "form-sheet-body" ? body : null;
      if (target && node.props.ref) node.props.ref.current = target;
    }
    effects.splice(0).forEach(effect => effect());
  }
  function frame() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); render(); }
  return { render, frame, nodes, dialog, body, field, doc, loaded, frames, timers, focusCount: () => focusCount,
    transition() { const panel = nodes().find(node => node.props.className === "form-sheet-panel"); panel.props.onTransitionEnd({ target: dialog, currentTarget: dialog, propertyName: "transform" }); },
    unmount() { hooks.forEach(hook => hook?.cleanup?.()); },
  };
}

test("sheet paints its opening position before entering and waits for entry before focusing", () => {
  for (const mobile of [true, false]) {
    const f = fixture(mobile);
    try {
      f.render(); f.frame();
      assert.equal(f.nodes()[0].props["data-state"], "opening");
      assert.equal(f.nodes().find(node => node.props.className === "form-sheet-body").props.inert, true, "native autofocus must be blocked during entry");
      f.frame();
      assert.equal(f.nodes()[0].props["data-state"], "opening", "keep the first painted frame at the starting position");
      f.frame();
      assert.equal(f.nodes()[0].props["data-state"], "open");
      assert.equal(f.nodes().find(node => node.props.className === "form-sheet-body").props.inert, false);
      assert.equal(f.focusCount(), 0, "no focus while the panel is travelling");
      f.transition();
      assert.equal(f.doc.activeElement, mobile ? f.dialog : f.field);
      assert.equal(f.focusCount(), 1);
      [...f.timers.values()].forEach(callback => callback());
      assert.equal(f.focusCount(), 1, "fallback must not focus twice");
    } finally { f.unmount(); }
  }
});

test("entry fallback preserves a user's focus and unmount cancels queued work", () => {
  const f = fixture(false);
  f.render(); f.frame(); f.frame(); f.frame();
  f.doc.activeElement = f.field;
  [...f.timers.values()].forEach(callback => callback());
  assert.equal(f.focusCount(), 0);
  f.unmount();
  assert.equal(f.frames.size, 0); assert.equal(f.timers.size, 0);
  const cancelled = fixture();
  cancelled.render(); cancelled.frame(); cancelled.frame(); cancelled.unmount();
  assert.equal(cancelled.frames.size, 0, "cancel the second entry frame when closing early");
});

test("field visibility changes only the form body scroll position", () => {
  const f = fixture();
  f.field.scrollIntoView = () => { throw Error("must not scroll overlay or document ancestors"); };
  f.loaded.scrollFormSheetField(f.body, f.field);
  assert.equal(f.body.scrollTop, 170);
  f.field.getBoundingClientRect = () => ({ top: 140, bottom: 180 });
  f.loaded.scrollFormSheetField(f.body, f.field);
  assert.equal(f.body.scrollTop, 170, "already visible fields remain still");
  f.loaded.scrollFormSheetField(f.body, f.field, true);
  assert.equal(f.body.scrollTop, 190);
});
