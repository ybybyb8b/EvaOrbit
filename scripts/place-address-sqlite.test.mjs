import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("Places fold legacy areas into addresses across read, search, patch and old clients", () => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"eo-place-address-"));
  try {
    const result=spawnSync(process.execPath,["--experimental-loader","./scripts/typescript-test-loader.mjs","--input-type=module","--eval",`
      import assert from "node:assert/strict";
      import * as db from "./src/lib/db.ts";
      import * as food from "./src/lib/services/food.ts";
      import {parseFoodPlace,parseFoodPlacePatch} from "./src/lib/validation.ts";
      const old=db.createFoodPlace(parseFoodPlace({name:"旧店",city:"成都",branch:"中心店",location:"高新区",address:"天府大道 1 号"}));
      const read=await food.getFoodPlace(old.id);
      assert.equal(read.address,"高新区 · 天府大道 1 号");assert.equal(read.location,"");
      assert.equal((await food.getFoodPlaceDetail(old.id)).place.address,read.address);
      assert.equal((await food.listFoodPlaces("天府大道"))[0].id,old.id);
      assert.equal((await food.listFoodPlaces("高新区"))[0].address,read.address);
      assert.equal(db.getFoodPlace(old.id).location,"高新区","read has no writes");
      const patched=await food.updateFoodPlace(old.id,parseFoodPlacePatch({notes:"仅改备注"}));
      assert.equal(patched.address,read.address);assert.equal(db.getFoodPlace(old.id).location,"");
      assert.equal((await food.updateFoodPlace(old.id,{notes:"再次保存"})).address,read.address);
      assert.equal((await food.updateFoodPlace(old.id,{address:""})).address,"");
      assert.equal((await food.getFoodPlace(old.id)).address,"");
      const legacy=await food.createFoodPlace(parseFoodPlace({name:"旧客户端",location:"商圈",address:"路 2 号"}));
      assert.equal(legacy.address,"商圈 · 路 2 号");assert.equal(legacy.location,"");
      assert.equal((await food.updateFoodPlace(legacy.id,{location:"街区"})).address,"街区 · 商圈 · 路 2 号");
      assert.equal((await food.updateFoodPlace(legacy.id,{address:"完整新地址"})).address,"完整新地址");
      const long=db.createFoodPlace(parseFoodPlace({name:"长地址",location:"区".repeat(200),address:"路".repeat(500)}));
      const longRead=await food.getFoodPlace(long.id);
      assert.equal(longRead.address.length,703);
      assert.equal((await food.updateFoodPlace(long.id,parseFoodPlacePatch({address:longRead.address}))).address,longRead.address);
      await assert.rejects(()=>food.createFoodPlace(parseFoodPlace({name:"过长",location:"区".repeat(200),address:"路".repeat(1000)})),/1000/);
      assert.equal((await food.getFoodPlaceDetail(legacy.id)).place.city,"");
    `],{cwd:process.cwd(),encoding:"utf8",env:{...process.env,EVAORBIT_DATA_BACKEND:"sqlite",EVAORBIT_SQLITE_PATH:path.join(directory,"places.db"),VERCEL:"",NODE_ENV:"development"}});
    assert.equal(result.status,0,result.stderr||result.stdout);
  } finally {fs.rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});
