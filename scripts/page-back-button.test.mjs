import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

test("Back reuses the destination; direct entry uses client replacement without adding history", () => {
  for (const canGoBack of [true, false]) {
    const calls = [], listeners = new EventTarget();
    const win = {
      history: { state: { evaOrbitCanGoBack: canGoBack } },
      addEventListener: (...args) => listeners.addEventListener(...args),
      dispatchEvent: event => { calls.push(event.type); return listeners.dispatchEvent(event); },
      location: { search: "", reload: () => calls.push("reload") },
    };
    const loaded = { exports: {} };
    const code = ts.transpileModule(readFileSync("src/components/page-back-button.tsx", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    new Function("require", "module", "exports", "window", code)(name => {
      if (name === "react") return { useRef: value => ({ current: value }), useEffect: effect => effect(), useTransition: () => [false, action => action()] };
      if (name === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
      if (name === "next/navigation") return { usePathname: () => "/food", useRouter: () => ({ back: () => calls.push("back"), replace: path => calls.push(`replace:${path}`) }) };
      if (name === "reicon-react") return { ArrowLeft2: "icon" };
      if (name.endsWith("locale-controller")) return { useLocale: () => ({ english: true }) };
      if (name.endsWith("page-navigation")) return { pageBackFallback: () => "/food-drink" };
      throw Error(name);
    }, loaded, loaded.exports, win);
    const button = loaded.exports.PageBackButton();
    button.props.onClick();
    button.props.onClick(); // Ignore repeated taps while the return is pending.
    if (canGoBack) {
      assert.deepEqual(calls, ["back"]); // Never refresh the departing page.
      listeners.dispatchEvent(new Event("popstate"));
      listeners.dispatchEvent(new Event("popstate"));
      assert.deepEqual(calls, ["back"]);
    } else assert.deepEqual(calls, ["evaorbit:page-back-fallback", "replace:/food-drink"]);
  }
});
