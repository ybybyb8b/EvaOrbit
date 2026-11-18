// Runs only when explicitly injected by native-eva-preview.mjs.
(() => {
  const accountId="10000000-0000-4000-8000-000000000001";
  const legacy=new URL(location.href).searchParams.has("legacy");
  const noDiscussion=new URL(location.href).searchParams.has("noDiscussion");
  const noModelSwitch=new URL(location.href).searchParams.has("noModelSwitch");
  const noCatalog=new URL(location.href).searchParams.has("noCatalog");
  const provider={id:"10000000-0000-4000-8000-000000000003",name:"Mock Provider",baseURL:"https://mock.example.invalid/v1",enabled:true,hasKey:true,models:[{id:"mock-text",name:"Mock text"}],currency:"USD",priceUpdatedAt:""};
  let state=JSON.parse(sessionStorage.getItem("eo-eva-synthetic-state")||"null")??{providers:[provider],conversations:[],messages:[]};
  state.persona??={id:"sebastian",name:"Sebastian",chineseName:"塞巴斯蒂安",nickname:"赛巴斯酱",systemPrompt:"你是 Sebastian，EvaOrbit 的 Parlor 中的默认 AI 人格。一位优雅、聪明、可靠的私人执事。沉稳从容，言谈有礼，偶尔带有一点狡黠的幽默感。默认中文，并随用户语言切换。独立判断，不盲目附和；没有工具时不得声称完成业务操作。",preferredAddress:"",humor:"subtle",formality:"natural",closeness:"warm"};
  state.personas??=[state.persona];state.groups??=[];state.rounds??={};state.discussions??=[];state.conversationModels??=[];
  for(const d of state.discussions)if(["running","summarizing"].includes(d.status)){d.status="interrupted";d.revision++;}
  if(new URL(location.href).searchParams.has("groupFixture")&&!state.groupSeeded){
    state.groupSeeded=true;
    const sub={...provider,id:"00000000-0000-4000-8000-000000000220",name:"ChatGPT (fixture)",connectionType:"subscription",hasKey:false,models:[{id:"gpt-preview",name:"GPT preview"}]};
    state.providers.push(sub);state.persona={...state.persona,providerId:provider.id,modelId:provider.models[0].id};
    state.personas=[state.persona,{...state.persona,id:"20000000-0000-4000-8000-000000000002",name:"Ada",chineseName:"",nickname:"",systemPrompt:"Independent analytical persona",providerId:sub.id,modelId:sub.models[0].id}];
  }
  if(new URL(location.href).searchParams.has("modelFixture")){
    const source=state.providers.find(p=>p.id===provider.id);
    if(source&&!source.models.some(m=>m.id==='mock-alt'))source.models.push({id:'mock-alt',name:'Reasoning Display'});
  }
  for(const m of state.messages)if(m.status==="streaming"){m.status="interrupted";m.error="Synthetic restart: partial response preserved.";m.seq++;}
  let timer,cancelCatalog;
  const save=()=>sessionStorage.setItem("eo-eva-synthetic-state",JSON.stringify(state));
  const emit=message=>{save();window.dispatchEvent(new CustomEvent("evaorbit:ai",{detail:{accountId,conversationId:message.conversationId,messageId:message.id,requestId:message.requestId,seq:message.seq,eventType:message.status==="streaming"?"progress":"terminal",message:{...message}}}));};
  const jobs=new Map();
  function startMember(member,round,requestId,supersedesId){
    const source=state.providers.find(p=>p.id===member.providerId),model=source.models.find(m=>m.id===member.modelId),index=round.members.findIndex(p=>p.id===member.id);
    const message={id:crypto.randomUUID(),conversationId:round.conversationId,role:"assistant",content:"",status:"streaming",createdAt:new Date().toISOString(),requestId,roundId:round.id,supersedesId,discussionId:round.discussionId,discussionRound:round.discussionRound,purpose:round.purpose,personaId:member.id,personaName:member.name,personaAvatar:member.avatarDataURL,providerId:source.id,providerName:source.name,model,usage:{source:"unknown"},seq:0,requestCount:1};
    state.messages.push(message);
    const requests=JSON.parse(sessionStorage.getItem('eo-group-requests')||'[]');requests.push({requestId,messageId:message.id,personaId:member.id,providerId:source.id,context:structuredClone(round.context)});sessionStorage.setItem('eo-group-requests',JSON.stringify(requests));
    const chunks=round.purpose==='summary'?["讨论结论：先做小规模验证。","\n\n共识是先明确目标；分歧是投入时机。尚需确认成本与风险。"]:round.discussionRound>1?(member.name==='Ada'?["回应 Sebastian：我同意先行动，但应先约定验证标准。","\n\n我补充一个约束：实验必须有清晰的停止条件。"]:["Ada 提到的前提值得保留；我会补充一步风险验证。","\n\n我的异议在于不必等所有信息齐全才开始。"]):member.name==="Ada"?["我会先检验这个想法的前提。","\n\n从执行风险来看，可以先用一个小实验验证，再决定是否投入更多资源。","\n\n我的建议：明确成功标准，保留调整空间。"]:["我们先把眼前最重要的一件事挑出来。","\n\n从你的目标出发，我建议先做可逆、成本小的一步。","\n\n今天就可以开始，余下的交给反馈来决定。"];
    let step=0;
    const timer=setInterval(()=>{
      if(message.status!=="streaming"){clearInterval(timer);jobs.delete(message.id);return;}
      if(step===1&&round.purpose!=='summary'&&round.content.includes('fail-ada')&&member.name==='Ada'){message.status='failed';message.error='Synthetic Provider HTTP 503';clearInterval(timer);jobs.delete(message.id);}
      else if(step<chunks.length)message.content+=chunks[step++];
      else if(round.purpose!=='summary'&&(round.content.includes('hold')||round.content.includes('周末')))return;
      else {message.status='done';message.usage={source:'provider',inputTokens:31+index,outputTokens:65+index};clearInterval(timer);jobs.delete(message.id);}
      message.seq++;emit(message);
      if(message.status!=="streaming"){
        const d=state.discussions.find(d=>d.id===round.discussionId);
        if(d?.status==='running'&&message.status!=='done'&&!d.suspendedPersonaIds.includes(member.id))d.suspendedPersonaIds.push(member.id);
        queueMicrotask(()=>advanceDiscussion(d));
      }
    },700+index*160);
    jobs.set(message.id,{timer,message});return message;
  }
  const changed=()=>{save();window.dispatchEvent(new CustomEvent('evaorbit:ai',{detail:{accountId,eventType:'configuration'}}));};
  function stopJobs(conversation,messageId){
    for(const [id,job] of jobs){if(job.message.conversationId!==conversation||(messageId&&messageId!==id))continue;clearInterval(job.timer);job.message.status='cancelled';job.message.seq++;jobs.delete(id);emit(job.message);}
  }
  function configuredMembers(members,conversation){
    return members.map(m=>{const choice=state.conversationModels.find(c=>c.conversationId===conversation&&c.personaId===m.id);return choice?{...m,providerId:choice.providerId,modelId:choice.modelId}:structuredClone(m);});
  }
  function discussionBatch(d,root,requestId,summaryPersona){
    const history=state.messages.filter(m=>m.conversationId===d.conversationId),replaced=new Set(history.map(m=>m.supersedesId));
    const context=history.filter(m=>!replaced.has(m.id)&&(m.role==='user'||m.content)).map(m=>({role:m.role,content:m.role==='assistant'?`[${m.personaName}${m.status==='done'?'':' · incomplete'}] ${m.content}`:m.content}));
    if(summaryPersona)context.push({role:'user',content:'整理当前讨论的共识、分歧、未决事项与可执行结论。'});
    else if(d.roundsStarted>1)context.push({role:'user',content:`讨论第${d.roundsStarted}轮，点名回应其他人格，补充、质疑或反驳。`});
    const members=configuredMembers(root.members,d.conversationId).filter(m=>summaryPersona?m.id===summaryPersona:!d.suspendedPersonaIds.includes(m.id));
    const round={id:requestId,conversationId:d.conversationId,content:root.content,members:structuredClone(members),context,discussionId:d.id,discussionRound:summaryPersona?undefined:d.roundsStarted,purpose:summaryPersona?'summary':'discussion'};
    state.rounds[round.id]=round;members.forEach(m=>startMember(m,round,crypto.randomUUID()));changed();
  }
  function advanceDiscussion(d){
    if(!d||[...jobs.values()].some(j=>j.message.conversationId===d.conversationId))return;
    if(d.status==='summarizing'){d.status='ended';changed();return;}
    if(d.status!=='running')return;
    const root=state.rounds[d.id];
    if(d.roundsStarted>=d.maxRounds||d.suspendedPersonaIds.length>=root.members.length){d.status=d.roundsStarted>=d.maxRounds?'completed':'paused';changed();return;}
    d.roundsStarted++;d.revision++;discussionBatch(d,root,crypto.randomUUID());
  }
  Object.defineProperty(window,"EvaOrbitNative",{value:{version:1,call:async(method,p={})=>{
    const memoryFixture=await import("./parlor-memory-fixture.js");
    memoryFixture.seedMemoryFixture(state,accountId);
    const contextFixture=await import("./parlor-context-fixture.js");contextFixture.prepareContextFixture(state,accountId);
    const echoFixture=await import("./parlor-echo-fixture.js");
    const echoResult=await echoFixture.handleEchoFixture(method,p,state,accountId);if(echoResult){if(echoResult.ok)save();return echoResult;}
    const processingFixture=await import("./parlor-processing-fixture.js");
    const processingResult=await processingFixture.handleProcessingFixture(method,p,state,accountId);if(processingResult){if(processingResult.ok)save();return processingResult;}
    const contextResult=await contextFixture.handleContextFixture(method,p,state,accountId);if(contextResult){if(contextResult.ok)save();return contextResult;}
    const memoryResult=await memoryFixture.handleMemoryFixture(method,p,state,accountId);
    if(memoryResult){if(memoryResult.ok)save();return memoryResult;}
    let result={};
    if(method==="host.getInfo")result={platform:"ios",methods:["host.getInfo","home.readOnlyResource",...(legacy?[]:[...(noModelSwitch?[]:["ai.setConversationModel"]),...(noDiscussion?[]:["ai.discussionControl","ai.discussionIntervene","ai.discussionSummarize"]),"ai.saveGroup","ai.groupSend","ai.groupRegenerate","ai.groupCancel","ai.subscriptionLogin","ai.subscriptionLogout","ai.subscriptionModels","ai.getState","ai.send","ai.cancel","ai.saveProvider","ai.deleteProvider","ai.deleteConversation","ai.savePersona",...(noCatalog?[]:["ai.listModels","ai.cancelModelList"])])]};
    else if(method==="trackers.getSession")result={accountId,email:"synthetic@example.invalid"};
    else if(method==="home.readOnlyResource")result=null;
    else if(method.startsWith("ai.")){
      if(p.accountId!==accountId)return {ok:false,error:{code:"account_mismatch",message:"Synthetic account mismatch"}};
      if(method==="ai.getState")result={...state,conversationModels:state.conversationModels.filter(c=>c.conversationId===p.conversationId),messages:state.messages.filter(m=>m.conversationId===p.conversationId),active:state.messages.find(m=>m.status==="streaming"&&!m.roundId),activeMessages:state.messages.filter(m=>m.status==="streaming"&&m.roundId)};
      else if(method==='ai.setConversationModel'){
        const group=state.groups.find(g=>g.id===p.conversationId),persona=(group?.participants??state.personas).find(x=>x.id===p.personaId),source=state.providers.find(x=>x.id===p.providerId&&x.enabled),model=source?.models.find(x=>x.id===p.modelId);
        if(!persona||!source||!model||!(source.hasKey||source.connectionType==='subscription'))return {ok:false,error:{code:'invalid',message:'Model unavailable'}};
        const d=state.discussions.find(d=>d.conversationId===p.conversationId);
        if(d&&['running','summarizing'].includes(d.status)){d.status=d.status==='running'?'paused':'ended';d.revision++;stopJobs(p.conversationId);}
        else if(group){for(const job of [...jobs.values()])if(job.message.conversationId===p.conversationId&&job.message.personaId===p.personaId)stopJobs(p.conversationId,job.message.id);}
        else {const m=state.messages.find(m=>m.conversationId===p.conversationId&&m.status==='streaming'&&!m.roundId);if(m){clearInterval(timer);m.status='cancelled';m.seq++;emit(m);}}
        state.conversationModels=state.conversationModels.filter(c=>c.conversationId!==p.conversationId||c.personaId!==p.personaId);state.conversationModels.push({conversationId:p.conversationId,personaId:p.personaId,providerId:p.providerId,modelId:p.modelId});
        if(!state.conversations.some(c=>c.id===p.conversationId))state.conversations.unshift({id:p.conversationId,title:persona.name,updatedAt:new Date().toISOString()});changed();result={saved:true};
      }
      else if(method==="ai.subscriptionLogin"||method==="ai.subscriptionModels"){
        const sub={...provider,id:"00000000-0000-4000-8000-000000000220",name:"ChatGPT",connectionType:"subscription",hasKey:false,models:[{id:"gpt-preview",name:"Preview model"}]};
        state.providers=state.providers.filter(p=>p.connectionType!=="subscription");state.providers.push(sub);save();result={saved:true};
      }
      else if(method==="ai.subscriptionLogout"){state.providers=state.providers.filter(p=>p.connectionType!=="subscription");save();result={saved:true};}
      else if(method==="ai.cancelModelList"){cancelCatalog?.();result={requested:true};}
      else if(method==="ai.listModels"){
        sessionStorage.setItem("eo-catalog-reads",String(Number(sessionStorage.getItem("eo-catalog-reads")||0)+1));
        const cancelled=await new Promise(resolve=>{const timeout=setTimeout(()=>resolve(false),p.baseURL.includes("slow")?3000:80);cancelCatalog=()=>{clearTimeout(timeout);resolve(true);};});cancelCatalog=undefined;
        if(cancelled)return {ok:false,error:{code:"cancelled",message:"Directory lookup cancelled"}};
        if(p.apiKey==="bad-catalog-key")return {ok:false,error:{code:"provider_http_401",message:"Provider HTTP 401"}};
        const priced=p.baseURL==="https://openrouter.ai/api/v1",fetchedAt=new Date().toISOString();
        const models=[
          {model:{id:"alpha/chat-pro",name:"Alpha Pro",contextWindow:128000,inputPrice:2.5,outputPrice:10,cachedInputPrice:.25},family:"alpha",textCapability:"text"},
          {model:{id:"beta/chat-free",name:"Beta Free",inputPrice:0,outputPrice:0},family:"beta",textCapability:"text"},
          {model:{id:"alpha/unknown",name:"Alpha Unknown"},family:"alpha",textCapability:"unknown"},
          ...Array.from({length:1200},(_,i)=>({model:{id:["alpha","beta","gamma","delta"][i%4]+"/model-"+String(i).padStart(4,"0"),name:"Catalog Model "+String(i).padStart(4,"0"),inputPrice:(i+1)/100,outputPrice:(i+1)/25,contextWindow:(i+1)*1000},family:["alpha","beta","gamma","delta"][i%4],textCapability:"text"}))
        ].map(item=>{if(priced)return {...item,model:{...item.model,priceSource:"openrouter",priceUpdatedAt:fetchedAt}};const {inputPrice,outputPrice,cachedInputPrice,...model}=item.model;return {...item,model};});
        result={models:p.baseURL.includes("empty")?[]:models,fetchedAt,currency:priced?"USD":undefined};
      }
      else if(method==="ai.saveGroup"){
        if(p.personaIds.length<2||p.personaIds.length>8)return {ok:false,error:{code:"invalid",message:"Select 2–8 personas"}};
        const group={id:p.conversationId,title:p.title,participants:p.personaIds.map(id=>structuredClone(state.personas.find(x=>x.id===id))),mode:p.mode??"parallel",maxRounds:p.maxRounds??3};
        state.groups=state.groups.filter(g=>g.id!==group.id);state.groups.push(group);state.conversations=state.conversations.filter(c=>c.id!==group.id);state.conversations.unshift({id:group.id,title:group.title,updatedAt:new Date().toISOString()});save();result={saved:true};
      }
      else if(method==="ai.groupSend"){
        if(state.rounds[p.requestId])return {ok:true,result:{messageIds:state.messages.filter(m=>m.roundId===p.requestId).map(m=>m.id)}};
        if(jobs.size)return {ok:false,error:{code:'busy',message:'Stop the current round first'}};
        const group=state.groups.find(g=>g.id===p.conversationId);
        if(group.mode==='discussion'){
          const d={id:p.requestId,conversationId:group.id,status:'running',roundsStarted:1,maxRounds:group.maxRounds??3,suspendedPersonaIds:[],revision:0};
          state.discussions=state.discussions.filter(x=>x.conversationId!==group.id);state.discussions.push(d);
          state.messages.push({id:crypto.randomUUID(),conversationId:group.id,role:'user',content:p.content,status:'done',createdAt:new Date().toISOString(),seq:0,requestCount:0,roundId:d.id});
          discussionBatch(d,{content:p.content,members:group.participants},p.requestId);return {ok:true,result:{requested:true}};
        }
        const history=state.messages.filter(m=>m.conversationId===group.id),replaced=new Set(history.map(m=>m.supersedesId));
        const round={id:p.requestId,conversationId:group.id,content:p.content,members:configuredMembers(group.participants,group.id),context:history.filter(m=>!replaced.has(m.id)&&(m.role==='user'||m.status==='done')).map(m=>({role:m.role,content:m.content})).concat({role:'user',content:p.content})};
        state.rounds[round.id]=round;state.messages.push({id:crypto.randomUUID(),conversationId:group.id,role:'user',content:p.content,status:'done',createdAt:new Date().toISOString(),seq:0,requestCount:0,roundId:round.id});
        const replies=round.members.map(member=>startMember(member,round,crypto.randomUUID()));save();result={messageIds:replies.map(m=>m.id)};
      }
      else if(method==="ai.groupRegenerate"){
        const existing=state.messages.find(m=>m.requestId===p.requestId);if(existing)return {ok:true,result:{messageIds:[existing.id]}};
        const original=state.messages.find(m=>m.id===p.messageId),round=state.rounds[original.roundId],member=round.members.find(x=>x.id===original.personaId);
        if([...jobs.values()].some(j=>j.message.personaId===member.id))return {ok:false,error:{code:'busy',message:'Persona is generating'}};
        const message=startMember(member,round,p.requestId,original.id);save();result={messageIds:[message.id]};
      }
      else if(method==='ai.discussionControl'){
        const d=state.discussions.find(d=>d.conversationId===p.conversationId);
        if(p.action==='continue'){d.status='running';d.suspendedPersonaIds=[];advanceDiscussion(d);}
        else {d.status=p.action==='pause'?'paused':'ended';stopJobs(d.conversationId);}
        d.revision++;changed();result={requested:true};
      }
      else if(method==='ai.discussionIntervene'||method==='ai.discussionSummarize'){
        if(state.messages.some(m=>m.requestId===p.requestId)||state.rounds[p.requestId])return {ok:true,result:{requested:true}};
        const d=state.discussions.find(d=>d.conversationId===p.conversationId),root=state.rounds[d.id];
        d.status='paused';stopJobs(d.conversationId);d.revision++;
        if(method==='ai.discussionIntervene'){
          state.messages.push({id:crypto.randomUUID(),conversationId:d.conversationId,role:'user',content:p.content,status:'done',createdAt:new Date().toISOString(),requestId:p.requestId,seq:0,requestCount:0,discussionId:d.id});
          d.suspendedPersonaIds=[];d.status='running';advanceDiscussion(d);
        }else{d.status='summarizing';discussionBatch(d,root,p.requestId,p.personaId);}
        changed();result={requested:true};
      }
      else if(method==="ai.groupCancel"){
        const d=state.discussions.find(d=>d.conversationId===p.conversationId);
        if(d?.status==='running'){if(!p.messageId)d.status='ended';else{const m=state.messages.find(m=>m.id===p.messageId);if(m&&!d.suspendedPersonaIds.includes(m.personaId))d.suspendedPersonaIds.push(m.personaId);}}

        for(const [id,job] of jobs){if(job.message.conversationId!==p.conversationId||(p.messageId&&p.messageId!==id))continue;clearInterval(job.timer);job.message.status='cancelled';job.message.seq++;jobs.delete(id);emit(job.message);}changed();if(d)queueMicrotask(()=>advanceDiscussion(d));result={requested:true};
      }
      else if(method==="ai.savePersona"){if(p.persona.id==='sebastian')state.persona=p.persona;state.personas=state.personas.filter(x=>x.id!==p.persona.id);state.personas.push(p.persona);save();result={saved:true};}
      else if(method==="ai.send"){
        if(state.messages.some(m=>m.status==="streaming"))return {ok:false,error:{code:"busy",message:"Stop the active response first"}};
        const old=state.messages.find(m=>m.requestId===p.requestId);
        if(old)return {ok:true,result:{requestId:p.requestId,messageId:old.id}};
        const now=new Date().toISOString();
        state.conversations=state.conversations.filter(c=>c.id!==p.conversationId);state.conversations.unshift({id:p.conversationId,title:p.content.slice(0,60),updatedAt:now});
        state.messages.push({id:crypto.randomUUID(),conversationId:p.conversationId,role:"user",content:p.content,status:"done",createdAt:now,seq:0,requestCount:0});
        const m={id:crypto.randomUUID(),conversationId:p.conversationId,role:"assistant",content:"",status:"streaming",createdAt:now,requestId:p.requestId,providerId:p.providerId,providerName:state.providers.find(x=>x.id===p.providerId)?.name,model:state.providers.find(x=>x.id===p.providerId)?.models.find(x=>x.id===p.modelId),usage:{source:"unknown"},seq:0,requestCount:1,personaId:p.personaId??state.persona.id,personaName:state.personas.find(x=>x.id===p.personaId)?.name??state.persona.name};
        state.messages.push(m);save();
        const chunks=["先别急着和整张待办清单决斗。","我们把事情分成三类，它们就没那么擅长吓人了。\n\n","**今天非做不可的**，先留一件；","**可以推迟的**，给它一个明确日期；","**只是挂在心上的**，先写下来，不必立刻解决。\n\n","你把最让你惦记的那一件告诉我。","我们先从那里下手，如何？"];let index=-1;
        timer=setInterval(()=>{if(m.status!=="streaming"){clearInterval(timer);return;}if(index<0){index=0;return;}if(index<chunks.length)m.content+=chunks[index++];else if(p.content.includes("stop")){return;}else{m.status="done";m.usage={inputTokens:42,outputTokens:76,source:"provider"};clearInterval(timer);}m.seq++;emit(m);},650);
        result={requestId:m.requestId,messageId:m.id};
      }else if(method==="ai.cancel"){const m=state.messages.find(m=>m.requestId===p.requestId);if(m?.status==="streaming"){m.status="cancelled";m.seq++;clearInterval(timer);emit(m);}result={requested:true};}
      else if(method==="ai.saveProvider"){const next={...p.provider,hasKey:p.clearKey?false:Boolean(p.apiKey||state.providers.find(x=>x.id===p.provider.id)?.hasKey)};state.providers=state.providers.filter(x=>x.id!==next.id);state.providers.push(next);save();result={saved:true};}
      else if(method==="ai.deleteProvider"){state.providers=state.providers.filter(x=>x.id!==p.providerId);save();}
      else if(method==="ai.deleteConversation"){state.messages=state.messages.filter(x=>x.conversationId!==p.conversationId);state.conversations=state.conversations.filter(x=>x.id!==p.conversationId);state.groups=state.groups.filter(x=>x.id!==p.conversationId);state.discussions=state.discussions.filter(x=>x.conversationId!==p.conversationId);state.conversationModels=state.conversationModels.filter(x=>x.conversationId!==p.conversationId);save();}
    }else return {ok:false,error:{code:"synthetic_unsupported",message:"This capability is unavailable in the synthetic preview"}};
    if(method==="host.getInfo"&&!legacy&&!new URL(location.href).searchParams.has("noMemory"))result.methods.push(...memoryFixture.memoryMethods);
    if(method==="host.getInfo"&&!legacy&&!new URL(location.href).searchParams.has("noProcessing"))result.methods.push(...processingFixture.processingMethods);
    if(method==="host.getInfo"&&!legacy&&!new URL(location.href).searchParams.has("noContext"))result.methods.push(...contextFixture.contextMethods);
    if(method==="host.getInfo"&&!legacy&&new URL(location.href).searchParams.has("echoFixture"))result.methods.push(...echoFixture.echoMethods);
    if(method==="ai.getState"){delete result.echoConfig;delete result.echoShares;delete result.echoSnapshots;const page=contextFixture.contextPage(state,p.conversationId);result.messages=page.messages;result.messagePage=page;delete result.contexts;delete result.processingConfigs;delete result.processingJobs;delete result.processingProposals;result.conversation=state.conversations.find(c=>c.id===p.conversationId);result.unassignedConversations=state.conversations.filter(c=>c.ownership==="unresolved");delete result.memories;}
    if(method==="ai.send"){const c=state.conversations.find(c=>c.id===p.conversationId);if(c){c.ownership="single";c.personaId=p.personaId;save();}}
    return {ok:true,result:JSON.parse(JSON.stringify(result))};
  }},configurable:false,writable:false});
})();
