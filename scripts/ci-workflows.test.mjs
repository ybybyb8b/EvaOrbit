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
  assert.match(workflow, /CODE_SIGN_IDENTITY="-"/);
  assert.match(workflow, /CODE_SIGNING_ALLOWED=YES/);
  assert.match(workflow, /AD_HOC_CODE_SIGNING_ALLOWED=YES/);
  assert.match(workflow, /bash scripts\/ios\/package-ad-hoc-ipa\.sh/);
  assert.match(readWorkflow("xtool-patched"), /XTOOL_COMMIT: 2d58d987edff728fccebc6df643b1672e3583f00/);
});

test("IPA packaging omits Simulator execution and retains build validation", () => {
  const workflow = readWorkflow("ios-native-host");
  assert.doesNotMatch(workflow, /iphonesimulator|simctl|build-for-testing|test-without-building|Upload native test diagnostics/);
  assert.match(workflow, /npm run build:trackers/);
  assert.match(workflow, /node --test/);
  assert.match(workflow, /-sdk iphoneos/);
  assert.match(workflow, /-destination 'generic\/platform=iOS'/);
  assert.match(workflow, /name: Verify entitlements and package IPA/);
  assert.match(workflow, /name: Isolated Supabase Tracker integration/);
  assert.doesNotMatch(workflow, /continue-on-error/);
});
