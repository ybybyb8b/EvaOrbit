import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

test("bottom Log scopes follow the route, use the latest page action and release safely", async () => {
  let pathname = "/food", context, cursor = 0;
  const slots = [], effects = [];
  const jsx = (type, props) => ({ type, props });
  const react = {
    createContext: value => (context = { value, Provider: "provider" }),
    useContext: () => context.value,
    useCallback: callback => callback,
    useRef: value => slots[cursor++] ??= { current: value },
    useState: initial => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useLayoutEffect: effect => { effect(); },
    useEffect: (effect, deps) => {
      const index = cursor++, previous = slots[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
        previous?.cleanup?.();
        effects.push(() => { slots[index] = { deps, cleanup: effect() }; });
      }
    },
  };
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync("src/components/bottom-log.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "module", "exports", code)(name => {
    if (name === "react") return react;
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name === "next/navigation") return { usePathname: () => pathname };
    if (name.endsWith("locale-controller")) return { useLocale: () => ({ language: "zh" }) };
    if (name.endsWith("ui-copy")) return { translateUiCopy: value => value };
    throw Error(name);
  }, loaded, loaded.exports);
  const api = loaded.exports;
  function renderProvider() {
    cursor = 0;
    context.value = api.BottomLogProvider({ children: null }).props.value;
  }
  renderProvider();
  assert.equal(api.useBottomLog(), null); // Settings and other unregistered pages use universal capture.
  const first = { pathname: "/food", label: "Food", onClick() {} };
  const releaseFirst = context.value.register(first);
  renderProvider();
  assert.equal(api.useBottomLog(), first);
  pathname = "/settings";
  assert.equal(api.useBottomLog(), null); // Never invoke the previous page during navigation.
  pathname = "/food";
  let clicked = "", saved = "";
  const register = context.value.register;
  function renderPage(date) {
    context.value = { ...context.value, register };
    cursor = 1;
    api.useBottomLogAction({ label: "Food", selectedDate: date, onClick: () => { clicked = date; }, onSaved: async () => { saved = date; } });
    effects.splice(0).forEach(effect => effect());
  }
  renderPage("2026-10-10");
  renderProvider();
  const oldAction = api.useBottomLog();
  renderPage("2026-10-11");
  renderProvider();
  releaseFirst(); // A stale page cleanup must not remove a newer registration.
  renderProvider();
  assert.equal(api.useBottomLog().selectedDate, "2026-10-11");
  oldAction.onClick();
  await oldAction.onSaved();
  assert.equal(clicked, "2026-10-11");
  assert.equal(saved, "2026-10-11");
  pathname = "/settings";
  assert.equal(api.useBottomLog(), null);
  slots[2].cleanup();
  renderProvider();
  pathname = "/food";
  assert.equal(api.useBottomLog(), null);
});
