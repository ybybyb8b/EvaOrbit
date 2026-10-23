import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';

test('local Host viewport script locks page scale and stays idempotent without touching gesture handlers',()=>{
 const source=readFileSync('ios/EvaOrbitHost/Sources/WebViewController.swift','utf8');
 const script=source.match(/static let localViewportScript = #"""\s*([\s\S]*?)\s*"""#/)?.[1];
 assert(script);
 for(const existing of [true,false]){
  const nodes=existing?[{name:'viewport',content:'width=device-width, initial-scale=1, viewport-fit=cover'}]:[];
  const document={querySelector:()=>nodes[0],createElement:()=>({}),head:{appendChild:node=>nodes.push(node)}};
  runInNewContext(script,{document});runInNewContext(script,{document});
  assert.equal(nodes.length,1);assert.match(nodes[0].content,/maximum-scale=1/);assert.match(nodes[0].content,/user-scalable=no/);assert.match(nodes[0].content,/viewport-fit=cover/);
 }
});
