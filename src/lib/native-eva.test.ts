import test from "node:test";
import assert from "node:assert/strict";
import {acceptEvaEvent,supportsNativeEva,nativeEvaMethods,type EvaMessage} from "./native-eva.ts";

const message:EvaMessage={id:"message-a",conversationId:"conversation-a",role:"assistant",content:"first",status:"streaming",createdAt:"2026-11-16T00:00:00Z",requestId:"request-a",seq:1,requestCount:1};
const event=(patch:Partial<EvaMessage>={})=>{const next={...message,...patch};return {accountId:"account-a",conversationId:next.conversationId,messageId:next.id,requestId:next.requestId,seq:next.seq,eventType:next.status==="streaming"?"progress":"terminal",message:next};};
test("Native Eva capability requires the complete protocol, without UA assumptions",()=>{
  assert.equal(supportsNativeEva(null),false);
  assert.equal(supportsNativeEva({methods:["host.getInfo","settings.aiConfiguration"]}),false);
  assert.equal(supportsNativeEva({methods:[...nativeEvaMethods]}),true);
  assert.equal(supportsNativeEva({methods:nativeEvaMethods.slice(1)}),false);
});
test("Native Eva accepts incremental revisions but rejects other accounts, requests and late terminal overwrites",()=>{
  const args=["account-a","conversation-a",[message]] as const;
  const next=acceptEvaEvent(event({seq:2,content:"first second"}),...args);
  assert.equal(next?.[0].content,"first second");
  assert.equal(acceptEvaEvent({...event({seq:2}),accountId:"account-b"},...args),null);
  assert.equal(acceptEvaEvent(event({seq:2,requestId:"request-b"}),...args),null);
  assert.equal(acceptEvaEvent(event({seq:1}),...args),null);
  assert.equal(acceptEvaEvent(event({seq:2,conversationId:"other"}),...args),null);
  assert.equal(acceptEvaEvent(event({seq:2}),"account-a","conversation-a",[]),null);
  const stopped={...message,status:"cancelled" as const,seq:3};
  assert.equal(acceptEvaEvent(event({seq:4}),"account-a","conversation-a",[stopped]),null);
});
