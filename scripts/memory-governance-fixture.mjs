import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function memoryGovernanceContract(a) {
  const entity = await a.entity("Subject"), other = await a.entity("Other");
  const fact = (patch={}) => ({subjectEntityId:entity,predicate:"prefers",objectEntityId:null,objectValue:"tea",perspectiveEntityId:null,
    epistemicType:"direct_statement",supersedesFactId:null,confidence:1,importance:3,validFrom:null,validTo:null,...patch});
  const sources = [{sourceResource:"chat",sourceRecordId:null,sourceUrl:null,excerpt:"  Original user words.\n",note:null}];
  const submission = (patch={}) => ({id:randomUUID(),proposedFact:fact(),proposedSources:sources,proposedBy:"user",proposerModel:null,
    reviewMode:"user_confirmed",writtenBy:"test-user",client:"test-client",requestId:randomUUID(),...patch});
  const pending = await a.submit(submission({reviewMode:"manual",proposedBy:"model",proposedFact:fact({epistemicType:"derived"})}));
  assert.equal(pending.status,"pending");assert.equal(pending.promotedFactId,null);
  const approved = await a.promote(pending.id);
  assert.equal(approved.status,"promoted");assert.ok(approved.promotedFactId);
  assert.equal((await a.sources(approved.promotedFactId))[0].excerpt,sources[0].excerpt);
  const rejection = await a.submit(submission({reviewMode:"manual",proposedBy:"model"}));
  assert.equal((await a.reject(rejection.id)).status,"rejected");assert.equal(await a.promote(rejection.id),null);

  const request = submission(), first = await a.submit(request);
  assert.equal(first.status,"promoted");assert.equal(first.reviewMode,"user_confirmed");assert.equal(first.writtenBy,"test-user");assert.equal(first.client,"test-client");assert.ok(first.actor);
  assert.equal((await a.submit({...request,id:randomUUID()})).id,first.id);
  await assert.rejects(()=>a.submit({...request,proposedFact:fact({objectValue:"different"})}));
  for (const bad of [
    {writtenBy:null}, {requestId:null}, {proposedSources:[{...sources[0],excerpt:"\n\t"}]}, {proposedSources:[{...sources[0],excerpt:null}]},
    {proposedFact:fact({epistemicType:"derived"})}, {proposedBy:"model"},
    {proposedSources:[{...sources[0],sourceResource:"external",excerpt:"quote only"}]},
    {proposedSources:[{...sources[0],sourceResource:"manual",excerpt:null,note:"note alone"}]},
    {proposedFact:fact({subjectEntityId:randomUUID()})},
  ]) await assert.rejects(()=>a.submit(submission(bad)));

  const source = (await a.sources(first.promotedFactId))[0];
  await a.patchSource(source.id,{sourceRecordId:"drive-file-id",sourceUrl:"https://drive.google.com/file/d/drive-file-id/view"});
  assert.equal((await a.sources(first.promotedFactId))[0].sourceRecordId,"drive-file-id");
  assert.equal((await a.sources(first.promotedFactId))[0].excerpt,sources[0].excerpt);
  await assert.rejects(()=>a.patchSource(source.id,{excerpt:null}));
  await assert.rejects(()=>a.deleteSource(source.id));
  const extra = await a.addSource(first.promotedFactId,{...sources[0],sourceRecordId:"extra"});
  assert.equal(await a.deleteSource(extra.id),true);assert.equal((await a.sources(first.promotedFactId)).length,1);

  const old = first.promotedFactId;
  for (const [table,operation] of [["memory_facts","INSERT"],["memory_sources","INSERT"],["memory_facts","UPDATE"],["memory_fact_candidates","UPDATE"]]) {
    for (const mode of ["user_confirmed","manual"]) {
      const proposal=submission({reviewMode:mode,proposedFact:fact({objectValue:"corrected",supersedesFactId:old})});
      let target;
      if(mode==="manual") target=await a.submit(proposal);
      const before=await a.snapshot();await a.failAt(table,operation);
      try {await assert.rejects(()=>mode==="manual"?a.promote(target.id):a.submit(proposal),/injected/);}
      finally {await a.clearFailure(table);}
      assert.deepEqual(await a.snapshot(),before,mode+" must roll back "+table+" "+operation);
      assert.equal((await a.getFact(old)).status,"active");
    }
  }
  for (const patch of [{subjectEntityId:other},{predicate:"unrelated"},{perspectiveEntityId:other}]) {
    await assert.rejects(()=>a.submit(submission({proposedFact:fact({...patch,supersedesFactId:old})})));
  }
  const replacement = await a.submit(submission({proposedFact:fact({objectValue:"coffee",supersedesFactId:old})}));
  const next = replacement.promotedFactId;
  assert.equal((await a.getFact(next)).supersedesFactId,old);assert.equal((await a.getFact(old)).status,"invalidated");
  assert.equal((await a.sources(old)).length,1);assert.equal((await a.sources(next)).length,1);
  assert.equal((await a.submit({...request,id:randomUUID()})).promotedFactId,old,"retry must work after original Fact was superseded");
  await assert.rejects(()=>a.restore(old));
  await assert.rejects(()=>a.submit(submission({proposedFact:fact({supersedesFactId:old})})));
  const third=await a.submit(submission({proposedFact:fact({objectValue:"water",supersedesFactId:next})}));
  await assert.rejects(()=>a.restore(old),"grandchild must prevent restoring ancestor");
  await a.invalidate(third.promotedFactId);assert.ok(await a.restore(old));
  await assert.rejects(()=>a.restore(next),"active ancestor must prevent restoring descendant");
  await assert.rejects(()=>a.submit(submission({proposedFact:fact({supersedesFactId:old})})),"inactive successor still owns the correction edge");

  const historical=await a.submit(submission({proposedFact:fact({validFrom:"2026-01-01"})}));
  await a.patchFact(historical.promotedFactId,{validTo:"2026-11-06"});
  const changed=await a.submit(submission({proposedFact:fact({objectValue:"new state",validFrom:"2026-11-07"})}));
  assert.equal((await a.getFact(historical.promotedFactId)).status,"active");
  assert.equal((await a.getFact(changed.promotedFactId)).supersedesFactId,null);

  const simultaneous=await a.submit(submission());
  await a.addSource(simultaneous.promotedFactId,{...sources[0],sourceRecordId:"second"});
  const pair=await a.sources(simultaneous.promotedFactId);
  const results=await Promise.allSettled(pair.map(s=>a.deleteSource(s.id)));
  assert.equal(results.filter(r=>r.status==="fulfilled"&&r.value).length,1);
  assert.equal((await a.sources(simultaneous.promotedFactId)).length,1);
  return {first,sourceId:source.id,entity};
}

export const legacyUnicodeSource = {
  sourceResource: "\uFEFFchat\uFEFF", sourceRecordId: "  archive-A  ", sourceUrl: "ftp://legacy.example",
  excerpt: "\uFEFF", note: "",
};

export async function assertLegacySourceCompatibility(adapter, factId) {
  const originals = await adapter.sources(factId);
  const legacy = originals.find(source => source.sourceRecordId === "  archive-A  ");
  assert.ok(legacy);
  const read = async (id) => (await adapter.sources(factId)).find(source => source.id === id);
  const evidence = (source) => ({
    sourceResource: source.sourceResource, sourceRecordId: source.sourceRecordId,
    sourceUrl: source.sourceUrl, excerpt: source.excerpt, note: source.note,
  });
  const originalEvidence = legacyUnicodeSource;
  assert.deepEqual(evidence(legacy), originalEvidence);
  await assert.rejects(() => adapter.patchSource(legacy.id, { sourceRecordId: "unrelated-ref" }), /requires evidence|requires an original excerpt/);
  assert.deepEqual(evidence(await read(legacy.id)), originalEvidence);
  const excerpt = " \tOriginal words.\n";
  await adapter.patchSource(legacy.id, { excerpt });
  assert.deepEqual(evidence(await read(legacy.id)), { ...originalEvidence, excerpt });
  await adapter.patchSource(legacy.id, { note: "Updated note" });
  const updatedEvidence = { ...originalEvidence, excerpt, note: "Updated note" };
  assert.deepEqual(evidence(await read(legacy.id)), updatedEvidence);
  await assert.rejects(() => adapter.patchSource(legacy.id, { sourceUrl: "ftp://other.example" }), /HTTP or HTTPS/);
  await assert.rejects(() => adapter.patchSource(legacy.id, { sourceUrl: "https://exam\uFEFFple.test" }), /HTTP or HTTPS/);
  await assert.rejects(() => adapter.patchSource(legacy.id, { excerpt: null }), /requires evidence|requires an original excerpt/);
  for (const [invalid, error] of [
    ["\uFEFF", /blank/], [" \n\t", /blank/], ["A\u0000B", /NUL|0x00/], ["\u0000", /NUL|0x00/],
  ]) {
    await assert.rejects(() => adapter.patchSource(legacy.id, { excerpt: invalid }), error);
    await assert.rejects(() => adapter.addSource(factId, {
      sourceResource: "chat", sourceRecordId: null, sourceUrl: null, excerpt: invalid, note: null,
    }), error);
  }
  assert.deepEqual(evidence(await read(legacy.id)), updatedEvidence);

  for (const example of [
    { resource: "chat", invalid: { sourceRecordId: "archive-id" }, repair: { excerpt: "Original words" } },
    { resource: "manual", invalid: { excerpt: "Unlinked text" }, repair: { sourceRecordId: "record-id" } },
  ]) {
    const original = originals.find(source => source.sourceResource === example.resource && source.sourceRecordId === null);
    assert.ok(original);
    const id = original.id;
    const find = () => read(id);
    await assert.rejects(() => adapter.patchSource(id, { note: null }), /check constraint/i);
    assert.equal((await find()).note, original.note);
    await adapter.patchSource(id, { note: "Updated note" });
    assert.equal((await find()).note, "Updated note");
    await adapter.patchSource(id, { note: "Repeated evidence", sourceRecordId: null });
    const before = await find();
    assert.equal(before.note, "Repeated evidence");
    assert.equal(before.sourceRecordId, null);
    assert.equal(before.excerpt, null);

    await assert.rejects(() => adapter.patchSource(id, example.invalid), /requires evidence|requires an original excerpt/);
    const afterFailure = await find();
    assert.equal(afterFailure.sourceRecordId, null);
    assert.equal(afterFailure.excerpt, null);
    await assert.rejects(() => adapter.addSource(factId, {
      sourceResource: example.resource, sourceRecordId: null, sourceUrl: null, excerpt: null, note: "New note only",
    }), /requires evidence|requires an original excerpt/);

    await adapter.patchSource(id, example.repair);
    const repaired = await find();
    for (const [field, value] of Object.entries(example.repair)) assert.equal(repaired[field], value);
    assert.equal(repaired.note, "Repeated evidence");
  }
}
