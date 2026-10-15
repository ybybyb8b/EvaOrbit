import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { healthPeriodHistoryFrom } from '../src/lib/health-period-range.ts';

const compiled = ts.transpileModule(readFileSync(new URL('../src/app/health/page.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function pageFixture(oldActive = false) {
  const calls = [];
  let releaseSleep;
  const sleep = new Promise(resolve => { releaseSleep = resolve; });
  const services = new Proxy({}, { get: (_, name) => (...args) => {
    calls.push({ name, args });
    if (name === 'getDailySleepSummary') return sleep;
    if (name === 'dateInEvaOrbit') return '2026-10-14';
    if (name === 'healthPeriodHistoryFrom') return healthPeriodHistoryFrom(args[0]);
    if (name === 'dateRange') return { from: args[0], to: args[0] };
    if (name === 'shiftDate') return args[0];
    if (name === 'buildHealthDashboard') return { current: [], recent: [] };
    if (oldActive && name === 'listMenstrualPeriods') return args[0].activeOnly ? [{ id: 7, startedOn: '2026-01-01', endedOn: null }] : [{ id: 8, startedOn: '2026-09-01', endedOn: '2026-09-05' }];
    if (oldActive && /^(listMenstrualFlowRecords|listMedicationDoseEvents)$/.test(name)) return args[0].periodId ? [{ id: 2, periodId: 7, occurredAt: '2026-01-02', takenAt: '2026-01-02' }] : [];
    return [];
  }});
  const exports = {};
  new Function('require', 'exports', compiled)(name => name === 'react/jsx-runtime' ? { jsx: (_, props) => props } : services, exports);
  return { run: params => exports.default({ searchParams: Promise.resolve(params) }), calls, releaseSleep };
}

const expected = {
  overview: ['getDailySleepSummary', 'listHealthRecords', 'getDailyNutritionSummary', 'listTrainingLogs', 'listWeightRecords', 'listMenstrualPeriods', 'listScheduledNotifications'],
  sleep: ['getDailySleepSummary'],
  weight: ['listWeightRecords', 'getWeightSettings'],
  training: ['listTrainingLogs', 'listTrainingLogs', 'getTrainingInputSuggestions', 'getTrainingPlan'],
  energy: ['getDailyNutritionSummary', 'listDailyNutritionHistory'],
  cycle: ['listMenstrualPeriods', 'listMenstrualFlowRecords', 'listMedicationPresets', 'listMedicationDoseEvents', 'listScheduledNotifications', 'listMenstrualPeriods'],
  records: ['listHealthRecords'],
};
const queried = call => /^(getDailySleepSummary|listHealthRecords|getDailyNutritionSummary|listDailyNutritionHistory|listTrainingLogs|getTrainingInputSuggestions|getTrainingLog|getTrainingPlan|listWeightRecords|getWeightSettings|getWeightRecord|listMenstrualPeriods|listMenstrualFlowRecords|listMedicationPresets|listMedicationDoseEvents|listScheduledNotifications)$/.test(call.name);

test('Health routes query only their displayed data; sleep does not serialize overview queries', async () => {
  for (const [view, names] of Object.entries(expected)) {
    const fixture = pageFixture(), pending = fixture.run({ view });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(fixture.calls.filter(queried).map(call => call.name), names, view);
    fixture.releaseSleep({});
    const props = await pending;
    assert.equal(props.view, view);
    if (view === 'overview') assert.equal(fixture.calls.find(call => call.name === 'listWeightRecords').args[0].limit, 2);
    if (view === 'weight') assert.equal(fixture.calls.find(call => call.name === 'listWeightRecords').args[0].limit, 1000);
    if (view === 'cycle') {
      for (const name of ['listMenstrualPeriods', 'listMenstrualFlowRecords', 'listMedicationDoseEvents']) assert.equal(fixture.calls.find(call => call.name === name).args[0].from, '2026-04-14');
      assert.deepEqual(fixture.calls.filter(call => call.name === 'listMenstrualPeriods')[1].args[0], { activeOnly: true, limit: 1 });
    }
  }
});

test('Legacy editor IDs retain precedence without querying the other editor', async () => {
  for (const [params, view, focused] of [[{ view: 'sleep', weight: '7', training: '9' }, 'weight', 'getWeightRecord'], [{ view: 'energy', training: '9' }, 'training', 'getTrainingLog']]) {
    const fixture = pageFixture();fixture.releaseSleep({});
    assert.equal((await fixture.run(params)).view, view);
    assert.deepEqual(fixture.calls.filter(call => /^(getWeightRecord|getTrainingLog)$/.test(call.name)).map(call => call.name), [focused]);
  }
});

test('Cycle retains an older active period and its associated flows and doses', async () => {
  const fixture = pageFixture(true);
  const props = await fixture.run({ view: 'cycle' });
  assert.deepEqual(props.initialPeriods.map(item => item.id), [8, 7]);
  assert.equal(props.initialMenstrualFlows[0].periodId, 7);
  assert.equal(props.initialMedicationDoses[0].periodId, 7);
  assert.deepEqual(fixture.calls.filter(call => call.args[0]?.periodId).map(call => [call.name, call.args[0]]), [
    ['listMenstrualFlowRecords', { periodId: 7, limit: 30 }],
    ['listMedicationDoseEvents', { periodId: 7, limit: 30 }],
  ]);
});
