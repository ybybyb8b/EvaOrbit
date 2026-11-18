// UI-only Native stand-in. It does not implement or validate the Swift budget algorithm.
export const contextMethods=["ai.messagePage","ai.contextGet","ai.contextSave"];
export function prepareContextFixture(state,accountId){
  state.contexts??=[];
  if(new URL(location.href).searchParams.has('contextFixture')&&!state.contextSeeded){
    state.contextSeeded=true;const id='51000000-0000-4000-8000-000000000001',now=new Date().toISOString();
    state.conversations.unshift({id,title:'长对话 · 周末计划',updatedAt:now,ownership:'single',personaId:'sebastian'});
    for(let i=0;i<5002;i++)state.messages.push({id:`51000000-0000-4000-8000-${String(i+10).padStart(12,'0')}`,conversationId:id,role:i%2?'assistant':'user',personaId:i%2?'sebastian':undefined,personaName:i%2?'Sebastian':undefined,content:`历史消息 ${i+1}：继续讨论周末散步路线和预算。`,createdAt:now,status:'done',seq:1,requestCount:i%2?1:0});
    state.messages.at(-1).contextBudget={contextWindow:8192,windowKnown:true,outputTokens:1024,inputLimit:6349,systemTokens:340,publicTokens:900,memoryTokens:120,estimatedInputTokens:1360,estimateMethod:'utf8-weighted-v1',hardByteLimit:524288};
    state.messages.at(-1).contextCoverage={watermark:5002,totalMessages:5000,includedMessages:24,summarizedThrough:0,notices:['history_not_fully_included']};
  }
  state.messages.forEach((m,i)=>m.ordinal??=i+1);
}
export function contextPage(state,id,before=Number.MAX_SAFE_INTEGER,limit=200){const all=state.messages.filter(m=>m.conversationId===id),available=all.filter(m=>m.ordinal<before),messages=available.slice(-limit);return {messages,hasMore:available.length>messages.length,beforeOrdinal:available.length>messages.length?messages[0]?.ordinal:undefined,watermark:all.at(-1)?.ordinal??0,total:all.length};}
export async function handleContextFixture(method,p,state,accountId){
  if(!contextMethods.includes(method))return null;
  const invalid=message=>({ok:false,error:{code:'context_fixture_invalid',message}}),okay=result=>({ok:true,result:structuredClone(result)});
  if(p.accountId!==accountId)return invalid('Account changed');
  if(method==='ai.messagePage')return okay(contextPage(state,p.conversationId,p.beforeOrdinal,p.limit??100));
  const conversation=state.conversations.find(c=>c.id===p.conversationId),group=state.groups.find(g=>g.id===p.conversationId);
  if(!conversation||!(conversation.personaId===p.personaId||group?.participants.some(x=>x.id===p.personaId)))return invalid('Confirm the conversation persona first');
  const scope=group?'public':p.personaId,versions=state.contexts.filter(c=>c.conversationId===p.conversationId&&c.scope===scope).sort((a,b)=>b.version-a.version);
  if(method==='ai.contextGet')return okay({scope,versions,watermark:contextPage(state,p.conversationId).watermark,page:contextPage(state,p.conversationId)});
  if((versions[0]?.version??0)!==p.expectedVersion)return invalid('Context changed; reload before saving.');
  const through=state.messages.find(m=>m.id===p.throughMessageId&&m.conversationId===p.conversationId);
  if(p.content&&!through)return invalid('Choose a completed turn boundary');
  if(versions[0])versions[0].status='superseded';
  const bytes=new TextEncoder().encode(JSON.stringify([p.content,p.unresolved,p.throughMessageId]));
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
  const value={accountId,conversationId:p.conversationId,scope,version:p.expectedVersion+1,content:p.content,unresolved:p.unresolved,fromOrdinal:p.content?1:0,throughOrdinal:p.content?through.ordinal:0,throughMessageId:p.content?p.throughMessageId:undefined,sourceCount:p.content?state.messages.filter(m=>m.conversationId===p.conversationId&&m.ordinal<=through.ordinal).length:0,sourceHash:hash,contentHash:hash,updatedAt:new Date().toISOString(),status:'active',recentMessageLimit:p.recentMessageLimit};
  state.contexts.push(value);return okay(value);
}
