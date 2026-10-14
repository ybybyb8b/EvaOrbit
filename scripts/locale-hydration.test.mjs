import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

test("copy bridge waits for a committed page and leaves streamed and personal text intact", () => {
  class Element {
    nodeType = 1; dataset = {}; attributes = new Map(); children = [];
    constructor(classes = "", parent = null, tag = "div") { this.classes = classes.split(" "); this.parentElement = parent; this.tag = tag; parent?.children.push(this); }
    matches(selector) { return selector.split(",").some(part => part.startsWith(".") ? this.classes.includes(part.slice(1)) : part === '[data-ui-copy-ready="true"]' ? this.dataset.uiCopyReady === "true" : this.tag === part); }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null; }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    setAttribute(name, value) { this.attributes.set(name, value); }
  }
  class Text {
    nodeType = 3;
    constructor(value, parent) { this.nodeValue = value; this.parentElement = parent; parent.children.push(this); }
  }
  const observers = [];
  class MutationObserver {
    constructor(callback) { this.callback = callback; this.active = true; observers.push(this); }
    observe() {} disconnect() { this.active = false; }
  }
  const body = new Element(), shell = new Element("app-shell", body), main = new Element("main-content", shell);
  const page = new Element("page", main), label = new Element("", page), text = new Text("Add Item", label);
  const personal = new Text("Add Item", new Element("user-content", page));
  const streamed = new Text("Add Item", new Element("", body));
  const sidebar = new Text("Add Item", new Element("sidebar", shell));
  const script = new Text("Add Item", new Element("", shell, "script"));
  const walk = node => (node.children ?? []).flatMap(child => [child, ...walk(child)]);
  const document = { body, head: new Element(), title: "EO", createTreeWalker: root => { const nodes = walk(root); return { nextNode: () => nodes.shift() ?? null }; } };
  const win = new EventTarget();
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync("src/lib/locale-runtime.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function("require", "module", "exports", "window", "document", "Element", "MutationObserver", "Node", "NodeFilter", code)(name => {
    if (name === "./locale") return { DEFAULT_UI_LANGUAGE: "zh-CN", normalizeUiLanguage: value => value };
    if (name === "./ui-copy") return { translateUiCopy: (value, language) => language === "zh-CN" && value === "Add Item" ? "新增条目" : value };
    throw Error(name);
  }, loaded, loaded.exports, win, document, Element, MutationObserver, { TEXT_NODE: 3 }, { SHOW_ELEMENT: 1, SHOW_TEXT: 4 });
  const cleanup = loaded.exports.installUiCopyBridge("zh-CN");
  assert.equal(text.nodeValue, "Add Item", "pending page is untouched");
  assert.equal(sidebar.nodeValue, "新增条目", "committed shell still translates");
  assert.equal(streamed.nodeValue, "Add Item", "streamed HTML outside the shell is untouched");
  assert.equal(script.nodeValue, "Add Item", "script payload is never rewritten");
  page.dataset.uiCopyReady = "true";
  win.dispatchEvent(new CustomEvent("evaorbit:ui-copy-ready", { detail: { root: page } }));
  assert.equal(text.nodeValue, "新增条目");
  assert.equal(personal.nodeValue, "Add Item");
  const nextPage = new Element("page", main), nextText = new Text("Add Item", nextPage);
  observers[0].callback([{ type: "childList", addedNodes: [nextPage] }]);
  assert.equal(nextText.nodeValue, "Add Item", "navigation also waits for the new page to commit");
  nextPage.dataset.uiCopyReady = "true";
  win.dispatchEvent(new CustomEvent("evaorbit:ui-copy-ready", { detail: { root: nextPage } }));
  assert.equal(nextText.nodeValue, "新增条目");
  cleanup();
  assert.ok(observers.every(observer => !observer.active));
});
