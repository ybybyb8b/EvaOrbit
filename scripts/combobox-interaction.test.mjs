import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// Exercise the shipped event handlers with controlled hook state, without a DOM dependency.
function harness(file, exportName, initialProps) {
  const slots = []; let cursor = 0; let tree; let props = initialProps;
  const jsx = (type, props) => ({ type, props });
  const react = {
    createContext: value => ({ value }), useContext: context => context.value,
    useId: () => "test-list", useEffect: () => {},
    useRef: value => { const index = cursor++; return slots[index] ??= { current: value }; },
    useState: value => { const index = cursor++; if (!(index in slots)) slots[index] = value; return [slots[index], next => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }]; },
  };
  const modules = new Map();
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const loaded = { exports: {} };
    const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const require = name => {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
      if (name === "react-dom") return { createPortal: node => node };
      if (name.endsWith("locale-controller")) return { useLocale: () => ({ english: false }) };
      if (name.endsWith("select-dropdown")) return { SelectDropdown: "dropdown" };
      if (name.endsWith("suggested-input")) return { SuggestedInput: "suggested-input" };
      if (name.startsWith("@/lib/")) return load(`src/lib/${name.slice(6)}.ts`);
      throw Error(`Unexpected import ${name}`);
    };
    new Function("require", "module", "exports", "document", code)(require, loaded, loaded.exports, { activeElement: null });
    modules.set(file, loaded.exports); return loaded.exports;
  }
  const component = load(file)[exportName];
  function nodes(node = tree) { return !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children ?? null)]; }
  function render() { cursor = 0; tree = component(props); return tree; }
  function input() { return nodes().find(node => node.type === "input" && node.props.role === "combobox"); }
  return { render, nodes, input, setProps: next => { props = { ...props, ...next }; }, slots };
}

test("shared creatable input opens, filters, selects, closes, reopens and preserves free input", () => {
  let value = "";
  const h = harness("src/components/suggested-input.tsx", "SuggestedInput", { value, suggestions: ["Alpha", "Beta"], suggestionLabel: "品牌", onValueChange: next => { value = next; h.setProps({ value }); } });
  h.render();
  h.slots[0].current = { focus() { h.input().props.onFocus({}); } };
  assert.equal(h.input().props["aria-expanded"], false);
  h.input().props.onFocus({}); h.render();
  assert.equal(h.input().props["aria-expanded"], true);
  assert.equal(h.nodes().filter(node => node.props?.role === "option").length, 2);
  assert.equal(h.nodes().some(node => node.props?.className === "input-recommendations"), false);
  h.input().props.onChange({ target: { value: "bet" } }); h.render();
  assert.equal(value, "bet");
  const beta = h.nodes().find(node => node.props?.role === "option" && node.props.children[0].props.children === "Beta");
  assert.ok(beta); assert.equal(h.nodes().some(node => node.props?.role === "option" && node.props.children[0].props.children === "Alpha"), false);
  beta.props.onClick(); h.render();
  assert.equal(value, "Beta"); assert.equal(h.input().props["aria-expanded"], false);
  // Moving away and back should expose all historical values, including the selected one.
  h.nodes()[0].props.onBlur({ relatedTarget: null }); h.input().props.onFocus({}); h.render();
  assert.equal(h.nodes().filter(node => node.props?.role === "option").length, 2);
  h.input().props.onChange({ target: { value: "New brand" } }); h.render();
  const create = h.nodes().find(node => node.props?.className?.includes("eo-select-create"));
  assert.ok(create); create.props.onClick(); h.render();
  assert.equal(value, "New brand"); assert.equal(h.input().props["aria-expanded"], false);
  h.input().props.onClick({}); h.render();
  h.input().props.onKeyDown({ key: "Escape", nativeEvent: {}, preventDefault() {}, stopPropagation() {} }); h.render();
  assert.equal(h.input().props["aria-expanded"], false);
  // Free text persists even without selecting a create option.
  h.input().props.onChange({ target: { value: "Unconfirmed value" } }); h.render();
  h.nodes()[0].props.onBlur({ relatedTarget: null }); h.render();
  assert.equal(value, "Unconfirmed value");
});

test("capsule-only, disabled and read-only inputs keep their existing strategy", () => {
  for (const props of [{ recommendationStyle: "chips" }, { disabled: true }, { readOnly: true }]) {
    const h = harness("src/components/suggested-input.tsx", "SuggestedInput", { value: "", suggestions: ["Alpha"], suggestionLabel: "城市", onValueChange() {}, ...props });
    h.render(); const input = h.nodes().find(node => node.type === "input"); input.props.onFocus({}); h.render();
    assert.equal(h.nodes().some(node => node.type === "dropdown"), false);
  }
  const numeric = harness("src/components/suggested-input.tsx", "SuggestedInput", { value: "", type: "number", suggestions: ["1", "2"], suggestionLabel: "数值", onValueChange() {} });
  numeric.render(); numeric.nodes().find(node => node.type === "input").props.onFocus({}); numeric.render();
  assert.equal(numeric.nodes().some(node => node.props?.className === "input-recommendations"), true);
});

test("place capsules preserve enum values, scope defaults, manual overrides and hidden fields", () => {
  let values = { kind: "restaurant", scope: "branch", serviceType: "food", branch: "分店", city: "成都", location: "商圈", address: "地址", category: "面馆" };
  const h = harness("src/app/food/places/place-location-fields.tsx", "PlaceSuggestionFields", { values, onChange: patch => { values = { ...values, ...patch }; h.setProps({ values }); } });
  const pick = (group, label) => { const node = h.nodes().find(node => node.props?.role === "group" && node.props["aria-label"] === group); const button = h.nodes(node).find(node => node.type === "button" && node.props.children === label); assert.ok(button); button.props.onClick(); h.render(); };
  h.render(); assert.equal(h.nodes().filter(node => node.props?.role === "group").length, 3);
  pick("来源类型", "饮品"); assert.equal(values.kind, "drink"); assert.equal(values.scope, "brand");
  assert.equal(h.nodes().some(node => node.type === "input"), false);
  pick("地点范围", "具体门店"); assert.equal(values.scope, "branch");
  assert.equal(h.nodes().some(node => node.type === "input" && node.props.value === "分店"), true);
  pick("来源类型", "零售"); assert.equal(values.scope, "branch", "manual scope survives a kind change");
  pick("饮食能力", "喝"); assert.equal(values.serviceType, "drink");
  pick("地点范围", "虚拟地点"); assert.equal(values.scope, "virtual");
  assert.equal(h.nodes().some(node => node.type === "input"), false);
  assert.equal(values.city, "成都", "hidden fields are preserved rather than deleted");
});
