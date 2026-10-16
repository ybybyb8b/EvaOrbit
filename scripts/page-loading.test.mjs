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

test('shared loading shows only nine decorative dots and keeps localized status accessible', () => {
  let english = false;
  const exports = {};
  new Function('require', 'exports', compiled)(name => {
    if (name === './locale-controller') return { useLocale: () => ({ english }) };
    if (name.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    return require(name);
  }, exports);
  for (const variant of [{}, { inline: true }, { compact: true }]) {
    const html = renderToStaticMarkup(exports.PageLoading({ title:'任务', englishTitle:'tasks', ...variant }));
    assert.ok(html.startsWith(variant.compact ? '<span' : '<div'));
    assert.match(html, /role="status"/);
    assert.match(html, /class="sr-only">正在读取任务/);
    assert.equal((html.match(/class="dot"/g) ?? []).length, 9);
    assert.doesNotMatch(html, /<h1|<p|<button|<svg|<image|data:image|EvaOrbit/);
  }
  english = true;
  assert.match(renderToStaticMarkup(exports.PageLoading({ title:'任务', englishTitle:'tasks' })), /class="sr-only">Loading tasks/);
});
