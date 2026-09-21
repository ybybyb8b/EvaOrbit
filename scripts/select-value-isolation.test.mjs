import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";

test("select options keep submitted values separate from translated labels", () => {
  const files = execFileSync("git", ["ls-files", "src/app/**/*.tsx", "src/components/**/*.tsx"], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);
  const missing = files.flatMap((file) => [...readFileSync(resolve(file), "utf8").matchAll(/<option(?![^>]*\bvalue=)[^>]*>/g)].map((match) => `${file}:${match[0]}`));
  assert.deepEqual(missing, []);
});
