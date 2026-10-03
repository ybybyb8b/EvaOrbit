import assert from "node:assert/strict";
import { test } from "node:test";
import { selectDropdownLayout } from "./select-dropdown-layout.ts";

test("dropdown attaches below the field and bounds long lists without changing field geometry", () => {
  const field = { left: 40, top: 120, bottom: 164, width: 300 };
  assert.deepEqual(selectDropdownLayout(field, { left: 0, top: 0, width: 1280, height: 900 }, 3000), { left: 40, top: 170, width: 300, maxHeight: 320 });
});

test("dropdown stays inside the visible viewport when keyboard space shrinks or scroll offsets move", () => {
  for (const viewport of [{ left: 0, top: 0, width: 402, height: 360 }, { left: 20, top: 180, width: 320, height: 240 }]) {
    for (const top of [100, 350, 600]) {
      const layout = selectDropdownLayout({ left: 2, top, bottom: top + 44, width: 600 }, viewport, 3000);
      assert.ok(layout.left >= viewport.left + 12);
      assert.ok(layout.left + layout.width <= viewport.left + viewport.width - 12);
      assert.ok(layout.top >= viewport.top + 12);
      assert.ok(layout.top + layout.maxHeight <= viewport.top + viewport.height - 12);
    }
  }
});
