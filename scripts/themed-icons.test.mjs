import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import sharp from "sharp";

test("all feature and navigation icons have transparent, harmonized assets in every theme and mode, cached for offline use", async () => {
  const worker = await readFile("public/sw.js", "utf8");
  const cached = vm.runInNewContext(`${worker}\nSTATIC_ASSETS`, { self: { addEventListener() {} }, URL });
  assert.equal(new Set(cached).size, cached.length);
  const families = {
    features: (await readdir("public/icons/features")).filter(name => name.endsWith(".png") && !name.endsWith("-dark.png")).map(name => name.slice(0, -4)),
    nav: ["home", "lucius", "settings"],
  };
  let count = 0;
  for (const theme of ["editorial", "rosewood", "powderblue", "mistviolet"]) {
    for (const mode of ["light", "dark"]) {
      for (const [family, names] of Object.entries(families)) for (const name of names) {
        const asset = `/icons/themes/${theme}/${family}/${name}${mode === "dark" ? "-dark" : ""}.png`;
        assert(cached.includes(asset), `offline cache missing ${asset}`);
        const { data, info } = await sharp(`public${asset}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        assert.equal(info.width, 512, asset);
        assert.equal(info.height, 512, asset);
        let visible = 0, transparent = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (!data[i + 3]) { transparent++; continue; }
          visible++;
          const [r, g, b] = data.subarray(i, i + 3);
          const inPalette = theme === "editorial" ? g >= r && g >= b
            : theme === "rosewood" ? r >= g && r >= b
            : theme === "powderblue" ? b >= g && g >= r
            : b >= r && r >= g;
          assert(inPalette, `${asset}: unexpected hue ${r},${g},${b}`);
        }
        assert(visible > 1000 && transparent > 1000, `${asset}: lost artwork or transparency`);
        count++;
      }
    }
  }
  assert.equal(count, 208);
});
