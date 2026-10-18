import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { ValidationError } from '../src/lib/validation.ts';
import * as errors from '../src/lib/errors.ts';

// Run the actual route handlers and shared parser with service calls isolated.
// No server, login, Supabase credentials or database writes are involved.
function load(file, require) {
  const exports = {};
  const { outputText } = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  new Function('require', 'exports', outputText)(require, exports);
  return exports;
}
const next = { NextResponse: { json: (data, init) => Response.json(data, init) } };
const api = load('../src/lib/api.ts', name => {
  if (name === 'next/server') return next;
  if (name === './validation.ts') return { ValidationError };
  if (name === './errors.ts') return errors;
  throw new Error('Unexpected shared API dependency: ' + name);
});
function fixture(route) {
  const calls = [];
  const service = new Proxy({}, { get: (_, name) => async input => { calls.push({ name, input }); return input ?? null; } });
  const handlers = load('../src/app/api/' + route + '/route.ts', name => {
    if (name === 'next/server') return next;
    if (name === '@/lib/api') return api;
    if (name === '@/lib/validation') return { ValidationError };
    if (name.startsWith('@/lib/services/')) return service;
    throw new Error('Unexpected route dependency: ' + name);
  });
  return { calls, get: params => handlers.GET({ nextUrl: new URL('http://localhost/api/' + route + '?' + new URLSearchParams(params)) }) };
}

const routes = [
  { route: 'memos', max: 200 }, { route: 'lucius/cases', max: 200 },
  { route: 'lucius/diary', max: 200 }, { route: 'lucius/posts', max: 100 },
  { route: 'health/records', max: 100 }, { route: 'chronicle', max: 200, trimEmpty: true },
  { route: 'media', max: 200, trimEmpty: true },
  { route: 'nutrition/daily/history', max: 90, trimEmpty: true, defaultLimit: 30 },
];
test('all migrated list routes retain limit bounds, defaults and distinct whitespace policies', async () => {
  for (const { route, max, trimEmpty, defaultLimit } of routes) {
    const f = fixture(route);
    for (const limit of [undefined, '', ' ', '1', String(max), '1.0', '0x10', '0', '-1', '1.5', String(max + 1), 'NaN', 'Infinity']) {
      const before = f.calls.length;
      const response = await f.get(limit === undefined ? {} : { limit });
      const missing = limit === undefined || limit === '' || trimEmpty && limit === ' ';
      const valid = missing || ['1', String(max), '1.0', '0x10'].includes(limit);
      assert.equal(response.status, valid ? 200 : 400, route + ' limit=' + JSON.stringify(limit));
      const result = await response.json();
      if (valid) {
        assert.equal(f.calls.length, before + 1);
        assert.equal(route === 'nutrition/daily/history' ? result : result.limit, missing ? defaultLimit : Number(limit), route);
      } else {
        assert.deepEqual(result, { error: '数量格式不正确' });
        assert.equal(f.calls.length, before, 'Invalid input must never reach the service');
      }
    }
  }
});

test('Memo, Lucius and Health enum filters retain labels and reject unknown or padded values', async () => {
  for (const [route, key, valid, label] of [
    ['memos', 'type', 'basic', 'Memo 类型'], ['memos', 'status', 'active', 'Memo 状态'],
    ['lucius/cases', 'errorType', 'naming', '错误类型'], ['lucius/cases', 'severity', 'minor', '严重程度'],
    ['lucius/cases', 'status', 'serving', '案底状态'], ['health/records', 'status', 'active', '健康记录状态'],
    ['health/records', 'type', 'symptom', '健康记录类型'],
  ]) {
    const f = fixture(route);
    for (const value of ['', valid, ' ' + valid, 'unknown']) {
      const response = await f.get({ [key]: value });
      assert.equal(response.status, value === '' || value === valid ? 200 : 400);
      if (!response.ok) assert.deepEqual(await response.json(), { error: label + '格式不正确' });
    }
  }
});
