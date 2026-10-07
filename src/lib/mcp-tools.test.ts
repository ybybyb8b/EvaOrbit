import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { registerGenericResourceTools } from "./mcp/resource-tools.ts";

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

test("registered tool descriptions discover personal context before schema lookup", () => {
  const descriptions = new Map<string, string>();
  const server = { registerTool(name: string, config: { description: string }) { descriptions.set(name, config.description); } };
  registerGenericResourceTools(server as unknown as Parameters<typeof registerGenericResourceTools>[0], async () => ({ content: [] }), {} as Parameters<typeof registerGenericResourceTools>[2]);
  for (const name of ["eo_resources", "eo_search"]) {
    const description = descriptions.get(name)!;
    assert.match(description, /personal context/);
    assert.match(description, /Memo/);
    assert.match(description, /Memory/);
  }
  assert.match(descriptions.get("eo_resources")!, /ordinary conversation/);
  assert.match(descriptions.get("eo_resources")!, /guess.*repeat/);
  assert.match(descriptions.get("eo_create")!, /explicit request/);
  assert.match(descriptions.get("eo_update")!, /relation_event.*complete/);
  assert.match(descriptions.get("eo_delete")!, /not universally a hard delete/);
});

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
