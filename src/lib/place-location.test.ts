import assert from "node:assert/strict";
import test from "node:test";
import { mergePlaceAddress, placeRecordLabel } from "./place-menu.ts";

test("Place address preserves legacy areas without repeating an existing address component", () => {
  assert.equal(mergePlaceAddress("", " 和悦广场 "), "和悦广场");
  assert.equal(mergePlaceAddress("天府大道 1 号", "高新区"), "高新区 · 天府大道 1 号");
  assert.equal(mergePlaceAddress("高新区天府大道 1 号", "高新区"), "高新区天府大道 1 号");
  assert.equal(mergePlaceAddress("", ""), "");
  assert.equal(mergePlaceAddress("路".repeat(500), "区".repeat(200)).length, 703);
});

test("record source labels prefer a branch, fall back to city and omit repeated suffixes", () => {
  assert.equal(placeRecordLabel({foodPlaceName:"霸碗盖码饭",foodPlaceBranch:"三利广场店",foodPlaceCity:"成都"}), "霸碗盖码饭 · 三利广场店");
  assert.equal(placeRecordLabel({foodPlaceName:"霸碗盖码饭",foodPlaceBranch:"",foodPlaceCity:"成都"}), "霸碗盖码饭 · 成都");
  assert.equal(placeRecordLabel({foodPlaceName:"霸碗盖码饭（三利广场店）",foodPlaceBranch:"三利广场店",foodPlaceCity:"成都"}), "霸碗盖码饭（三利广场店）");
  assert.equal(placeRecordLabel({foodPlaceName:"茶店",foodPlaceBranch:null,foodPlaceCity:null}), "茶店");
});
