import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/app/login/actions.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

test("login distinguishes network failures from rejected credentials and preserves successful redirects", async () => {
  for (const [error, destination] of [
    [{ name: "AuthRetryableFetchError", status: 0 }, "/login?error=network"],
    [{ name: "AuthApiError", status: 503 }, "/login?error=network"],
    [{ name: "AuthApiError", status: 400 }, "/login?error=invalid"],
    [null, "/health"],
  ]) {
    const moduleState = { exports: {} };
    const stubs = {
      "next/navigation": { redirect: path => { throw new Error(`redirect:${path}`); } },
      "@/lib/config": { allowedEmail: () => "owner@example.com", usesSupabase: () => true },
      "@/lib/supabase/server": { createSupabaseServerClient: async () => ({ auth: { signInWithPassword: async credentials => {
        assert.equal(credentials.email, "owner@example.com");
        assert.equal(credentials.password, "example password");
        return { error };
      } } }) },
    };
    runInNewContext(compiled, { module: moduleState, exports: moduleState.exports, process: { env: { NODE_ENV: "test" } }, require: name => stubs[name] });
    const form = new FormData();
    form.set("email", " Owner@Example.COM "); form.set("password", "example password"); form.set("next", "/health");
    await assert.rejects(moduleState.exports.login(form), { message: `redirect:${destination}` });
  }
});
