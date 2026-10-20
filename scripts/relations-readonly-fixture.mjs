import fs from 'node:fs/promises';
import path from 'node:path';
export async function seedRelations(){
 const {getRepository}=await import('../src/lib/repositories/index.ts');
 const {createRelationEvent,settleAdvance}=await import('../src/lib/services/relations.ts');
 const {dateInEvaOrbit,dateRange}=await import('../src/lib/time.ts');
 const r=await getRepository(),today=dateInEvaOrbit(),when=dateRange(today).from;
 const person=(name,extra={})=>r.createRelationPerson({name,nickname:null,relationLabel:'Friend',closenessRank:4,relationshipStatus:'active',birthday:null,likes:'Coffee',avoid:null,note:'Offline profile',...extra});
 const alice=await person('Alice Canary',{nickname:'Ali'}),bob=await person('Bob Canary',{relationshipStatus:'ended'}),carol=await person('Carol Archived');
 const expense=await createRelationEvent({eventType:'expense',title:'Shared dinner canary',note:'Group activity once per person',occurredAt:when,occurredHasExplicitTime:false,currency:'CNY',totalAmountMinor:12000,isInPerson:true,parties:[{key:'self',partyType:'self',personId:null,shareAmountMinor:4000,paidAmountMinor:12000},{key:'a',partyType:'person',personId:alice.id,shareAmountMinor:4000,paidAmountMinor:0},{key:'b',partyType:'person',personId:bob.id,shareAmountMinor:4000,paidAmountMinor:0}],items:[{label:'Dinner',amountMinor:12000,sortOrder:0}],flows:[{fromKey:'self',toKey:'a',flowType:'advance',amountMinor:4000,settlesFlowId:null,note:null},{fromKey:'self',toKey:'b',flowType:'advance',amountMinor:4000,settlesFlowId:null,note:null}]});
 const advance=expense.flows.find(row=>row.toPartyId===expense.parties.find(p=>p.personId===alice.id).id);
 await settleAdvance(advance.id,{amountMinor:1000,occurredAt:when,occurredHasExplicitTime:false,note:'Partial repayment canary'});
 await createRelationEvent({eventType:'gift',title:'Archived person gift',note:null,occurredAt:when,occurredHasExplicitTime:false,currency:'CNY',totalAmountMinor:null,isInPerson:false,parties:[{key:'self',partyType:'self',personId:null,shareAmountMinor:null,paidAmountMinor:null},{key:'c',partyType:'person',personId:carol.id,shareAmountMinor:null,paidAmountMinor:null}],items:[],flows:[{fromKey:'self',toKey:'c',flowType:'gift',amountMinor:500,settlesFlowId:null,note:null}]});
 await r.createPersonMemoryNote(alice.id,'Literal memory note <script>kept as text</script>');
 await r.updateRelationPerson(carol.id,{archivedAt:new Date().toISOString()});
 const photos=process.env.EVAORBIT_RELATION_PHOTO_DIR;await fs.mkdir(photos,{recursive:true});await fs.writeFile(path.join(photos,`${alice.id}.png`),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhAAAAABJRU5ErkJggg==','base64'));
 await r.updateRelationPerson(alice.id,{photoPath:`/api/relations/people/${alice.id}/photo?type=png&v=1`});
 return {alice,bob,carol,expense,advance};
}
