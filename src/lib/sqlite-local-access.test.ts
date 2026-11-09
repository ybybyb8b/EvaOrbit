import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {allowsSqliteLocalRequest} from "./sqlite-local-access.ts";

test("SQLite access fails closed and rejects remote hosts, forwarding and CSRF",()=>{
  const headers=new Headers({host:"127.0.0.1:3000","x-forwarded-for":"127.0.0.1"});
  assert.equal(allowsSqliteLocalRequest(headers,false),false);assert.equal(allowsSqliteLocalRequest(headers,true),true);
  for(const patch of [
    {host:"192.168.1.2:3000"},{host:"evil.example"},{host:"127.0.0.1.evil.example"},
    {"x-forwarded-for":"10.0.0.1"},{"x-forwarded-for":"127.0.0.1, 10.0.0.1"},
    {forwarded:"for=127.0.0.1"},{"x-forwarded-host":"evil.example"},
    {origin:"https://evil.example"},{"sec-fetch-site":"cross-site"},
  ]) {
    const attempt=new Headers(headers);for(const[k,v]of Object.entries(patch))attempt.set(k,v);
    assert.equal(allowsSqliteLocalRequest(attempt,true),false,JSON.stringify(patch));
  }
});

test("local launcher refuses listener overrides before starting; proxy guards exempt APIs too",()=>{
  const result=spawnSync(process.execPath,["scripts/dev-local.mjs","--hostname","0.0.0.0"],{encoding:"utf8"});
  assert.notEqual(result.status,0);assert.match(result.stderr,/always binds to 127.0.0.1/);
  const proxy=readFileSync(new URL("../proxy.ts",import.meta.url),"utf8");
  assert.ok(proxy.indexOf("allowsSqliteLocalRequest(request.headers")<proxy.indexOf('pathname === "/api/mcp"'));
  assert.match(proxy,/!process.env.VERCEL/);assert.match(proxy,/matcher: \["\/api\/:path\*"/);
});
