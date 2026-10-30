import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('server renders share repository identity and reads only within the current user request; MCP keeps its explicit identity', () => {
  const program = String.raw`
    import assert from 'node:assert/strict';
    import {readFileSync} from 'node:fs';
    import {AsyncLocalStorage} from 'node:async_hooks';
    import React from 'react';
    import ts from 'typescript';
    let owner = 'alice', factories = 0, reads = 0;
    const createSupabaseRepository = async () => {
      factories++;
      const user = owner;
      return { owner:user, getCalendarInterpretation:async()=>{reads++;return {user};}, getTimelineAssociation:async()=>({user}), getUiPreferences:async()=>({user}), listTrackers:async()=>[user] };
    };
    const require = name => {
      if(name==='server-only')return {};
      if(name==='node:async_hooks')return {AsyncLocalStorage};
      if(name==='react')return React;
      if(name==='../config')return {usesSupabase:()=>true};
      if(name==='./supabase')return {createSupabaseRepository,createMcpSupabaseRepository:async(token,userId)=>({owner:userId})};
      throw Error(name);
    };
    const exports={};
    const code=ts.transpileModule(readFileSync('src/lib/repositories/index.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    new Function('require','exports',code)(require,exports);
    const internals=React.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    const previous=internals.A;
    const startRender=()=>{
      const store=new Map();
      internals.A={getCacheForType(factory){if(!store.has(factory))store.set(factory,factory());return store.get(factory);}};
    };
    try {
      startRender();
      const [a,b]=await Promise.all([exports.getRepository(),exports.getRepository()]);
      assert.equal(a,b);assert.equal(factories,1);
      const [x,y]=await Promise.all([a.getCalendarInterpretation(),b.getCalendarInterpretation()]);
      assert.equal(x,y);assert.equal(reads,1);assert.equal(x.user,'alice');
      owner='bob';startRender();
      const next=await exports.getRepository();assert.notEqual(next,a);assert.equal(factories,2);
      assert.equal((await next.getCalendarInterpretation()).user,'bob');assert.equal(reads,2);
      assert.equal((await a.getTimelineAssociation()).user,'alice');
      assert.equal((await next.getTimelineAssociation()).user,'bob');
      await exports.withMcpRequestRepository({accessToken:'test-token',userId:'mcp-user'},async()=>{
        assert.equal((await exports.getRepository()).owner,'mcp-user');
      });
      assert.equal((await exports.getRepository()).owner,'bob');
    } finally {internals.A=previous;}
  `;
  const result=spawnSync(process.execPath,['--conditions=react-server','--input-type=module','--eval',program],{encoding:'utf8',timeout:10000});
  assert.equal(result.status,0,result.stderr||result.stdout);
});
