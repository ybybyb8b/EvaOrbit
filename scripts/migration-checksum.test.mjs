import assert from "node:assert/strict";
import test from "node:test";
import { migrationChecksums, normalizeMigrationSource } from "./migration-checksum.mjs";

test("migration checksums are portable between LF and CRLF checkouts", () => {
  const lf = "begin;\nselect 1;\ncommit;\n";
  const crlf = lf.replaceAll("\n", "\r\n");
  const canonical = migrationChecksums(lf).canonical;
  assert.equal(normalizeMigrationSource(crlf), lf);
  assert.equal(migrationChecksums(crlf).canonical, canonical);
  assert.equal(migrationChecksums(crlf).compatible.has(migrationChecksums(lf).canonical), true);
  assert.equal(migrationChecksums(lf).compatible.has(migrationChecksums(crlf.replace("select 1", "select 2")).canonical), false);
});
