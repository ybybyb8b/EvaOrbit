import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const source=p=>readFileSync(p,'utf8');

test('Native Parlor has no computer-agent transport or plugin and keeps visual preferences',()=>{
  const routes=JSON.parse(source('src/lib/business-routes.json'));
  assert(!routes.some(r=>r.pattern.includes('hermes')));
  for(const p of ['src/app/api/hermes/route.ts','src/app/api/hermes/notify/route.ts','src/components/hermes-chat.tsx','src/lib/hermes.ts','integrations/hermes-evaorbit/adapter.py'])assert(!existsSync(p),p);
  const entry=source('src/local-trackers/native-eva-entry.tsx');
  assert(!entry.includes('Hermes'));assert(entry.includes('ParlorUnavailable'));
  const activity=source('src/components/parlor-activity.tsx');
  assert(activity.includes('evaCall<EvaState>'));assert(!activity.includes('fetch('));assert(!activity.includes('/api/hermes'));
  const chat=source('src/components/native-eva-chat.tsx');
  assert(chat.includes('ParlorMessageBody'));assert(!chat.includes('onLegacy'));
  assert(source('src/components/parlor-message.tsx').includes('renderBlock='));
  assert(source('src/components/parlor-appearance-sheet.tsx').includes('evaorbit.hermes.segmentReplies:'));
  assert(source('src/lib/parlor-appearance.ts').includes('eo-hermes-appearance'));
});

test('Native test branch cannot trigger Vercel or an automatic online-Host package',()=>{
  assert.equal(JSON.parse(source('vercel.json')).git.deploymentEnabled['codex/parlor-native-test'],false);
  const workflow=source('.github/workflows/ios-native-host.yml');
  assert(workflow.includes('branches-ignore: ["codex/parlor-native-test"]'));
  assert(workflow.includes('workflow_dispatch:'));
  assert(workflow.includes('EVAORBIT_LOCAL_TRACKERS='));
});
