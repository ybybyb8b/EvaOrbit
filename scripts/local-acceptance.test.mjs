import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
test('missing optional assets do not block authenticated module snapshots',()=>{
 const dir=fs.mkdtempSync(path.resolve('tmp/acceptance-assets-'));
 const env={...process.env,EVAORBIT_DATA_BACKEND:'sqlite',EVAORBIT_SQLITE_PATH:path.join(dir,'isolated.db'),VERCEL:''};
 for(const [key,name] of [['EVAORBIT_CAT_AVATAR_DIR','cats'],['EVAORBIT_MEDIA_COVER_DIR','media'],['EVAORBIT_RELATION_PHOTO_DIR','relations'],['EVAORBIT_SUBSCRIPTION_ICON_DIR','subscriptions']])env[key]=path.join(dir,name);
 const run=spawnSync(process.execPath,['--experimental-loader',pathToFileURL(path.resolve('scripts/typescript-test-loader.mjs')).href,'--input-type=module','--eval',`import assert from 'node:assert/strict';import {seedAcceptance} from './scripts/local-acceptance-fixture.mjs';const s=await seedAcceptance('10000000-0000-4000-8000-000000000001');assert(s.cats.dashboard.pets.length);assert(s.media.items.length);assert(s.relations.people.length);assert(s.subscriptions.items.length);assert(s.cats.dashboard.pets.every(row=>!row.pet.avatarUrl));assert(s.media.items.every(row=>!row.coverUrl));assert(s.relations.people.every(row=>!row.photoPath));assert.deepEqual(s.subscriptions.iconSources,{});`],{encoding:'utf8',env});
 assert.equal(run.status,0,run.stderr||run.stdout);
});
