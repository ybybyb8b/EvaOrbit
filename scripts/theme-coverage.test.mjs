import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

test("Memory Graph reads theme tokens and updates its canvas when only the colorway changes", () => {
  const effects = [], observers = [];
  let styles, reference = 0;
  const tokens = { "--text-primary": "#47394b", "--surface-raised": "#fffdf8", "--accent-primary": "#47394b", "--text-tertiary": "#605265", "--surface-accent-soft": "#e6e1e9", "--accent-strong": "#382c3c" };
  const cy = { on() {}, resize() {}, destroy() {}, style(value) { styles = value; } };
  const imports = {
    cytoscape: { __esModule: true, default: options => { styles = options.style; return cy; } },
    react: { useRef: value => ({ current: reference++ === 0 ? {} : value }), useEffect: callback => effects.push(callback), useEffectEvent: callback => callback },
    "react/jsx-runtime": { jsx: () => null, jsxs: () => null },
    "@/components/icons": { Icon: () => null },
    "../echo-entries": { GraphIcon: () => null },
    "./graph.module.css": { default: {} },
  };
  class Observer {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(element, options) { this.options = options; }
    disconnect() {}
  }
  const loaded = {};
  const code = ts.transpileModule(readFileSync("src/app/memo/graph/graph-canvas.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("require", "exports", "getComputedStyle", "document", "MutationObserver", "ResizeObserver", code)(
    name => { assert(name in imports, name); return imports[name]; }, loaded,
    () => ({ getPropertyValue: name => tokens[name] }), { documentElement: {} }, Observer, Observer,
  );
  loaded.GraphCanvas({ graph: { nodes: [], edges: [] }, resetVersion: 0 });
  const cleanup = effects[0]();
  const nodeStyle = () => styles.find(item => item.selector === "node").style;
  assert.equal(nodeStyle().color, "#47394b");
  assert.equal(nodeStyle()["text-background-color"], "#fffdf8");
  const oldHub = styles.find(item => item.selector === "node.hub").style["background-image"];
  const themeObserver = observers.find(observer => observer.options?.attributeFilter);
  assert(themeObserver.options.attributeFilter.includes("data-vintage-colorway"));
  Object.assign(tokens, { "--text-primary": "#29252b", "--surface-raised": "#ffffff", "--accent-primary": "#5f3e54" });
  themeObserver.callback();
  assert.equal(nodeStyle().color, "#29252b");
  assert.equal(nodeStyle()["text-background-color"], "#ffffff");
  assert.notEqual(styles.find(item => item.selector === "node.hub").style["background-image"], oldHub);
  cleanup();
});
