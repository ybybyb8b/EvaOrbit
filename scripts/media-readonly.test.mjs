import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

test('Media snapshot preserves bounded full history and covers behind a business-write blockade',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'eo-main-media-readonly-'));
 try {
  const result=spawnSync(process.execPath,['--experimental-loader',pathToFileURL(path.resolve('scripts/typescript-test-loader.mjs')).href,'--input-type=module','--eval',String.raw`
   import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
   import {seedMedia} from './scripts/media-readonly-fixture.mjs';
   import {getRepository,withMediaReadOnlyRepository} from './src/lib/repositories/index.ts';
   import {getMediaReadonlySnapshot} from './src/lib/services/media-readonly.ts';
   import {readMediaSnapshot,validateMediaSnapshot} from './src/lib/media-readonly.ts';
   const {series,items}=await seedMedia(),repository=await getRepository();
   for(let n=0;n<205;n++)await repository.createMediaItem({...items[2],title:'New '+n,originalTitle:'New '+n});
   const db=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
   for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all())for(const op of ['INSERT','UPDATE','DELETE'])db.exec('CREATE TRIGGER "media_no_'+op+'_'+name+'" BEFORE '+op+' ON "'+name+'" BEGIN SELECT RAISE(ABORT,\'Media readonly wrote business data\');END;');
   const snapshot=await getMediaReadonlySnapshot('account-a');assert.equal(snapshot.items.length,210);
   const historical=snapshot.items.find(item=>item.id===items[0].id);assert.equal(historical.seasonNumber,1);assert(historical.viewings.length>0);assert.match(historical.coverUrl,/^data:image\/png;base64,/);
   assert.equal((await readMediaSnapshot(snapshot,'/api/media?q=Reacher').json()).length,2);
   assert.equal((await readMediaSnapshot(snapshot,'/api/media/series/'+series.id).json()).id,series.id);
   for(const method of ['POST','PUT','PATCH','DELETE'])assert.throws(()=>readMediaSnapshot(snapshot,'/api/media',{method}));
   for(const mutate of [s=>s.accountId='other',s=>s.items.push(s.items[0]),s=>s.series[0].itemCount++,s=>s.items[0].coverUrl='https://invalid.test/image']){const bad=structuredClone(snapshot);mutate(bad);assert.throws(()=>validateMediaSnapshot(bad,'account-a'));}
   await assert.rejects(withMediaReadOnlyRepository(async()=>(await getRepository()).deleteMediaItem(items[0].id)),/refused/);
   db.close();
  `],{encoding:'utf8',env:{...process.env,EVAORBIT_DATA_BACKEND:'sqlite',EVAORBIT_SQLITE_PATH:path.join(dir,'db.sqlite'),EVAORBIT_MEDIA_COVER_DIR:path.join(dir,'covers'),VERCEL:''}});
  assert.equal(result.status,0,result.stderr||result.stdout);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
