import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import path from "node:path";

// Exercise the shipped event handlers with controlled hook state, without a DOM dependency.
function harness(file, exportName, initialProps, environment = {}) {
  const slots = []; let cursor = 0; let tree; let props = initialProps;
  const jsx = (type, props) => ({ type, props });
  const react = {
    Children: { toArray: children => [children].flat(Infinity).filter(child => child !== null && child !== undefined && child !== false) },
    isValidElement: child => Boolean(child && typeof child === "object" && child.type),
    createContext: value => ({ value }), useContext: context => context.value,
    useId: () => "test-list", useEffect: () => {},
    useRef: value => { const index = cursor++; return slots[index] ??= { current: value }; },
    useState: value => { const index = cursor++; if (!(index in slots)) slots[index] = typeof value === "function" ? value() : value; return [slots[index], next => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }]; },
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
      if (name.endsWith("locale-controller")) return { useLocale: () => ({ english: environment.english ?? false }) };
      if (name.endsWith("select-dropdown")) return { SelectDropdown: "dropdown" };
      if (name.endsWith("suggested-input")) return { SuggestedInput: "suggested-input" };
      if (name.endsWith(".module.css")) return { default: {} };
      if (name === "next/link") return { default: "link" };
      if (name.endsWith("food-name-input")) return { FoodNameInput: "food-name-input" };
      if (name.endsWith("food-library-picker")) return { FoodLibraryPicker: "library-picker" };
      if (name.endsWith("food-link-picker")) return { FoodLinkPicker: "link-picker" };
      if (name.endsWith("food-delete-action")) return { FoodDeleteAction: "delete-action" };
      if (name.endsWith("food-consumption-fields")) return { FoodConsumptionFields: "consumption-fields", consumptionFromItem: load("src/app/food/food-consumption-fields.tsx").consumptionFromItem };
      if (name.endsWith("native-bridge")) return { reconcileNativeNotifications: async () => {} };
      if (name.endsWith("form-sheet")) return { FormSheet: "sheet" };
      if (name.endsWith("action-toast")) return { showActionToast() {} };
      if (name.endsWith("icons")) return { Icon: "icon" };
      if (name.endsWith("client-json-cache")) return { invalidateCachedJson() {} };
      if (name.endsWith("searchable-select")) return { SearchableSelect: "searchable-select" };
      if (name.endsWith("date-time-field")) return load("src/components/date-time-field.tsx");
      if (name.startsWith("@/lib/")) return load(`src/lib/${name.slice(6)}.ts`);
      if (name.startsWith(".") && file.startsWith("src/lib/")) return load(path.posix.join(path.posix.dirname(file), name).replace(/\.ts$/, "") + ".ts");
      throw Error(`Unexpected import ${name}`);
    };
    new Function("require", "module", "exports", "document", "fetch", code)(require, loaded, loaded.exports, { activeElement: null }, environment.fetch ?? globalThis.fetch);
    modules.set(file, loaded.exports); return loaded.exports;
  }
  const component = load(file)[exportName];
  function nodes(node = tree) { return !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.filter(child => child !== undefined).flatMap(nodes) : [node, ...nodes(node.props?.children ?? null)]; }
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

test("inline date and time keep unknown time empty and allow clearing an explicit time", () => {
  for (const english of [false, true]) {
    let value = { date: "2026-10-10", time: "" };
    const h = harness("src/components/date-time-field.tsx", "DateTimeField", { inline: true, label: "日期", value, onChange: next => { value = next; h.setProps({ value }); } }, { english });
    h.render();
    const time = () => h.nodes().find(node => node.type === "input" && node.props.type === "time");
    assert.equal(time().props.value, "");
    assert.equal(h.nodes().some(node => node.props.className === "date-time-add"), false);
    time().props.onChange({ target: { value: "13:00" } }); h.render();
    assert.equal(value.time, "13:00");
    h.nodes().find(node => node.type === "button").props.onClick(); h.render();
    assert.equal(value.time, ""); assert.equal(time().props.value, "");
  }
});

test("short native choices preserve numeric values, disabled entries and required focus; six entries retain a native dropdown", () => {
  let value = 0; let changes = 0; let focused = false;
  const options = [0, 1, 2, 3, 4].map(value => ({ type: "option", props: { value, children: String(value), disabled: value === 4 } }));
  const h = harness("src/components/choice-select.tsx", "ChoiceSelect", { value, children: options, required: true, onChange: event => { value = Number(event.target.value); changes++; h.setProps({ value }); } });
  h.render();
  const native = h.nodes().find(node => node.type === "select");
  h.slots[0].current = { value: "0", dispatchEvent(event) { assert.equal(event.type, "change"); assert.equal(event.bubbles, true); native.props.onChange({ target: this }); }, parentElement: { querySelector() { return { focus() { focused = true; } }; } } };
  h.nodes().find(node => node.type === "button" && node.props.children === "2").props.onClick(); h.render();
  assert.equal(value, 2); assert.equal(changes, 1);
  assert.equal(h.nodes().find(node => node.type === "button" && node.props.children === "2").props["aria-pressed"], true);
  assert.equal(h.nodes().find(node => node.type === "button" && node.props.children === "4").props.disabled, true);
  h.nodes().find(node => node.type === "select").props.onInvalid({ preventDefault() {} }); assert.equal(focused, true);
  h.setProps({ children: [...options, { type: "option", props: { value: 5, children: "5" } }] });
  assert.equal(h.render().type, "select"); assert.equal(h.nodes().some(node => node.type === "button"), false);
});

test("fixed shared choices use capsules while searchable resources retain a dropdown", () => {
  let value = "";
  const options = ["", "a", "b", "c", "d"].map(value => ({ value, label: value || "未评价" }));
  const h = harness("src/components/searchable-select.tsx", "SearchableSelect", { label: "评价", value, options, searchable: false, onValueChange: next => { value = next; h.setProps({ value }); } });
  h.render(); h.nodes().find(node => node.type === "button" && node.props.children[0] === "b").props.onClick(); h.render();
  assert.equal(value, "b"); assert.equal(h.nodes().some(node => node.type === "details"), false);
  h.setProps({ searchable: true }); h.render(); assert.equal(h.nodes().some(node => node.type === "details"), true);
});

test("fixed and searchable dropdowns share a top-layer panel and Reicon arrow, while fixed labels follow locale", () => {
  for (const searchable of [false, true]) {
    const options = ["其他", "咖啡", "茶", "奶茶", "汽水", "果汁"].map(value => ({ value, label: value }));
    const h = harness("src/components/searchable-select.tsx", "SearchableSelect", { value: "咖啡", options, label: "类型", searchable, onValueChange() {} }, { english: true });
    h.render();
    assert.ok(h.nodes().find(node=>node.type==="icon"&&node.props.name==="chevronDown"));
    h.nodes().find(node=>node.type==="details").props.onToggle({currentTarget:{open:true}}); h.render();
    assert.equal(h.nodes().filter(node=>node.type==="dropdown").length,1);
    assert.equal(h.nodes().some(node=>node.props.className==="searchable-select-menu"),false);
    assert.equal(h.nodes().some(node=>node.type==="input"&&node.props.type==="search"),searchable);
    const option=h.nodes().find(node=>node.type==="button"&&node.props.children.props.children[0].props.children[0]===(searchable?"咖啡":"Coffee"));
    assert.ok(option);
    assert.equal(option.props.className.includes("user-content"),searchable);
  }
});

test("catalog input localizes its controls while preserving the user's drink name", () => {
  for (const english of [false, true]) {
    const h = harness("src/app/food/food-name-input.tsx", "FoodNameInput", { kind: "drink", value: "乌龙茶", label: "喝了什么", onValueChange() {}, onSelect() {} }, { english });
    h.render();
    assert.equal(h.input().props.value, "乌龙茶");
    assert.equal(h.input().props["aria-label"], english ? "What did you drink?" : "喝了什么");
    assert.equal(/[\u4e00-\u9fff]/.test(h.input().props.placeholder), !english);
  }
});

test("food meals reuse shared capsules, have no recommendation badge, and details remain visible", () => {
  const h = harness("src/app/food/food-record-editor.tsx", "FoodRecordEditor", { date:"2026-10-10", initialMealType:"lunch", onClose(){}, onSaved(){} });
  h.render();
  const meal=()=>h.nodes().find(node=>node.type==="searchable-select"&&node.props.label==="餐次");
  assert.equal(meal().props.value,"lunch"); assert.equal(meal().props.searchable,false);
  assert.equal(h.nodes().some(node=>node.type==="details"||node.type==="summary"),false);
  assert.equal(h.nodes().some(node=>node.type==="small"&&node.props.children==="推荐"),false);
  meal().props.onValueChange("dinner");h.render();assert.equal(meal().props.value,"dinner");
  h.nodes().find(node=>node.type==="searchable-select"&&node.props.label==="场景").props.onValueChange("restaurant");h.render();
  const rating=h.nodes().find(node=>node.type==="searchable-select"&&node.props.label==="评价");
  assert.equal(rating.props.clearable,true);assert.equal(rating.props.value,"");
});

test("food hides calorie bounds but preserves them on edit, with context before calories and details after place", async () => {
  let payload;
  const record = { id: 1, title: "午餐", description: "原有明细", occurredAt: "2026-10-09T04:00:00.000Z", occurredHasExplicitTime: false, mealType: "lunch", scene: "restaurant", rating: "good", estimatedKcal: 180, kcalMin: 0, kcalMax: 240, confidence: "medium", portion: "原有份量", notes: "原有备注", foodPlaceId: 2, foodPlaceName: "餐厅", foodDishIds: [3] };
  const h = harness("src/app/food/food-record-editor.tsx", "FoodRecordEditor", { date: "2026-10-10", record, onClose() {}, onSaved() {} }, { fetch: async (_, options) => { payload = JSON.parse(options.body); return { ok: true }; } });
  h.render();
  const labels = h.nodes().filter(node => node.type === "span").map(node => node.props.children);
  assert.ok(labels.indexOf("餐次") < labels.indexOf("场景"));
  assert.ok(labels.indexOf("场景") < labels.indexOf("热量估算 kcal"));
  const nodes = h.nodes();
  assert.ok(nodes.findIndex(node => node.type === "link-picker") < nodes.findIndex(node => node.type === "textarea"));
  assert.equal(nodes.filter(node => node.type === "input" && node.props.type === "number").length, 2);
  assert.equal(nodes.some(node => node.type === "p" && node.props.children === "热量与营养 · 可选"), false);
  assert.equal(nodes.some(node => node.type === "p" && node.props.children === "按店铺查找（备选）"), false);
  await nodes.find(node => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(payload.kcalMin, 0); assert.equal(payload.kcalMax, 240); assert.equal(payload.estimatedKcal, 180);
  assert.equal(payload.description, "原有明细"); assert.equal(payload.portion, "原有份量"); assert.equal(payload.notes, "原有备注");
  assert.equal(payload.occurredHasExplicitTime, false); assert.deepEqual(payload.foodDishIds, [3]);
});

test("optional capsules start empty, omit the empty pill and toggle off; fixed sugar can show six choices", () => {
  let value = "";
  const options = ["", "a", "b", "c", "d", "e", "f"].map(value => ({ value, label: value || "未填写" }));
  const h = harness("src/components/searchable-select.tsx", "SearchableSelect", { label: "糖度", value, options, searchable: false, clearable: true, presentation: "capsules", onValueChange: next => { value = next; h.setProps({ value }); } });
  h.render();
  const buttons = () => h.nodes().filter(node => node.type === "button");
  assert.equal(buttons().length, 6);
  assert.equal(buttons().some(node => node.props["aria-pressed"]), false);
  buttons()[0].props.onClick(); h.render(); assert.equal(value, "a");
  buttons()[0].props.onClick(); h.render(); assert.equal(value, "");
  h.setProps({ presentation: "auto", options: options.slice(0, 6) }); h.render();
  assert.equal(buttons().length, 5);
});

test("measured food and drink amounts calculate decimal calories and persist separately from historical capacity", async () => {
  const reference = { id: 4, name: "测试物品", brand: "", referenceEnergyKj: null, referenceKcal: 40, servingKcal: null, servingWeight: null, referenceType: "per_100ml" };
  for (const kind of ["food", "drink"]) {
    let payload;
    const h = harness(kind === "food" ? "src/app/food/food-record-editor.tsx" : "src/app/drinks/drink-ui.tsx", kind === "food" ? "FoodRecordEditor" : "DrinkRecordEditor", { date: "2026-10-10", initialDate: "2026-10-10", onClose() {}, onSaved() {} }, { fetch: async (_, options) => { payload = JSON.parse(options.body); return { ok: true }; } });
    h.render();
    h.nodes().find(node => node.type === "food-name-input" && !node.props.placeId).props.onSelect({ key: "library:4", name: "测试物品", placeId: null, placeName: "", servingKcal: null, library: { ...reference, referenceType: kind === "food" ? "per_100g" : "per_100ml" } });
    h.render();
    const amount = () => h.nodes().find(node => node.type === "input" && node.props.step === "0.01");
    amount().props.onChange({ target: { value: "250.25" } }); h.render();
    await h.nodes().find(node => node.type === "form").props.onSubmit({ preventDefault() {} });
    assert.equal(payload[kind === "food" ? "consumedWeightG" : "consumedVolumeMl"], 250.25);
    assert.equal(payload.estimatedKcal, 100.1);
    if (kind === "drink") assert.equal(payload.volumeMl, null);
    amount().props.onChange({ target: { value: "0" } }); h.render();
    await h.nodes().find(node => node.type === "form").props.onSubmit({ preventDefault() {} });
    assert.equal(payload.estimatedKcal, 0);
  }
});

test("name selection preserves historical links until choosing another item and fills source, type and calories together", async () => {
  let payload;
  const record={id:1,occurredAt:"2026-10-09T04:00:00.000Z",occurredHasExplicitTime:false,name:"拿铁",brand:"历史品牌",drinkType:"coffee",volumeMl:350,caffeineMg:0,sugarLevel:"",temperature:null,rating:null,estimatedKcal:null,kcalMin:0,kcalMax:120,confidence:"medium",notes:"",foodLibraryId:3,foodPlaceId:1,foodPlaceName:"咖啡店",drinkMenuId:2,drinkMenuName:"拿铁"};
  const h=harness("src/app/drinks/drink-ui.tsx","DrinkRecordEditor",{record,suggestions:{names:[],brands:[]},onClose(){},onSaved(){}},{fetch:async(_,options)=>{payload=JSON.parse(options.body);return{ok:true};}});
  const save=async()=>h.nodes().find(node=>node.type==="form").props.onSubmit({preventDefault(){}});
  const name=()=>h.nodes().find(node=>node.type==="food-name-input"&&!node.props.placeId);
  h.render();await save();h.render();assert.equal(payload.foodLibraryId,3);assert.equal(payload.drinkMenuId,2);assert.equal(payload.kcalMax,120);
  name().props.onSelect({key:"menu:5",name:"乌龙茶",placeId:4,placeName:"茶店",menu:{id:5,drinkType:"tea"},library:{id:9,drinkType:"tea"},servingKcal:80});h.render();await save();h.render();
  assert.equal(payload.foodPlaceId,4);assert.equal(payload.foodLibraryId,9);assert.equal(payload.drinkMenuId,5);assert.equal(payload.drinkType,"tea");assert.equal(payload.estimatedKcal,80);
  assert.equal(payload.occurredHasExplicitTime,false);assert.equal(payload.caffeineMg,0);assert.equal(payload.brand,"历史品牌");assert.equal(payload.volumeMl,350);
  name().props.onValueChange("手填饮品");h.render();await save();
  assert.equal(payload.name,"手填饮品");assert.equal(payload.foodPlaceId,null);assert.equal(payload.foodLibraryId,null);assert.equal(payload.drinkMenuId,null);assert.equal(payload.estimatedKcal,null);
});

test("free input with more than five recommendations uses search and preserves free text", () => {
  const h = harness("src/components/suggested-input.tsx", "SuggestedInput", { value: "", recommendationStyle: "chips", suggestions: ["A", "B", "C", "D", "E", "F"], suggestionLabel: "饮品", onValueChange() {} });
  h.render(); h.input().props.onFocus({}); h.render();
  assert.equal(h.nodes()[0].props["data-recommendation-style"], "search");
  assert.equal(h.nodes().filter(node => node.props?.role === "option").length, 6);
  assert.equal(h.nodes().some(node => node.props?.className === "input-recommendations"), false);
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
