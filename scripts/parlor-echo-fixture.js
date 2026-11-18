// Browser UI stand-in only. No Swift, Echo API, Session validation or model inference runs here.
export const echoMethods=['ai.echoGet','ai.echoConfigure','ai.echoClear','ai.echoEntities','ai.echoSharePrepare','ai.echoShareSubmit','ai.echoShareStatus'];
export async function handleEchoFixture(method,p,state,accountId){
  if(!echoMethods.includes(method))return null;
  const okay=result=>({ok:true,result:structuredClone(result)}),invalid=message=>({ok:false,error:{code:'echo_fixture',message}});
  if(p.accountId!==accountId)return invalid('Account changed');
  const config=state.echoConfig??={accountId,readEnabled:false,writeEnabled:false,apiAttempts:0};state.echoShares??=[];state.echoSnapshots??=[];
  if(method==='ai.echoConfigure'){config.readEnabled=p.readEnabled;config.writeEnabled=p.writeEnabled;if(!config.readEnabled){for(const s of state.echoSnapshots)delete s.contextJSON;config.lastStatus='disabled';}return okay({saved:true});}
  if(method==='ai.echoClear'){for(const s of state.echoSnapshots)delete s.contextJSON;return okay({cleared:true});}
  if(!state.personas.some(x=>x.id===p.personaId)&&!['ai.echoEntities'].includes(method))return invalid('Persona unavailable');
  if(method==='ai.echoGet'){
    const snapshot=state.echoSnapshots.at(-1),coverage=snapshot?.contextJSON?JSON.parse(snapshot.contextJSON).coverage:undefined;
    return okay({config,shares:state.echoShares.filter(s=>s.personaId===p.personaId).map(s=>({...s,hasPayload:!!s.payloadJSON,payloadJSON:undefined})).reverse(),snapshot:snapshot?{...snapshot,contextJSON:undefined}:undefined,cacheAvailable:!!snapshot?.contextJSON&&snapshot.expiresAt>new Date().toISOString()&&config.readEnabled,coverage});
  }
  if(method==='ai.echoEntities'){
    if(!config.writeEnabled)return invalid('Sharing disabled');config.apiAttempts+=2;config.connectionStatus='connected';
    return okay({items:[{id:'82000000-0000-4000-8000-000000000001',canonicalName:'用户 · Echo 测试实体'}],next_cursor:null});
  }
  if(method==='ai.echoSharePrepare'){
    if(!config.writeEnabled)return invalid('Sharing disabled');
    const memory=state.memories.filter(m=>m.id===p.memoryId&&m.personaId===p.personaId).sort((a,b)=>b.version-a.version)[0];
    if(p.memoryId&&(!memory||memory.version!==p.version||memory.status!=='active'))return invalid('Memory changed');
    const message=state.messages.find(m=>m.id===(memory?.sources[0]?.messageId??p.messageId)),conversation=state.conversations.find(c=>c.id===message?.conversationId);
    if(!message||conversation?.personaId!==p.personaId)return invalid('Invalid source');
    const text=p.excerpt??memory?.content??message.content;if(!(memory?.content??message.content).includes(text))return invalid('Not an original excerpt');
    const old=state.echoShares.find(s=>s.personaId===p.personaId&&s.memoryId===p.memoryId&&s.content===text&&s.payloadJSON);if(old)return okay(old);
    const now=new Date().toISOString(),requestId=crypto.randomUUID(),direct=(!memory||memory.nature==='userStatement')&&message.role==='user'&&message.content.includes(text),epistemicType=direct?'direct_statement':'derived';
    const source={sourceResource:'chat',sourceRecordId:`parlor:${message.conversationId}:${message.id}`,sourceUrl:null,excerpt:direct?text:memory?.sources[0].excerpt??text,note:'Synthetic preview source; consent is not factual confirmation.'};
    const payloadJSON=JSON.stringify({protocol:'parlor-echo/1',submission:{requestId,reviewMode:'manual',proposedBy:direct?'user':'model',fact:{subjectEntityId:p.entityId,predicate:p.predicate,objectValue:text,epistemicType},sources:[source]}});
    const share={requestId,accountId,personaId:p.personaId,conversationId:message.conversationId,memoryId:memory?.id,memoryVersion:memory?.version,sourceRefs:[{id:message.id,ordinal:message.ordinal,seq:message.seq,hash:'fixture'}],payloadJSON,payloadHash:'fixture',draftKey:'fixture',content:text,epistemicType,status:'preview',createdAt:now,updatedAt:now};state.echoShares.push(share);return okay(share);
  }
  const share=state.echoShares.find(s=>s.requestId===p.requestId&&s.personaId===p.personaId);if(!share)return invalid('No owned share');
  if(method==='ai.echoShareStatus'){
    if(!config.readEnabled&&!config.writeEnabled)return invalid('Echo disabled');config.apiAttempts+=2;return okay(share);
  }
  if(!config.writeEnabled||!p.confirmed||!share.payloadJSON)return invalid('Explicit confirmation and unchanged sources required');
  config.apiAttempts+=share.candidateId?2:3;share.status='submitted';share.candidateId??=crypto.randomUUID();share.candidateStatus='pending';return okay(share);
}
