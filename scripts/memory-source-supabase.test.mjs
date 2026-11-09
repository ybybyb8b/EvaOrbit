import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("Supabase Source PATCH preserves omission and sends explicit JSON nulls", () => {
  const program = String.raw`
    import assert from "node:assert/strict";
    import { createMcpSupabaseRepository } from "./src/lib/repositories/supabase.ts";
    const patches = [];
    globalThis.fetch = async (input, options) => {
      const url = new URL(input);
      assert.equal(url.origin, "https://source-review.invalid");
      assert.equal(url.pathname, "/rest/v1/memory_sources");
      assert.equal(url.searchParams.get("id"), "eq.source");
      assert.equal(options.method, "PATCH");
      patches.push(JSON.parse(options.body));
      return Response.json([]);
    };
    const repo = await createMcpSupabaseRepository("test-token", "test-user");
    const excerpt = " \tExact quotation.\n";
    await repo.updateMemorySource("source", { excerpt, sourceRecordId: undefined });
    await repo.updateMemorySource("source", { sourceRecordId: null, excerpt: null });
    await repo.updateMemorySource("source", { sourceUrl: "", note: "" });
    await repo.updateMemorySource("source", { sourceRecordId: "\uFEFF  opaque  ", sourceUrl: " https://example.test/ ", note: " note " });
    const invalidSource = { sourceResource: "chat", excerpt: "A\u0000B" };
    await assert.rejects(() => repo.updateMemorySource("source", { excerpt: invalidSource.excerpt }), /NUL/);
    await assert.rejects(() => repo.createMemorySource(invalidSource), /NUL/);
    await assert.rejects(() => repo.submitMemoryFactCandidate({ proposedSources: [invalidSource] }), /NUL/);
    assert.deepEqual(patches, [
      { excerpt },
      { source_record_id: null, excerpt: null },
      { source_url: null, note: null },
      { source_record_id: "opaque", source_url: "https://example.test/", note: "note" },
    ]);
  `;
  const loader = new URL("./typescript-test-loader.mjs", import.meta.url).href;
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--experimental-loader", loader, "--input-type=module", "--eval", program], {
    encoding: "utf8",
    timeout: 30000,
    env: { ...process.env, SUPABASE_URL: "https://source-review.invalid", SUPABASE_PUBLISHABLE_KEY: "test-key" },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
