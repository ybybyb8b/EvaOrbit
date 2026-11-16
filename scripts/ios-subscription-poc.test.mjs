import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {load} = require('js-yaml');
const workflow = load(readFileSync('.github/workflows/ios-native-host.yml', 'utf8'));
const steps = workflow.jobs.build.steps;
const bash = process.platform === 'win32' && existsSync('C:/Program Files/Git/bin/bash.exe')
  ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const run = (script, env) => spawnSync(bash, ['-c', script.replaceAll('\r\n', '\n')], {
  encoding: 'utf8', env: {...process.env, ...env}, timeout: 10000,
});

test('SIWC package admission rejects online Host, non-test branches and push triggers', () => {
  const script = steps.find(step => step.name === 'Validate subscription PoC isolation').run;
  const valid = {SUBSCRIPTION_POC: 'true', LOCAL_TRACKERS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/codex/parlor-native-test'};
  assert.equal(run(script, valid).status, 0);
  for (const invalid of [{LOCAL_TRACKERS: 'false'}, {GITHUB_EVENT_NAME: 'push'}, {GITHUB_REF: 'refs/heads/main'}]) {
    const result = run(script, {...valid, ...invalid});
    assert.equal(result.status, 1, result.stderr);
  }
  assert.equal(run(script, {...valid, SUBSCRIPTION_POC: 'false'}).status, 0);
  assert.equal(workflow.on.workflow_dispatch.inputs.subscription_poc.default, false);
});

test('device build keeps the normal signing chain and enables SIWC only in the requested package', () => {
  const raw = steps.find(step => step.name === 'Build ad-hoc signed device app').run;
  // Execute the real build command with a harmless stub, including its actual shell quoting.
  const script = 'xcodebuild() { printf "%s\\n" "$@"; }\n' + raw.replace(/\$\{\{[^}]+\}\}/g, 'TEST');
  for (const enabled of ['false', 'true']) {
    const result = run(script, {SUBSCRIPTION_POC: enabled, RUNNER_TEMP: '/tmp/mock runner', GITHUB_RUN_NUMBER: '123'});
    assert.equal(result.status, 0, result.stderr);
    const args = result.stdout.trim().split(/\r?\n/);
    assert(args.includes('Release')); assert(args.includes('iphoneos'));
    assert(args.includes('CODE_SIGN_IDENTITY=-')); assert(args.includes('CODE_SIGNING_ALLOWED=YES'));
    assert.equal(args.includes('EVAORBIT_SUBSCRIPTION_POC=YES'), enabled === 'true');
    assert.equal(args.includes('SWIFT_ACTIVE_COMPILATION_CONDITIONS=$(inherited) PARLOR_SUBSCRIPTION_POC'), enabled === 'true');
  }
  const project = load(readFileSync('ios/EvaOrbitHost/project.yml', 'utf8'));
  assert.equal(project.targets.EvaOrbitHost.settings.base.EVAORBIT_SUBSCRIPTION_POC, 'NO');
});
