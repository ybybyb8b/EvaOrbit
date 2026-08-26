import assert from "node:assert/strict";
import test from "node:test";
import { readSelfPersona } from "./persona.ts";

test("loads a non-empty Self Persona for the system prompt", () => {
  assert.ok(readSelfPersona().length > 40);
});
