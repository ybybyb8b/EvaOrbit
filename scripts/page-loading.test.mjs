import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(readFileSync(new URL('../src/components/page-loading.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

test('shared loading localizes context, reveals recovery only after a long wait and clears its timer', () => {
  const oldWindow = globalThis.window;
  let slow = false, english = false, callback, cleared, reloads = 0, cleanup;
  globalThis.window = { setTimeout(fn, delay) { assert.equal(delay, 12000); callback = fn; return 7; }, clearTimeout(id) { cleared = id; }, location: { reload() { reloads++; } } };
  const exports = {};
  try {
    new Function('require', 'exports', compiled)(name => {
      if (name === 'react') return { useState: () => [slow, value => { slow = value; }], useEffect: effect => { cleanup = effect(); } };
      if (name === './locale-controller') return { useLocale: () => ({ english }) };
      if (name.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
      return require(name);
    }, exports);
    const first = renderToStaticMarkup(exports.PageLoading({ title: '健康', englishTitle: 'Health' }));
    assert.match(first, /正在读取健康/); assert.match(first, /role="status"/);
    assert.match(first, /class="page page"/);
    assert.match(first, /core-light.webp/); assert.match(first, /core-dark.webp/);
    assert.equal((first.match(/pathLength="1"/g) ?? []).length, 3);
    assert.doesNotMatch(first, /<button/); assert.match(first, /aria-hidden="true"/);
    callback(); english = true;
    const tree = exports.PageLoading({ title: '健康', englishTitle: 'Health', inline: true });
    const waiting = renderToStaticMarkup(tree);
    assert.match(waiting, /Loading Health/); assert.match(waiting, /taking a little longer/);
    assert.doesNotMatch(waiting, /<h1/);
    const button = tree.props.children.props.children.at(-1).props.children[1];
    button.props.onClick(); assert.equal(reloads, 1);
    cleanup(); assert.equal(cleared, 7);
  } finally { globalThis.window = oldWindow; }
});
