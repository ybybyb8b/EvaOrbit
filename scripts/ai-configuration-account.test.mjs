import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

test('local AI settings reject a switched authenticated account before the API runs',async()=>{
 let claims={sub:'account-a',email:'canary@example.invalid'};
 const source=ts.transpileModule(readFileSync('src/lib/supabase/proxy.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 const imports={
  '@supabase/ssr':{createServerClient:()=>({auth:{getClaims:async()=>({data:{claims}})}})},
  'next/server':{NextResponse:{next:()=>new Response(null),json:(...args)=>Response.json(...args),redirect:url=>Response.redirect(url)}},
  '../config':{usesSupabase:()=>true,isAllowedAccountEmail:email=>email==='canary@example.invalid',allowedEmail:()=> 'canary@example.invalid',supabaseConfig:()=>({url:'https://canary.invalid',publishableKey:'fake'})},
 };
 const exports={};new Function('require','exports',source)(name=>{assert(name in imports,name);return imports[name];},exports);
 const request=(account,path='/api/ai/providers')=>({nextUrl:new URL('https://canary.invalid'+path),url:'https://canary.invalid'+path,headers:new Headers(account?{'X-EvaOrbit-Account':account}:{}),cookies:{getAll:()=>[],set(){}}});
 assert.equal((await exports.updateSession(request('account-a'))).status,200);
 assert.equal((await exports.updateSession(request('account-a'))).headers.get('Cache-Control'),'no-store');
 const switched=await exports.updateSession(request('account-b'));assert.equal(switched.status,409);assert.match((await switched.json()).error,/account changed/i);
 assert.equal((await exports.updateSession(request())).status,200,'Existing Web settings keep their authentication behavior');
 for (const path of ['/api/preferences/life-day','/api/calendar-interpretation','/api/tasks','/api/media','/api/health/weight']) {
  assert.equal((await exports.updateSession(request('account-a',path))).status,200);
  assert.equal((await exports.updateSession(request('account-a',path))).headers.get('Cache-Control'),'no-store');
  assert.equal((await exports.updateSession(request('account-b',path))).status,409,'Cloud preferences reject a switched account before writing');
  assert.equal((await exports.updateSession(request(undefined,path))).status,200,'Existing Web preference forms remain compatible');
 }
 claims={};assert.equal((await exports.updateSession(request('account-a'))).status,401);
});
