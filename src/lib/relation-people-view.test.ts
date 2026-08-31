import assert from "node:assert/strict";
import test from "node:test";
import { filterRelationPeople, sortRelationPeople } from "./relation-people-view.ts";
import type { RelationPersonSummary } from "./types.ts";

function person(id:number,name:string,overrides:Partial<RelationPersonSummary>={}):RelationPersonSummary{return{id,name,nickname:null,relationLabel:null,closenessRank:null,relationshipStatus:"active",photoPath:null,birthday:null,likes:null,avoid:null,note:null,archivedAt:null,createdAt:"x",updatedAt:"x",balance:{settlementMinor:0,socialMinor:0},latestEvent:null,lastMetAt:null,lastMetHasExplicitTime:null,...overrides};}
test("relation people sorts recency with nulls last",()=>{const never=person(1,"Never"),older=person(2,"Older",{lastMetAt:"2026-08-01T04:00:00Z"}),newer=person(3,"Newer",{lastMetAt:"2026-08-30T04:00:00Z"});assert.deepEqual(sortRelationPeople([never,older,newer],"last_met").map(p=>p.id),[3,2,1]);});
test("closeness keeps active relationships ahead of ended ones and unset last",()=>{const endedClose=person(1,"Ended",{relationshipStatus:"ended",closenessRank:5}),activeFar=person(2,"Far",{closenessRank:1}),activeUnset=person(3,"Unset");assert.deepEqual(sortRelationPeople([endedClose,activeUnset,activeFar],"closeness").map(p=>p.id),[2,3,1]);});
test("status view filters normally while search can still find ended people",()=>{const active=person(1,"A"),ended=person(2,"Former friend",{relationshipStatus:"ended"});assert.deepEqual(filterRelationPeople([active,ended],"","active").map(p=>p.id),[1]);assert.deepEqual(filterRelationPeople([active,ended],"Former","active").map(p=>p.id),[2]);});
