import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readWorkflow = (name) =>
  readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8");

test("Tracker PoC development branch cannot trigger a Vercel Git deployment", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.equal(config.git.deploymentEnabled["codex/tracker-local-first-poc"], false);
  assert.equal(config.git.deploymentEnabled.main, undefined, "Leave production branch deployment policy unchanged");
});

test("build workflows use Node 24 actions without insecure runtime overrides", () => {
  for (const name of ["ios-native-host", "xtool-patched"]) {
    const workflow = readWorkflow(name);
    assert.match(workflow, /uses: actions\/checkout@v5\b/);
    assert.match(workflow, /uses: actions\/upload-artifact@v6\b/);
    assert.doesNotMatch(workflow, /actions\/(?:checkout|upload-artifact)@v4\b|ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION/);
  }
});

test("Intel runner selection preserves native signing and packaging", () => {
  const workflow = readWorkflow("ios-native-host");
  assert.match(workflow, /runs-on: macos-15-intel\b/);
  assert.match(workflow, /name=iPhone 16 Pro/);
  assert.match(workflow, /CODE_SIGN_IDENTITY="-"/);
  assert.match(workflow, /CODE_SIGNING_ALLOWED=YES/);
  assert.match(workflow, /AD_HOC_CODE_SIGNING_ALLOWED=YES/);
  assert.match(workflow, /bash scripts\/ios\/package-ad-hoc-ipa\.sh/);
  assert.match(readWorkflow("xtool-patched"), /XTOOL_COMMIT: 2d58d987edff728fccebc6df643b1672e3583f00/);
});

test("Simulator tests use the selected SDK runtime, reuse their build and fail within bounded deadlines", () => {
  const workflow = readWorkflow("ios-native-host");
  const step = workflow.split("- name: Run native unit tests on iPhone 16 Pro Simulator")[1]?.split("- name: Upload native test diagnostics")[0];
  assert.ok(step, "Keep the complete native test step before packaging");
  assert.match(step, /timeout-minutes: 10\b/);
  assert.match(step, /simulator_os="\$\(xcrun --sdk iphonesimulator --show-sdk-version\)"/);
  assert.match(step, /name=iPhone 16 Pro,OS=\$simulator_os/);
  assert.match(step, /-destination-timeout 60\b/);
  assert.match(step, /-parallel-testing-enabled NO\b/);
  assert.match(step, /-test-timeouts-enabled YES\b/);
  assert.match(step, /-maximum-test-execution-time-allowance 120\b/);
  assert.match(step, /test-without-building/);
  const compilation = workflow.split("- name: Compile host and tests for Simulator")[1]?.split("- name: Run native unit tests")[0];
  const derivedData = text => text.match(/-derivedDataPath "([^"]+)"/)?.[1];
  assert.ok(derivedData(compilation));
  assert.equal(derivedData(step), derivedData(compilation));
  assert.doesNotMatch(step, /continue-on-error|skip-testing|only-testing/);
  assert.match(workflow, /- name: Upload native test diagnostics\s+if: always\(\)/);
});
