import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

for (const backend of ["sqlite", "pglite"]) {
  test(backend + " Memory pagination, filtering and recall through the Repository and MCP", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "eo-memory-page-"));
    try {
      const result = spawnSync(process.execPath, ["--conditions=react-server", "--experimental-loader",
        new URL("./typescript-test-loader.mjs", import.meta.url).href, "scripts/memory-pagination-fixture.mjs", backend], {
        encoding: "utf8", timeout: 60000,
        env: { ...process.env, DATABASE_URL: "", NODE_ENV: "development", VERCEL: "",
          EVAORBIT_DATA_BACKEND: "sqlite", EVAORBIT_SQLITE_PATH: path.join(dir, "page.db"),
          SUPABASE_URL: "https://memory-page.invalid", SUPABASE_PUBLISHABLE_KEY: "offline-test" },
      });
      assert.equal(result.status, 0, result.stderr || result.stdout);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
