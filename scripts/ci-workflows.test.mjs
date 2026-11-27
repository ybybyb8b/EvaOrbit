import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const { load } = createRequire(import.meta.url)("js-yaml");
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
    assert.match(workflow, /uses: actions\/upload-artifact@v[67]\b/);
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

test("IPA packaging defaults to device-only and requires an opted-in Simulator run to pass", () => {
  const workflow = readWorkflow("ios-native-host");
  const definition = load(workflow);
  assert.equal(definition.on.workflow_dispatch.inputs.run_native_tests.type, "boolean");
  assert.equal(definition.on.workflow_dispatch.inputs.run_native_tests.default, false);
  const steps = definition.jobs.build.steps;
  const native = steps.find(step => step.id === "native_tests");
  const diagnostics = steps.find(step => step.name === "Upload native test diagnostics");
  const device = steps.find(step => step.name === "Build ad-hoc signed device app");
  const ipa = steps.find(step => step.name === "Verify entitlements and package IPA");
  assert.equal(native.if, "${{ inputs.run_native_tests }}");
  assert.equal(native.shell, "bash", "Explicit bash enables pipefail for xcodebuild | tee");
  assert.match(native.run, /xcodebuild test[\s\S]*-scheme EvaOrbitHost[\s\S]*-resultBundlePath/);
  assert.doesNotMatch(native.run, /-only-testing|-skip-testing/);
  assert.match(native.run, /EVAORBIT_LOCAL_TRACKERS=YES/);
  assert.match(native.run, /IPHONEOS_DEPLOYMENT_TARGET=18\.4/);
  assert.doesNotMatch(device.run, /IPHONEOS_DEPLOYMENT_TARGET/);
  assert.match(diagnostics.if, /always\(\).*inputs\.run_native_tests.*native_tests\.outcome != 'skipped'/);
  assert.equal(diagnostics.with.path, "${{ runner.temp }}/EvaOrbitHost-Tests");
  assert.equal(device.if, "${{ success() && (!inputs.run_native_tests || steps.native_tests.outcome == 'success') }}");
  assert.equal(ipa.if, undefined, "IPA packaging must inherit success() after device build");
  const positions = [native, diagnostics, device, ipa].map(step => steps.indexOf(step));
  assert.ok(positions.every((position, index) => position > (positions[index - 1] ?? -1)));
  assert.match(workflow, /npm run build:trackers/);
  assert.match(workflow, /node --test/);
  assert.match(workflow, /-sdk iphoneos/);
  assert.match(workflow, /-destination 'generic\/platform=iOS'/);
  assert.match(workflow, /name: Verify entitlements and package IPA/);
  assert.match(workflow, /uses: actions\/upload-artifact@v7\s+with:\s+path: \$\{\{ runner\.temp \}\}\/EvaOrbitHost-Artifact\/EvaOrbitHost-ad-hoc\.ipa\s+archive: false/);
  assert.match(workflow, /name: Isolated Supabase Tracker integration/);
  assert.doesNotMatch(workflow, /continue-on-error/);
});


test("all IPA triggers use the local Native Host and validate the disposable stack first",()=>{
 const workflow=load(readWorkflow("ios-native-host"));
 assert.equal(workflow.on.workflow_dispatch.inputs.local_trackers,undefined);
 assert.equal(workflow.jobs.build.needs,"tracker-isolation");
 assert.equal(workflow.jobs["tracker-isolation"].if,undefined);
 assert.equal(workflow.jobs["tracker-isolation"].needs,undefined);
 const device=workflow.jobs.build.steps.find(step=>step.name==="Build ad-hoc signed device app");
 assert.match(device.run,/EVAORBIT_LOCAL_TRACKERS=YES/);
 assert.match(device.run,/PRODUCT_BUNDLE_IDENTIFIER="com\.evaorbit\.nativehost\.trackerspoc"/);
 assert.match(device.run,/EVAORBIT_URL_SCHEME="evaorbit-trackers-poc"/);
 assert.equal(workflow.jobs.build.steps.find(step=>step.name==="Validate subscription PoC isolation").env.LOCAL_TRACKERS,"true");
});
