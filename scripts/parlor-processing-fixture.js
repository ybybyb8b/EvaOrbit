// UI stand-in only. Does not run Swift, send inference requests, or validate its algorithm.
export const processingMethods=['ai.memoryProcessingGet','ai.memoryProcessingConfigure','ai.memoryProcess','ai.memoryProcessingRetry','ai.memoryProcessingCancel','ai.memoryProposalReview','ai.memoryConversationEnded'];
export async function handleProcessingFixture(method,p,state,accountId){
  if(!processingMethods.includes(method))return null;
  const okay=result=>({ok:true,result:structuredClone(result)}),invalid=message=>({ok:false,error:{code:'processing_fixture',message}});
  if(p.accountId!==accountId)return invalid('Account changed');
  state.processingConfigs??=[];state.processingJobs??=[];state.processingProposals??=[];
  if(method==='ai.memoryConversationEnded')return okay({scheduled:true});
  if(!state.personas.some(x=>x.id===p.personaId))return invalid('Persona unavailable');
  const defaults={accountId,personaId:p.personaId,automatic:false,threshold:40,onConversationEnd:false,modelMode:'persona'};
  const config=state.processingConfigs.find(c=>c.personaId===p.personaId)??defaults;
  if(method==='ai.memoryProcessingGet'){
    const jobs=state.processingJobs.filter(j=>j.personaId===p.personaId),attempts=jobs.flatMap(j=>j.attempts).filter(a=>a.dispatched);
    return okay({config,jobs:[...jobs].reverse(),proposals:state.processingProposals.filter(p=>p.personaId===config.personaId).reverse(),requestCount:attempts.length,attempts});
  }
  if(method==='ai.memoryProcessingConfigure'){
    if(p.config.accountId!==accountId||p.config.personaId!==p.personaId||p.config.threshold<10||p.config.threshold>500)return invalid('Invalid configuration');
    state.processingConfigs=state.processingConfigs.filter(c=>c.personaId!==p.personaId);state.processingConfigs.push(p.config);return okay({saved:true});
  }
  if(method==='ai.memoryProcess'){
    const c=state.conversations.find(c=>c.id===p.conversationId),group=state.groups.find(g=>g.id===p.conversationId);
    if(!(c?.personaId===p.personaId||group?.participants.some(x=>x.id===p.personaId)))return invalid('Conversation belongs to another persona');
    if(state.processingJobs.some(j=>j.personaId===p.personaId&&j.conversationId===p.conversationId))return okay({alreadyProcessed:true});
    const person=state.personas.find(x=>x.id===p.personaId),source=state.providers.find(x=>x.id===(config.modelMode==='dedicated'?config.providerId:person.providerId)),model=source?.models.find(m=>m.id===(config.modelMode==='dedicated'?config.modelId:person.modelId));
    if(!source||!model)return invalid("Choose an explicit model binding");
    const messages=state.messages.filter(m=>m.conversationId===p.conversationId),user=messages.find(m=>m.role==='user');if(!user)return invalid('No source');
    const now=new Date().toISOString(),id=crypto.randomUUID(),proposalId=crypto.randomUUID();
    const result={summary:'已讨论周末路线，出发日期待确认。',unresolved:['确认出发日期'],memories:[]};
    const job={id,accountId,personaId:p.personaId,conversationId:p.conversationId,status:'completed',trigger:'manual',messages:messages.map(m=>({id:m.id,ordinal:m.ordinal,seq:m.seq,hash:'fixture'})),inputHash:'a'.repeat(64),provider:source,model,providerKind:'api',attempts:[{dispatched:true,startedAt:now,finishedAt:now,status:'completed',usage:{source:'provider',inputTokens:95,outputTokens:67}}],result,summaryStatus:'applied',createdAt:now,updatedAt:now};
    state.processingJobs.push(job);
    const memory={id:proposalId,accountId,personaId:p.personaId,content:'用户可能更喜欢安静的周末散步路线，仍需确认。',kind:'observation',nature:'personaObservation',importance:3,sources:[{conversationId:p.conversationId,messageId:user.id,excerpt:user.content}],status:'active',version:0,createdAt:now,updatedAt:now,visibility:'singleChat',provenance:{taskId:id,proposalId,providerId:source.id,modelId:model.id,confidence:0.7}};
    state.processingProposals.push({id:proposalId,accountId,personaId:p.personaId,conversationId:p.conversationId,taskId:id,status:'pending',reason:'review_inference',memory,createdAt:now,updatedAt:now});
    const scope=group?'public':p.personaId,old=state.contexts.filter(c=>c.conversationId===p.conversationId&&c.scope===scope).at(-1);if(old)old.status='superseded';
    state.contexts.push({accountId,conversationId:p.conversationId,scope,version:(old?.version??0)+1,content:result.summary,unresolved:result.unresolved,fromOrdinal:messages[0].ordinal,throughOrdinal:messages.at(-1).ordinal,firstMessageId:messages[0].id,throughMessageId:messages.at(-1).id,sourceCount:messages.length,sourceHash:'b'.repeat(64),contentHash:'c'.repeat(64),updatedAt:now,status:'active',recentMessageLimit:0});
    return okay({jobId:id});
  }
  if(method==='ai.memoryProposalReview'){
    const proposal=state.processingProposals.find(x=>x.id===p.proposalId&&x.personaId===p.personaId&&x.status==='pending');if(!proposal)return invalid('Proposal changed');
    if(p.accept){const memory={...proposal.memory,content:p.content,version:1};state.memories.push(memory);proposal.status='accepted';proposal.acceptedMemoryId=memory.id;proposal.memory=memory;}else proposal.status='rejected';return okay(proposal);
  }
  return okay({cancelled:true});
}
