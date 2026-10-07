import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const expectedTools = [
  "eo_resources",
  "eo_schema",
  "eo_search",
  "eo_get",
  "eo_create",
  "eo_update",
  "eo_delete",
  "eo_action",
];

test("MCP tools/list exposes only the 8 generic tools", () => {
  const source = readFileSync(new URL("./mcp/server.ts", import.meta.url), "utf8");
  const genericSource = readFileSync(new URL("./mcp/resource-tools.ts", import.meta.url), "utf8");
  const registered = [...`${source}\n${genericSource}`.matchAll(/server\.registerTool\("([a-z_]+)"/g)].map((match) => match[1]);
  assert.deepEqual(registered, expectedTools);
  assert.equal(new Set(registered).size, 8);
  assert.doesNotMatch(source, /MCP_TOOL_NAMES/);
});

test("generic resource remains a plain string in every fixed tool schema", () => {
  const source = readFileSync(new URL("./mcp/resource-tools.ts", import.meta.url), "utf8");
  assert.match(source, /const resource = z\.string\(\)/);
  assert.doesNotMatch(source, /const resource = z\.enum/);
  assert.match(source, /server\.registerTool\("eo_resources"/);
  assert.match(source, /server\.registerTool\("eo_action"/);
});
