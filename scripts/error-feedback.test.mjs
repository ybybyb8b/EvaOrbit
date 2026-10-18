import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function fixture() {
  let active, context;
  const jsx = (type, props) => ({ type, props });
  const react = {
    createContext: () => ({ Provider: "provider" }), useContext: () => context,
    useState(initial) { const i = active.cursor++; if (!(i in active.slots)) active.slots[i] = initial; const owner = active; return [owner.slots[i], next => { owner.slots[i] = typeof next === "function" ? next(owner.slots[i]) : next; }]; },
    useRef(initial) { return active.slots[active.cursor++] ??= { current: initial }; },
    useId: () => active.id, useMemo: fn => fn(), useCallback: fn => fn, useSyncExternalStore: () => false,
    useEffect(effect, deps) { const i = active.cursor++, owner = active; const previous = owner.slots[i]; if (!previous || deps.some((value, index) => value !== previous.deps[index])) owner.effects.push(() => { previous?.cleanup?.(); owner.slots[i] = { deps, cleanup: effect() }; }); },
  };
  const code = ts.transpileModule(readFileSync("src/components/error-feedback.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const loaded = {};
  new Function("require", "exports", "document", code)(name => name === "react" ? react : name === "react/jsx-runtime" ? { jsx, jsxs: jsx } : name === "react-dom" ? { createPortal: node => node } : name.endsWith("locale-controller") ? { useLocale: () => ({ english: false }) } : {}, loaded, { body: {} });
  const provider = { slots: [], cursor: 0, effects: [], id: "provider" };
  function render(instance, fn, props) { active = instance; active.cursor = 0; const tree = fn(props); active.effects.splice(0).forEach(effect => effect()); return tree; }
  let tree = render(provider, loaded.ErrorFeedbackProvider, { children: "page" });
  const registry = tree.props.value;
  context = registry;
  const banner = () => { tree = render(provider, loaded.ErrorFeedbackProvider, { children: "page" }); return tree.props.children[1]; };
  const register = (id, content) => registry.put({ id, content, signature: content });
  return { loaded, registry, register, banner, setContext: next => { context = next; }, owner: id => ({ slots: [], cursor: 0, effects: [], id }), render };
}

test("persistent errors deduplicate dismissal, preserve distinct failures and release their owner", () => {
  const f = fixture();
  f.register("page", "读取失败"); f.register("editor", "读取失败");
  assert.equal(f.banner().props.children, "读取失败");
  f.banner().props.onDismiss();
  assert.equal(f.banner(), undefined);
  f.register("editor", "读取失败");
  assert.equal(f.banner(), undefined, "ordinary rerenders must not undo dismissal");
  f.register("editor", "保存失败"); f.register("sync", "同步失败");
  assert.equal(f.banner().props.children, "同步失败");
  f.banner().props.onDismiss();
  assert.equal(f.banner().props.children, "保存失败");
  f.registry.remove("editor");
  assert.equal(f.banner(), undefined);
});

test("error owners retain recovery actions, clean up on unmount and allow inline field validation", () => {
  const f = fixture(), owner = f.owner("form"), content = { type: "button", props: { children: "重试", onClick() {} } };
  const props = { children: content };
  f.render(owner, f.loaded.RegisteredErrorNotice, props);
  assert.equal(f.banner().props.children, content);
  f.render(owner, f.loaded.RegisteredErrorNotice, { ...props, inline: true });
  assert.equal(f.banner(), undefined);
  f.render(owner, f.loaded.RegisteredErrorNotice, props);
  assert.ok(f.banner());
  for (const slot of owner.slots) slot?.cleanup?.();
  assert.equal(f.banner(), undefined, "leaving a form must release its error");
  f.setContext(null);
  const fallback = f.render(f.owner("server"), f.loaded.RegisteredErrorNotice, { children: "错误", id: "field-error", className: "extra" });
  assert.equal(fallback.type, "p");
  assert.equal(fallback.props.role, "alert");
  assert.equal(fallback.props.className, "form-error extra");
  assert.equal(fallback.props.id, "field-error");
});
