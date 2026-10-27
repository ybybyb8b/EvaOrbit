import assert from "node:assert/strict";
import test from "node:test";
import { apiErrorMessage, responseError } from "./response-error.ts";

test("decoded Health API errors preserve string messages and caller fallbacks", () => {
  assert.equal(apiErrorMessage({ error: "Saved locally; upload failed" }, "fallback"), "Saved locally; upload failed");
  assert.equal(apiErrorMessage({ error: "" }, "fallback"), "", "Keep existing decoded-body behavior");
  for (const value of [null, undefined, [], "error", 42, {}, { error: { message: "invalid" } }, { error: 500 }]) {
    assert.equal(apiErrorMessage(value, "调用方文案"), "调用方文案");
  }
});

test("client response errors handle JSON, empty bodies and upstream HTML without losing fallback copy", async () => {
  for (const status of [400, 401, 409, 500, 503]) {
    assert.equal(await responseError(Response.json({ error: "服务端文案" }, { status }), "fallback"), `服务端文案 (HTTP ${status}) [EO:http_${status}]`);
  }
  for (const response of [new Response(null, { status: 204 }), new Response("<html>Bad gateway</html>", { status: 502 }), Response.json({ error: "" }), Response.json({ error: 500 }), new Response("{bad json")]) {
    assert.equal(await responseError(response, "Could not save this record"),response.status>=400?`Could not save this record (HTTP ${response.status}) [EO:http_${response.status}]`:"Could not save this record");
  }
});

test("error parsing only consumes the supplied response, without fetching or retrying a mutation", async () => {
  let reads = 0;
  const response = new Response(null);
  response.json = async () => { reads++; throw new Error("Already consumed"); };
  assert.equal(await responseError(response, "Request failed."), "Request failed.");
  assert.equal(reads, 1);
});
