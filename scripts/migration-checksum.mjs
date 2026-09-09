import { createHash } from "node:crypto";

function sha256(source) {
  return createHash("sha256").update(source).digest("hex");
}

export function normalizeMigrationSource(source) {
  return source.replace(/\r\n?/g, "\n");
}

export function migrationChecksums(source) {
  const normalized = normalizeMigrationSource(source);
  return {
    canonical: sha256(normalized),
    compatible: new Set([sha256(normalized), sha256(normalized.replaceAll("\n", "\r\n"))]),
  };
}
