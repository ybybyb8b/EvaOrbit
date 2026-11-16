// Runs only when explicitly injected by native-eva-preview.mjs.
(() => {
  const accountId="10000000-0000-4000-8000-000000000001";
  const legacy=new URL(location.href).searchParams.has("legacy");
  const noCatalog=new URL(location.href).searchParams.has("noCatalog");
  const provider={id:"10000000-0000-4000-8000-000000000003",name:"Mock Provider",baseURL:"https://mock.example.invalid/v1",enabled:true,hasKey:true,models:[{id:"mock-text",name:"Mock text"}],currency:"USD",priceUpdatedAt:""};
  let state=JSON.parse(sessionStorage.getItem("eo-eva-synthetic-state")||"null")??{providers:[provider],conversations:[],messages:[]};
  state.persona??={id:"sebastian",name:"Sebastian",chineseName:"塞巴斯蒂安",nickname:"赛巴斯酱",systemPrompt:"你是 Sebastian，EvaOrbit 的 Parlor 中的默认 AI 人格。一位优雅、聪明、可靠的私人执事。沉稳从容，言谈有礼，偶尔带有一点狡黠的幽默感。默认中文，并随用户语言切换。独立判断，不盲目附和；没有工具时不得声称完成业务操作。",preferredAddress:"",humor:"subtle",formality:"natural",closeness:"warm"};
  for(const m of state.messages)if(m.status==="streaming"){m.status="interrupted";m.error="Synthetic restart: partial response preserved.";m.seq++;}
  let timer,cancelCatalog;
  const save=()=>sessionStorage.setItem("eo-eva-synthetic-state",JSON.stringify(state));
  const emit=message=>{save();window.dispatchEvent(new CustomEvent("evaorbit:ai",{detail:{accountId,conversationId:message.conversationId,messageId:message.id,requestId:message.requestId,seq:message.seq,eventType:message.status==="streaming"?"progress":"terminal",message:{...message}}}));};
  Object.defineProperty(window,"EvaOrbitNative",{value:{version:1,call:async(method,p={})=>{
    let result={};
    if(method==="host.getInfo")result={platform:"ios",methods:["host.getInfo","home.readOnlyResource",...(legacy?[]:["ai.getState","ai.send","ai.cancel","ai.saveProvider","ai.deleteProvider","ai.deleteConversation","ai.savePersona",...(noCatalog?[]:["ai.listModels","ai.cancelModelList"])])]};
    else if(method==="trackers.getSession")result={accountId,email:"synthetic@example.invalid"};
    else if(method==="home.readOnlyResource")result=null;
    else if(method.startsWith("ai.")){
      if(p.accountId!==accountId)return {ok:false,error:{code:"account_mismatch",message:"Synthetic account mismatch"}};
      if(method==="ai.getState")result={...state,messages:state.messages.filter(m=>m.conversationId===p.conversationId),active:state.messages.find(m=>m.status==="streaming")};
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
      else if(method==="ai.savePersona"){state.persona=p.persona;save();result={saved:true};}
      else if(method==="ai.send"){
        if(state.messages.some(m=>m.status==="streaming"))return {ok:false,error:{code:"busy",message:"Stop the active response first"}};
        const old=state.messages.find(m=>m.requestId===p.requestId);
        if(old)return {ok:true,result:{requestId:p.requestId,messageId:old.id}};
        const now=new Date().toISOString();
        state.conversations=state.conversations.filter(c=>c.id!==p.conversationId);state.conversations.unshift({id:p.conversationId,title:p.content.slice(0,60),updatedAt:now});
        state.messages.push({id:crypto.randomUUID(),conversationId:p.conversationId,role:"user",content:p.content,status:"done",createdAt:now,seq:0,requestCount:0});
        const m={id:crypto.randomUUID(),conversationId:p.conversationId,role:"assistant",content:"",status:"streaming",createdAt:now,requestId:p.requestId,providerId:p.providerId,providerName:"Mock Provider",model:provider.models[0],usage:{source:"unknown"},seq:0,requestCount:1,personaId:state.persona.id,personaName:state.persona.name};
        state.messages.push(m);save();
        const chunks=["先别急着和整张待办清单决斗。","我们把事情分成三类，它们就没那么擅长吓人了。\n\n","**今天非做不可的**，先留一件；","**可以推迟的**，给它一个明确日期；","**只是挂在心上的**，先写下来，不必立刻解决。\n\n","你把最让你惦记的那一件告诉我。","我们先从那里下手，如何？"];let index=-1;
        timer=setInterval(()=>{if(m.status!=="streaming"){clearInterval(timer);return;}if(index<0){index=0;return;}if(index<chunks.length)m.content+=chunks[index++];else if(p.content.includes("stop")){return;}else{m.status="done";m.usage={inputTokens:42,outputTokens:76,source:"provider"};clearInterval(timer);}m.seq++;emit(m);},650);
        result={requestId:m.requestId,messageId:m.id};
      }else if(method==="ai.cancel"){const m=state.messages.find(m=>m.requestId===p.requestId);if(m?.status==="streaming"){m.status="cancelled";m.seq++;clearInterval(timer);emit(m);}result={requested:true};}
      else if(method==="ai.saveProvider"){const next={...p.provider,hasKey:p.clearKey?false:Boolean(p.apiKey||state.providers.find(x=>x.id===p.provider.id)?.hasKey)};state.providers=state.providers.filter(x=>x.id!==next.id);state.providers.push(next);save();result={saved:true};}
      else if(method==="ai.deleteProvider"){state.providers=state.providers.filter(x=>x.id!==p.providerId);save();}
      else if(method==="ai.deleteConversation"){state.messages=state.messages.filter(x=>x.conversationId!==p.conversationId);state.conversations=state.conversations.filter(x=>x.id!==p.conversationId);save();}
    }else return {ok:false,error:{code:"synthetic_unsupported",message:"This capability is unavailable in the synthetic preview"}};
    return {ok:true,result:JSON.parse(JSON.stringify(result))};
  }},configurable:false,writable:false});
})();
