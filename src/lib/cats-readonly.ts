import type {CatFoodSummary,CatMeasurement,CatMedication,CatRoutine,CatTimelineEntry,Pet,Reminder} from "./types";

export type CatsDashboard={pets:Array<{pet:Pet;latest:CatTimelineEntry|null;nextRoutine:CatRoutine|null}>;household:Array<{routine:CatRoutine;latest:CatTimelineEntry|null}>;routines:CatRoutine[];oneTimeTasks:Reminder[];timeline:CatTimelineEntry[]};
export type CatDetail={pet:Pet;timeline:CatTimelineEntry[];reminders:Reminder[];routines:CatRoutine[];medications:CatMedication[];measurements:CatMeasurement[]};
export type CatsReadonlySnapshot={
  format:"eo-cats-readonly-v1";accountId:string;capturedAt:string;
  dashboard:CatsDashboard;details:CatDetail[];foods:CatFoodSummary[];
  records:Array<{kind:CatTimelineEntry["kind"];id:number;record:Record<string,unknown>}>;
};
const kinds=["event","symptom","vet_visit","medication","measurement"];
export function validateCatsSnapshot(value:CatsReadonlySnapshot,accountId:string){
  const fail=()=>{throw new Error("Invalid or incomplete Cats snapshot; previous cache preserved");};
  if(!value||value.format!=="eo-cats-readonly-v1"||value.accountId!==accountId||!Number.isFinite(Date.parse(value.capturedAt)))fail();
  const rows=(value:unknown,max:number)=>{if(!Array.isArray(value)||value.length>max)fail();return value as Array<Record<string,unknown>>;};
  const id=(value:unknown)=>Number.isSafeInteger(value)&&Number(value)>0;
  const pets=rows(value.dashboard?.pets,50).map(row=>row.pet as Pet),petIds=new Set(pets.map(p=>p.id));
  if(petIds.size!==pets.length||pets.some(p=>!id(p.id)||typeof p.name!=="string"||typeof p.isActive!=="boolean"||p.avatarUrl&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(p.avatarUrl)))fail();
  for(const name of ["household","routines","oneTimeTasks","timeline"] as const)rows(value.dashboard?.[name],2000);
  const details=rows(value.details,50) as unknown as CatDetail[];
  if(details.length!==pets.length||new Set(details.map(d=>d.pet.id)).size!==pets.length)fail();
  const timeline=[...value.dashboard.timeline];
  for(const detail of details){
    if(!petIds.has(detail.pet?.id)||JSON.stringify(detail.pet)!==JSON.stringify(pets.find(p=>p.id===detail.pet.id)))fail();
    for(const name of ["timeline","reminders","routines","medications","measurements"] as const)rows(detail[name],2000);
    timeline.push(...detail.timeline);
  }
  const records=rows(value.records,2000) as unknown as CatsReadonlySnapshot["records"],keys=new Set<string>();
  for(const row of records){if(!kinds.includes(row.kind)||!id(row.id)||row.record?.id!==row.id||keys.has(`${row.kind}:${row.id}`)||row.record.petId!==null&&!petIds.has(Number(row.record.petId)))fail();keys.add(`${row.kind}:${row.id}`);}
  for(const row of timeline)if(!kinds.includes(row.kind)||!id(row.id)||!keys.has(`${row.kind}:${row.id}`)||row.petId!==null&&!petIds.has(row.petId)||!Number.isFinite(Date.parse(row.occurredAt)))fail();
  const foods=rows(value.foods,200) as unknown as CatFoodSummary[];
  if(new Set(foods.map(f=>f.id)).size!==foods.length)fail();
  for(const food of foods){if(!id(food.id)||typeof food.name!=="string"||!Number.isFinite(food.stockPackages))fail();for(const purchase of rows(food.purchases,2000))if(!id(purchase.id)||purchase.itemId!==food.id)fail();}
  if(new TextEncoder().encode(JSON.stringify(value)).length>8*1024*1024)throw new Error("Cats snapshot exceeds 8 MiB; previous cache preserved");
  return value;
}

// Only projects an already downloaded snapshot. No network or command fallbacks.
export function readCatsSnapshot(snapshot:CatsReadonlySnapshot,path:string,init?:RequestInit){
  if(init?.method&&init.method!=="GET")throw new Error("Cats read-only adapter refused a write");
  if(!path.startsWith("/api/cats")||path.startsWith("//"))throw new Error("Cats read-only path refused");
  const url=new URL(path,"https://local.invalid");let data:unknown;
  if(url.pathname==="/api/cats")data=snapshot.dashboard;
  else if(url.pathname==="/api/cats/food")data=snapshot.foods;
  else if(url.pathname==="/api/cats/pets")data=snapshot.dashboard.pets.map(row=>row.pet);
  else if(url.pathname==="/api/cats/records/suggestions"){
    const petId=Number(url.searchParams.get("petId"));
    data=snapshot.records.filter(row=>row.record.petId===petId).map(row=>({...row.record,kind:row.kind}));
  }else{
    const pet=/^\/api\/cats\/pets\/([1-9][0-9]*)$/.exec(url.pathname),food=/^\/api\/cats\/food\/([1-9][0-9]*)$/.exec(url.pathname),record=/^\/api\/cats\/records\/(event|symptom|vet_visit|medication|measurement)\/([1-9][0-9]*)$/.exec(url.pathname);
    if(pet)data=snapshot.details.find(d=>d.pet.id===Number(pet[1]));
    else if(food)data=snapshot.foods.find(f=>f.id===Number(food[1]));
    else if(record)data=snapshot.records.find(r=>r.kind===record[1]&&r.id===Number(record[2]))?.record;
    else throw new Error("Cats read-only path refused");
  }
  return new Response(JSON.stringify(data??{error:"Not in downloaded Cats snapshot"}),{status:data===undefined?404:200,headers:{"Content-Type":"application/json"}});
}
