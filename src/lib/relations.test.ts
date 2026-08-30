import assert from "node:assert/strict";
import test from "node:test";
import { derivePersonBalance, minorFromDecimal, validateRelationEvent, type RelationEventInput } from "./relations.ts";
import type { RelationEvent } from "./types.ts";

const expense: RelationEventInput = { eventType:"expense",title:"晚餐",note:null,occurredAt:"2026-08-30T04:00:00.000Z",occurredHasExplicitTime:false,currency:"CNY",totalAmountMinor:30000,isInPerson:true,parties:[{key:"self",partyType:"self",personId:null,shareAmountMinor:10000,paidAmountMinor:30000},{key:"p:1",partyType:"person",personId:1,shareAmountMinor:10000,paidAmountMinor:0},{key:"p:2",partyType:"person",personId:2,shareAmountMinor:10000,paidAmountMinor:0}],items:[],flows:[{fromKey:"self",toKey:"p:1",flowType:"advance",amountMinor:10000,settlesFlowId:null,note:null},{fromKey:"self",toKey:"p:2",flowType:"treat",amountMinor:10000,settlesFlowId:null,note:null}] };

test("expense requires total = shares = paid and explicit coverage",()=>assert.equal(validateRelationEvent(expense),expense));
test("expense rejects an uncovered payment difference",()=>assert.throws(()=>validateRelationEvent({...expense,flows:expense.flows.slice(0,1)}),/支付差额/));
test("non expense rejects share and paid values",()=>assert.throws(()=>validateRelationEvent({...expense,eventType:"gift",totalAmountMinor:null,items:[],flows:[{fromKey:"self",toKey:"p:1",flowType:"gift",amountMinor:100,settlesFlowId:null,note:null}]}),/非消费事件/));
test("decimal amounts convert exactly to integer minor units",()=>{assert.equal(minorFromDecimal("12.3"),1230);assert.equal(minorFromDecimal("0.01"),1);assert.throws(()=>minorFromDecimal("1.001"));});
test("settlement and social balances remain separate",()=>{const event={id:1,...expense,parties:[{id:10,partyType:"self" as const,personId:null,shareAmountMinor:10000,paidAmountMinor:30000},{id:11,partyType:"person" as const,personId:1,shareAmountMinor:10000,paidAmountMinor:0}],items:[],flows:[{id:20,fromPartyId:10,toPartyId:11,flowType:"advance" as const,amountMinor:10000,settlesFlowId:null,note:null},{id:21,fromPartyId:10,toPartyId:11,flowType:"gift" as const,amountMinor:5000,settlesFlowId:null,note:null}],createdAt:"x",updatedAt:"x"} as RelationEvent;assert.deepEqual(derivePersonBalance([event],1),{settlementMinor:10000,socialMinor:5000});});
