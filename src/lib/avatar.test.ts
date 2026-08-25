import assert from "node:assert/strict";
import test from "node:test";
import { detectAvatarImage, MAX_AVATAR_BYTES } from "./avatar.ts";

test("accepts avatar image signatures and rejects HTML or SVG payloads", () => {
  assert.equal(detectAvatarImage(new Uint8Array([0xff, 0xd8, 0xff]))?.extension, "jpg");
  assert.equal(detectAvatarImage(new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))?.extension, "png");
  assert.equal(detectAvatarImage(new TextEncoder().encode("RIFFxxxxWEBP"))?.extension, "webp");
  assert.equal(detectAvatarImage(new TextEncoder().encode("<svg onload=alert(1)>")), null);
  assert.equal(detectAvatarImage(new TextEncoder().encode("<script>alert(1)</script>")), null);
  assert.equal(MAX_AVATAR_BYTES, 4194304);
});
