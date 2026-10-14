import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import test from "node:test";

test("SQLite active period reads preserve default history and existing from/to semantics", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "evaorbit-period-history-"));
  try {
    const program = String.raw`
      import assert from "node:assert/strict";
      import { getRepository } from "./src/lib/repositories/index.ts";
      const repository = await getRepository();
      const old = await repository.createMenstrualPeriod({ startedOn: "2025-12-01", endedOn: "2025-12-05", notes: "old" });
      const recent = await repository.createMenstrualPeriod({ startedOn: "2026-09-01", endedOn: "2026-09-05", notes: "recent" });
      const active = await repository.createMenstrualPeriod({ startedOn: "2026-01-01", endedOn: null, notes: "active" });
      assert.deepEqual((await repository.listMenstrualPeriods()).map(item => item.id), [recent.id, active.id, old.id]);
      assert.deepEqual((await repository.listMenstrualPeriods({ from: "2026-04-14" })).map(item => item.id), [recent.id]);
      assert.deepEqual((await repository.listMenstrualPeriods({ activeOnly: true })).map(item => item.id), [active.id]);
      assert.deepEqual(await repository.listMenstrualPeriods({ activeOnly: true, from: "2026-04-14" }), []);
      assert.deepEqual((await repository.listMenstrualPeriods({ to: "2026-01-01" })).map(item => item.id), [old.id]);
    `;
    const loader = pathToFileURL(path.join(process.cwd(), "scripts/typescript-test-loader.mjs")).href;
    const result = spawnSync(process.execPath, ["--conditions=react-server", "--experimental-loader", loader, "--input-type=module", "--eval", program], { encoding: "utf8", timeout: 30000, env: { ...process.env, NODE_ENV: "development", EVAORBIT_DATA_BACKEND: "sqlite", EVAORBIT_SQLITE_PATH: path.join(directory, "history.db"), VERCEL: "" } });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
});
