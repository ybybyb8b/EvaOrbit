// Browser-only UI adapter. Native behavior is covered separately by Swift/SQLite tests.
export const memoryMethods=["ai.memoryList","ai.memoryDetail","ai.memorySave","ai.memoryDelete","ai.memorySources","ai.assignConversationPersona","ai.exportBackup","ai.restoreBackup"];
const invalid=message=>({ok:false,error:{code:"fixture_invalid",message}});
const okay=result=>({ok:true,result:structuredClone(result)});
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,canonical(v[k])])):v;
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(canonical(value)))))].map(v=>v.toString(16).padStart(2,"0")).join("");
export function seedMemoryFixture(state,accountId){
  state.memories??=[];
  for(const c of state.conversations){if(state.groups.some(g=>g.id===c.id))c.ownership="group";}
  if(!new URL(location.href).searchParams.has("memoryFixture")||state.memorySeeded)return;
  state.memorySeeded=true;
  const conversationId="30000000-0000-4000-8000-000000000001",now=new Date().toISOString();
  state.conversations.push({id:conversationId,title:"周末散步的约定",updatedAt:now,ownership:"single",personaId:"sebastian"});
  state.conversations.push({id:"30000000-0000-4000-8000-000000000002",title:"旧会话：待确认人格",updatedAt:now,ownership:"unresolved"});
  state.messages.push({id:"30000000-0000-4000-8000-000000000003",conversationId,role:"user",content:"周末一起整理散步路线，先选安静、有树荫的地方。",status:"done",createdAt:now,seq:0,requestCount:0});
  state.memories.push({id:"30000000-0000-4000-8000-000000000004",accountId,personaId:"sebastian",kind:"commitment",content:"答应在周末陪用户一起整理散步路线，优先考虑安静、有树荫的地方。",importance:4,nature:"promise",sources:[{conversationId,messageId:"30000000-0000-4000-8000-000000000003",excerpt:"周末一起整理散步路线，先选安静、有树荫的地方。"}],createdAt:now,updatedAt:now,version:1,status:"active"});
}
export async function handleMemoryFixture(method,p,state,accountId){
  if(!memoryMethods.includes(method))return null;
  if(p.accountId!==accountId)return invalid("Account changed");
  const versions=state.memories.filter(m=>m.personaId===p.personaId&&m.id===p.id).sort((a,b)=>b.version-a.version);
  if(method.startsWith("ai.memory")&&!state.personas.some(x=>x.id===p.personaId))return invalid("Unknown persona");
  if(method==="ai.memoryList")return okay(state.memories.filter(m=>m.personaId===p.personaId&&m.status==="active"&&(!p.kind||m.kind===p.kind)));
  if(method==="ai.memoryDetail")return okay(versions);
  if(method==="ai.memorySources"){
    const allowed=state.conversations.filter(c=>c.personaId===p.personaId||state.groups.find(g=>g.id===c.id)?.participants.some(x=>x.id===p.personaId));
    if(p.conversationId&&!allowed.some(c=>c.id===p.conversationId))return invalid("Source belongs to another persona");
    return okay(p.conversationId?state.messages.filter(m=>m.conversationId===p.conversationId):allowed);
  }
  if(method==="ai.memorySave"){
    const old=state.memories.filter(m=>m.id===p.memory.id&&m.personaId===p.personaId).sort((a,b)=>b.version-a.version)[0];
    if((old?.version??0)!==p.expectedVersion||old&&old.status!=="active"||p.memory.personaId!==p.personaId||p.memory.accountId!==accountId)return invalid("Memory changed. Reload before saving.");
    if(old)old.status="superseded";
    const result={...p.memory,version:p.expectedVersion+1,updatedAt:new Date().toISOString(),createdAt:old?.createdAt??new Date().toISOString()};state.memories.push(result);return okay(result);
  }
  if(method==="ai.memoryDelete"){
    if(versions[0]?.version!==p.expectedVersion)return invalid("Memory changed");
    for(const share of state.echoShares??[])if(share.memoryId===p.id&&share.personaId===p.personaId){delete share.content;delete share.payloadJSON;share.sourceRefs=[];}for(const m of versions){m.status="deleted";m.content="";m.sources=[];delete m.provenance;delete m.expiredAt;}for(const proposal of state.processingProposals??[])if(proposal.personaId===p.personaId&&(proposal.acceptedMemoryId===p.id||proposal.targetId===p.id)){proposal.status="deleted";delete proposal.memory;const task=state.processingJobs?.find(j=>j.id===proposal.taskId);if(task)delete task.result;}return okay({deleted:true});
  }
  if(method==="ai.assignConversationPersona"){
    const c=state.conversations.find(c=>c.id===p.conversationId&&c.ownership==="unresolved");
    if(!c)return invalid("Not an unresolved conversation");c.ownership="single";c.personaId=p.personaId;return okay({saved:true});
  }
  if(method==="ai.exportBackup"){
    const payload={accountId,exportedAt:new Date().toISOString(),providers:state.providers.map(p=>({...p,hasKey:undefined})),personas:state.personas,conversations:state.conversations,messages:state.messages,groups:state.groups,rounds:Object.values(state.rounds),discussions:state.discussions,conversationModels:state.conversationModels,memories:state.memories,contexts:state.contexts??[],contextSnapshots:[],processingConfigs:state.processingConfigs??[],processingJobs:state.processingJobs??[],processingProposals:state.processingProposals??[],echoConfig:state.echoConfig??{accountId,readEnabled:false,writeEnabled:false,apiAttempts:0},echoShares:state.echoShares??[],echoSnapshots:(state.echoSnapshots??[]).map(s=>({...s,contextJSON:undefined})),messageOrdinals:Object.fromEntries(state.messages.map(m=>[m.id,m.ordinal]))};
    const document={format:"parlor-native-backup",version:4,schemaVersion:9,checksum:await digest(payload),payload};
    if(p.share){sessionStorage.setItem("eo-parlor-shared-backup",JSON.stringify(document));return okay({shared:true});}return okay(document);
  }
  const d=p.document;
  if(!p.confirmReplace||d?.format!=="parlor-native-backup"||!(d.version===1&&d.schemaVersion===6||d.version===2&&d.schemaVersion===7||d.version===3&&d.schemaVersion===8||d.version===4&&d.schemaVersion===9)||d.payload.accountId!==accountId||d.checksum!==await digest(d.payload))return invalid("Invalid backup or account");
  Object.assign(state,structuredClone(d.payload));state.rounds=Object.fromEntries(d.payload.rounds.map(r=>[r.id,r]));if(state.echoConfig){state.echoConfig.readEnabled=false;state.echoConfig.writeEnabled=false;}state.persona=state.personas.find(p=>p.id==="sebastian")??state.personas[0];for(const c of state.processingConfigs??[])c.automatic=false;for(const provider of state.providers){provider.enabled=false;provider.hasKey=false;}
  return okay({restored:true});
}
