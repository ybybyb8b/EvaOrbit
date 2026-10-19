import assert from "node:assert/strict";
import test from "node:test";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import {readCatsSnapshot,validateCatsSnapshot} from "../src/lib/cats-readonly.ts";

const empty=()=>({format:"eo-cats-readonly-v1",accountId:"a",capturedAt:"2026-10-19T00:00:00Z",dashboard:{pets:[],household:[],routines:[],oneTimeTasks:[],timeline:[]},details:[],foods:[],records:[]});
test("Cats snapshot account, completeness, bounds and read-only paths",async()=>{
  const value=empty();assert.equal(validateCatsSnapshot(value,"a"),value);
  assert.throws(()=>validateCatsSnapshot(value,"b"));
  assert.throws(()=>validateCatsSnapshot({...value,extra:"x".repeat(8*1024*1024)},"a"),/8 MiB/);
  assert.throws(()=>validateCatsSnapshot({...value,dashboard:{...value.dashboard,timeline:[{id:1,kind:"event",petId:null,occurredAt:value.capturedAt}]}},"a"));
  assert.throws(()=>readCatsSnapshot(value,"/api/cats",{method:"POST"}));
  for(const url of ["https://evil.invalid/api/cats","/api/cats/../session","/api/cats/pets/1/avatar","/api/cats/food/1/consume"])assert.throws(()=>readCatsSnapshot(value,url));
  assert.equal(readCatsSnapshot(value,"/api/cats/pets/1").status,404);
  assert.deepEqual(await readCatsSnapshot(value,"/api/cats").json(),value.dashboard);
});
test("Actual Cats aggregation, photos, all record kinds and stock read without business writes",()=>{
  const directory=mkdtempSync(path.join(tmpdir(),"eo-cats-readonly-"));
  try{
    const result=spawnSync(process.execPath,["--experimental-loader",pathToFileURL(path.resolve("scripts/typescript-test-loader.mjs")).href,"--input-type=module","--eval",String.raw`
      import assert from 'node:assert/strict';
      import {DatabaseSync} from 'node:sqlite';
      import {seedCats} from './scripts/cats-readonly-fixture.mjs';
      import {getCatsReadonlySnapshot} from './src/lib/services/cats-readonly.ts';
      import {getRepository,withCatsReadOnlyRepository} from './src/lib/repositories/index.ts';
      import {validateCatsSnapshot,readCatsSnapshot} from './src/lib/cats-readonly.ts';
      const {pet,item}=await seedCats();
      const db=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
      for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all())for(const op of ['INSERT','UPDATE','DELETE'])db.exec('CREATE TRIGGER "cats_no_'+op+'_'+name+'" BEFORE '+op+' ON "'+name+'" BEGIN SELECT RAISE(ABORT,\'Cats GET wrote business data\'); END;');
      const snapshot=await getCatsReadonlySnapshot('a');validateCatsSnapshot(snapshot,'a');
      assert.equal(snapshot.dashboard.pets[0].pet.name,'Offline Luna');
      assert.match(snapshot.details[0].pet.avatarUrl,/^data:image\/png;base64,/);
      assert.equal(new Set(snapshot.records.map(r=>r.kind)).size,5);
      assert.equal(snapshot.details[0].routines.length,1);
      assert.equal(snapshot.foods[0].stockPackages,1);
      assert.equal((await readCatsSnapshot(snapshot,'/api/cats/food/'+item.id).json()).purchases[0].merchant,'Canary shop');
      for(const row of snapshot.records){const record=await readCatsSnapshot(snapshot,'/api/cats/records/'+row.kind+'/'+row.id).json();assert.equal(record.petId,pet.id);if(row.kind!=='medication')assert.equal(record.occurredHasExplicitTime,false);else assert.equal(record.startedHasExplicitTime,false);}
      await assert.rejects(withCatsReadOnlyRepository(async()=>(await getRepository()).updatePet(pet.id,{name:'NO'})),/refused/);
      await assert.rejects(withCatsReadOnlyRepository(async()=>(await getRepository()).updateCatFoodPurchase(1,{remainingPackageCount:0})),/refused/);
      db.close();
    `],{encoding:"utf8",env:{...process.env,EVAORBIT_DATA_BACKEND:"sqlite",EVAORBIT_SQLITE_PATH:path.join(directory,"test.db"),EVAORBIT_CAT_AVATAR_DIR:path.join(directory,"avatars"),VERCEL:""}});
    assert.equal(result.status,0,result.stderr||result.stdout);
  }finally{rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});
