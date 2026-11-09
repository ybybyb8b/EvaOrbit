import {randomUUID} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {request as httpRequest} from "node:http";
import test from "node:test";
import assert from "node:assert/strict";
import {spawn,spawnSync} from "node:child_process";
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {createServer,createConnection} from "node:net";
import {networkInterfaces,tmpdir} from "node:os";
import path from "node:path";

const pause=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
test("real local HTTP listener is loopback-only; proxy rejects remote headers before exempt routes",{timeout:90000},async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),"eo-memory-local-"));
  const port=await new Promise((resolve,reject)=>{const s=createServer();s.once("error",reject);s.listen(0,"127.0.0.1",()=>{const port=s.address().port;s.close(()=>resolve(port));});});
  const saved=new Map(["next-env.d.ts","tsconfig.json"].map(file=>[file,readFileSync(file)]));
  let logs="",exited=false;
  const child=spawn(process.execPath,["scripts/dev-local.mjs","--port",String(port)],{windowsHide:true,stdio:["ignore","pipe","pipe"],
    env:{...process.env,NODE_ENV:"development",VERCEL:"",EVAORBIT_DATA_BACKEND:"sqlite",EVAORBIT_SQLITE_PATH:path.join(dir,"test.db"),EVAORBIT_NEXT_DIST_DIR:"tmp/memory-b01-next"}});
  child.once("exit",()=>{exited=true;});
  child.once("error",error=>{logs+=error.message;exited=true;});
  for(const stream of [child.stdout,child.stderr])stream.on("data",chunk=>{logs=(logs+chunk).slice(-10000);});
  const base="http://127.0.0.1:"+port;
  const request=(pathname,headers={},body,method=body?"POST":"GET")=>new Promise((resolve,reject)=>{
    const req=httpRequest(base+pathname,{headers:{...(body?{"Content-Type":"application/json"}:{}),...headers},method,timeout:30000},response=>{
      let body="";response.setEncoding("utf8");response.on("data",chunk=>{body+=chunk;});
      response.on("end",()=>resolve({status:response.statusCode,headers:response.headers,text:async()=>body}));
    });
    req.on("error",reject);req.on("timeout",()=>req.destroy(new Error("HTTP timeout")));req.end(body?JSON.stringify(body):undefined);
  });
  try{
    let ready=false;
    for(let n=0;n<160&&!exited;n++){
      if(logs.includes("Ready in")){ready=true;break;}
      await pause(250);
    }
    assert.ok(ready,logs);
    const normal=await request("/api/memos");
    assert.equal(normal.status,200,await normal.text());
    assert.equal((await request("/api/memos",{host:"192.0.2.1:"+port})).status,403);
    assert.equal((await request("/api/memos",{"x-forwarded-for":"192.0.2.1"})).status,403);
    assert.equal((await request("/api/memos",{origin:"https://evil.example"})).status,403);
    assert.equal((await request("/api/mcp",{"x-forwarded-for":"192.0.2.1"})).status,403);
    const entity=randomUUID(),db=new DatabaseSync(path.join(dir,"test.db"));
    try{db.prepare("INSERT INTO memory_entities(id,canonical_name,entity_type) VALUES(?,'Review fixture','person')").run(entity);}finally{db.close();}
    const proposal={fact:{subjectEntityId:entity,predicate:"prefers",objectValue:"tea",epistemicType:"derived"},sources:[{sourceResource:"chat",excerpt:"Original words"}]};
    let factId;
    for(const action of ["promote","reject"]){
      const created=await request("/api/memory-graph",{},proposal);
      assert.equal(created.status,201,await created.text());
      const candidate=JSON.parse(await created.text());
      assert.equal(candidate.status,"pending");
      const pending = JSON.parse(await (await request("/api/memory-graph?resource=candidate&status=pending")).text());
      assert.deepEqual(pending.items.map(item => item.id), [candidate.id]);
      const reviewed=await request("/api/memory-graph/candidates/"+candidate.id,{}, {action},"PATCH");
      assert.equal(reviewed.status,200,await reviewed.text());
      const result=JSON.parse(await reviewed.text());
      assert.equal(result.status,action==="promote"?"promoted":"rejected");
      assert.equal(result.reviewClient,"web");
      if (action === "promote") factId = result.promotedFactId;
    }
    const fixtures = new DatabaseSync(path.join(dir,"test.db"));
    try {
      fixtures.prepare("INSERT INTO memory_sources(id,fact_id,source_resource,excerpt) VALUES(?,?,'chat','Second source')").run(randomUUID(), factId);
      fixtures.exec("INSERT INTO memos(title,content) VALUES('First','Memo body'),('Second','Memo body')");
    } finally { fixtures.close(); }
    const readJson = async (url, complete) => {
      const response = await request(url);
      assert.equal(response.status, 200, await response.text());
      if (complete !== undefined) assert.equal(response.headers["x-memory-recall-complete"], String(complete));
      return JSON.parse(await response.text());
    };
    const memo = await readJson("/api/memos?page=1&limit=1&q=Memo");
    assert.equal(memo.has_more, true);
    const memoLast = await readJson("/api/memos?page=1&limit=1&q=Memo&cursor=" + memo.next_cursor);
    assert.equal(memoLast.has_more, false);
    assert.notEqual(memo.items[0].id, memoLast.items[0].id);
    assert.ok(Array.isArray(await readJson("/api/memos?q=Memo")));

    const detail = await readJson("/api/memory-graph?resource=fact&id=" + factId + "&limit=1");
    assert.equal(detail.fact.id, factId);
    assert.equal(detail.entities[0].id, entity);
    assert.equal(detail.sourcesPage.has_more, true);
    const evidence = await readJson("/api/memory-graph?resource=source&fact_id=" + factId + "&limit=1&cursor=" + detail.sourcesPage.next_cursor);
    assert.equal(evidence.has_more, false);
    assert.notEqual(detail.sources[0].id, evidence.items[0].id);
    const person = await readJson("/api/memory-graph?resource=entity&id=" + entity);
    assert.equal(person.facts[0].id, factId);
    const recall = await readJson("/api/memory-graph?recall=1&q=Second%20source");
    assert.equal(recall.facts[0].fact.id, factId);
    assert.equal(recall.coverage.status, "complete");

    // An exact Memo title outranks a Fact literal in the default mixed context.
    const teaFact = randomUUID(), teaSource = randomUUID(), broaderTeaFact = randomUUID();
    const teaQuery = "/api/memory-graph?q=" + encodeURIComponent("绿茶");
    const mixed = new DatabaseSync(path.join(dir,"test.db"));
    try {
      const insertFact = mixed.prepare("INSERT INTO memory_facts(id,subject_entity_id,predicate,object_value,importance) VALUES(?,?,'偏好',?,?)");
      const insertMemo = mixed.prepare("INSERT INTO memos(title,content) VALUES(?,?)");
      insertFact.run(teaFact, entity, JSON.stringify("绿茶"), 1);
      mixed.prepare("INSERT INTO memory_sources(id,fact_id,source_resource,excerpt) VALUES(?,?,'chat','保留的证据')").run(teaSource, teaFact);
      insertMemo.run("绿茶", "第一条备忘");
      const one = await readJson(teaQuery + "&limit=1", true);
      assert.deepEqual(one.map(hit => hit.fact.id), [teaFact]);
      assert.equal(one[0].subject.id, entity);
      assert.deepEqual(one[0].sources.map(source => source.id), [teaSource]);
      assert.equal(one[0].sources[0].excerpt, "保留的证据");

      const defaultContext = await readJson(teaQuery + "&recall=1&limit=1");
      assert.deepEqual(defaultContext.facts, []);
      assert.equal(defaultContext.memos[0].title, "绿茶");
      assert.deepEqual(defaultContext.coverage, { status: "partial", complete: false, reasons: ["result_limit"] });

      for (let n = 0; n < 7; n++) insertMemo.run("绿茶", "额外备忘 " + n);
      mixed.prepare("INSERT INTO memory_entities(id,canonical_name,entity_type) VALUES(?,'绿茶','concept')").run(randomUUID());
      insertFact.run(broaderTeaFact, entity, JSON.stringify("草本绿茶组合"), 5);
      insertMemo.run("孤立备忘", "没有对应事实");
    } finally { mixed.close(); }

    const mixedDefault = await readJson(teaQuery + "&recall=1");
    assert.deepEqual(mixedDefault.facts, []);
    assert.ok(mixedDefault.coverage.reasons.includes("result_limit"));
    const graphDefault = await readJson(teaQuery, true);
    assert.deepEqual(graphDefault.map(hit => hit.fact.id), [teaFact, broaderTeaFact]);
    assert.deepEqual(graphDefault[0].sources.map(source => source.id), [teaSource]);
    assert.equal(graphDefault[0].subject.id, entity);
    const limitedFacts = await readJson(teaQuery + "&limit=1", false);
    assert.deepEqual(limitedFacts.map(hit => hit.fact.id), [teaFact]);
    assert.deepEqual(await readJson("/api/memory-graph?q=" + encodeURIComponent("孤立备忘"), true), []);

    const lan=Object.values(networkInterfaces()).flat().find(address=>address?.family==="IPv4"&&!address.internal)?.address;
    if(lan){
      const connected=await new Promise(resolve=>{
        const socket=createConnection({host:lan,port});
        socket.setTimeout(1000);
        socket.on("connect",()=>{socket.destroy();resolve(true);});
        socket.on("error",()=>resolve(false));
        socket.on("timeout",()=>{socket.destroy();resolve(false);});
      });
      assert.equal(connected,false,"local listener must not accept LAN connections");
    }
  }finally{
    if(child.pid&&!exited){
      if(process.platform==="win32")spawnSync("taskkill",["/PID",String(child.pid),"/T","/F"],{windowsHide:true,stdio:"ignore"});
      else child.kill("SIGTERM");
    }
    let listening=true;
    for(let n=0;n<40&&listening;n++){
      listening=await new Promise(resolve=>{const socket=createConnection({host:"127.0.0.1",port});socket.once("connect",()=>{socket.destroy();resolve(true);});socket.once("error",()=>resolve(false));});
      if(listening)await pause(100);
    }
    for(const[file,bytes]of saved)if(!readFileSync(file).equals(bytes))writeFileSync(file,bytes);
    rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});
    assert.equal(listening,false,"test server listener must be closed");
  }
});
