import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

test("cat suggestions isolate pets and exclude doses and measurement values", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "evaorbit-cat-input-history-"));
  const loader = pathToFileURL(path.join(process.cwd(), "scripts/typescript-test-loader.mjs")).href;
  try {
    const result = spawnSync(process.execPath, ["--experimental-loader", loader, "--input-type=module", "--eval", `
      import assert from "node:assert/strict";
      import {createPet,createCatRecord,getCatInputHistory} from "./src/lib/services/cats.ts";
      import {parsePet,parseCatRecord} from "./src/lib/cats-validation.ts";
      const pets = await Promise.all([createPet(parsePet({name:"A"})),createPet(parsePet({name:"B"}))]);
      for (const pet of pets) {
        for (const input of [
          {kind:"symptom",title:pet.name+" symptom",severity:"轻微",bodyArea:"耳朵",occurredAt:"2026-10-03T04:00:00Z"},
          {kind:"vet_visit",clinic:pet.name+" clinic",doctor:pet.name+" doctor",reason:"复查",occurredAt:"2026-10-03T04:00:00Z"},
          {kind:"medication",name:pet.name+" medicine",dose:"1",unit:"片",frequencyText:"每天",startedAt:"2026-10-03T04:00:00Z"},
          {kind:"measurement",measurementType:"体重",value:4,unit:"kg",occurredAt:"2026-10-03T04:00:00Z"},
        ]) { const parsed=parseCatRecord({...input,petId:pet.id}); await createCatRecord(parsed.kind,parsed.record); }
      }
      const history=await getCatInputHistory(pets[0].id);
      assert.equal(history.length,4);
      assert.equal(history.find(item=>item.kind==="vet_visit").doctor,"A doctor");
      assert.equal(history.find(item=>item.kind==="medication").name,"A medicine");
      assert.ok(history.every(item=>!("dose" in item)&&!("value" in item)));
      assert.ok(!JSON.stringify(history).includes("B "));
      await assert.rejects(getCatInputHistory(999999));
    `], { encoding: "utf8", env: { ...process.env, EVAORBIT_DATA_BACKEND: "sqlite", EVAORBIT_SQLITE_PATH: path.join(directory,"test.db"), VERCEL: "" } });
    assert.equal(result.status,0,result.stderr || result.stdout);
  } finally { fs.rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:50}); }
});
