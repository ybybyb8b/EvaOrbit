import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

function load(relative, require, win) {
  const code = ts.transpileModule(readFileSync(new URL(relative, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', 'window', code)(require, exports, win);
  return exports;
}

function fixture(initial = '/health', responseOk = true) {
  const win = new EventTarget();
  const count = { reload: 0, refresh: 0, back: 0, invalidated: 0, replaced: [] };
  const originalFetch = async () => ({ ok: responseOk });
  Object.assign(win, { fetch: originalFetch, history: { state: { evaOrbitCanGoBack: true } },
    location: { origin: 'https://eo.test', search: '', reload: () => count.reload++ }, setTimeout, clearTimeout });
  const router = { refresh: () => count.refresh++, back: () => count.back++, replace: url => count.replaced.push(url) };
  let path = initial, search = '', cursor = 0;
  const hooks = [], pending = [];
  const react = {
    useRef(value) { const index = cursor++;return hooks[index] ??= { current: value }; },
    useEffect(effect, deps) {
      const index = cursor++, previous = hooks[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) pending.push(() => {
        previous?.cleanup?.();hooks[index] = { deps, cleanup: effect() };
      });
    },
    useTransition: () => [false, action => action()],
  };
  const navigation = { usePathname: () => path, useSearchParams: () => new URLSearchParams(search), useRouter: () => router };
  const helpers = load('../src/lib/page-navigation.ts', () => ({}), win);
  const changed = load('../src/lib/data-changed.ts', () => ({}), win);
  const require = name => ({ react, 'next/navigation': navigation, '@/lib/page-navigation': helpers, '@/lib/data-changed': changed,
    '@/lib/home-cache': { invalidateHomeCache: () => count.invalidated++ },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    './locale-controller': { useLocale: () => ({ english: false }) }, 'reicon-react': { ArrowLeft2: () => null } })[name];
  const { DataChangeReconciler } = load('../src/components/data-change-reconciler.tsx', require, win);
  const { PageBackButton } = load('../src/components/page-back-button.tsx', require, win);
  function render(url = path + (search ? '?' + search : '')) {
    const next = new URL(url, win.location.origin);path = next.pathname;search = next.search.slice(1);win.location.search = next.search;
    cursor = 0;DataChangeReconciler();pending.splice(0).forEach(effect => effect());
  }
  render();
  return { win, count, originalFetch, render, back: () => PageBackButton().props.onClick(),
    unmount: () => hooks.forEach(hook => hook?.cleanup?.()),
    synced: domains => { const event = new Event(changed.dataChangedEvent);event.detail = { domains, source: 'healthkit' };win.dispatchEvent(event); } };
}

test('Ordinary navigation and Back keep the document; successful writes refresh previously visited URLs once', async () => {
  const f = fixture();
  try {
    f.render('/health?view=weight');f.back();f.render('/health');
    assert.equal(f.count.back, 1);assert.equal(f.count.reload, 0);
    await f.win.fetch('/api/health/weight', { method: 'POST' });
    assert.equal(f.count.invalidated, 1, 'writes invalidate Home even when another page is mounted');
    assert.equal(f.count.reload, 0, 'a write does not immediately reload');
    f.render('/health?view=weight');assert.equal(f.count.reload, 1);
    f.render('/health?view=weight');assert.equal(f.count.reload, 1, 'same URL render stays fresh');
    f.render('/new-unvisited-page');assert.equal(f.count.reload, 1);
    f.render('/health?view=weight');assert.equal(f.count.reload, 1, 'consumed stale URL stays fresh');
  } finally { f.unmount(); }
});

test('GET, failed writes, and cross-origin writes do not invalidate; native events and query-only navigation do', async () => {
  for (const [url, init, ok] of [['/api/health/weight', undefined, true], ['/api/health/weight', { method: 'PATCH' }, false], ['https://other.test/api/health/weight', { method: 'POST' }, true]]) {
    const f = fixture('/health', ok);
    try {
      f.render('/health?view=weight');
      await f.win.fetch(url, init);f.render('/health');assert.equal(f.count.reload, 0);
    } finally { f.unmount(); }
  }
  const f = fixture();
  try {
    f.render('/health?view=weight');f.synced(['invalid']);f.render('/health');assert.equal(f.count.reload, 0);
    f.synced(['health']);f.render('/health?view=weight');assert.equal(f.count.reload, 1);
    f.render('/health?view=sleep');assert.equal(f.count.reload, 1);
  } finally { f.unmount(); }
});

test('Unmount restores fetch; Back fallback resolves topic queries without a document reload', () => {
  const f = fixture();f.render('/health?view=weight');f.win.history.state = {};
  f.back();assert.deepEqual(f.count.replaced, ['/health']);assert.equal(f.count.reload, 0);
  assert.notEqual(f.win.fetch, f.originalFetch);f.unmount();assert.equal(f.win.fetch, f.originalFetch);
});
