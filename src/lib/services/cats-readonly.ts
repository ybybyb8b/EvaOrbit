import "server-only";
import {getRepository,withCatsReadOnlyRepository} from "../repositories";
import {getCatsDashboard,getPetDetail} from "./cats";
import {listCatFood} from "./cat-food";
import {readCatAvatar} from "./cat-avatar";
import {validateCatsSnapshot} from "../cats-readonly";

export async function getCatsReadonlySnapshot(accountId:string){return withCatsReadOnlyRepository(async()=>{
  const dashboard=await getCatsDashboard();
  if(dashboard.pets.length>50||dashboard.timeline.length>2000)throw new Error("Cats snapshot exceeds the acceptance limit; cache preserved");
  const details=await Promise.all(dashboard.pets.map(({pet})=>getPetDetail(pet.id)));
  const unique=new Map([...dashboard.timeline,...details.flatMap(d=>d.timeline)].map(row=>[`${row.kind}:${row.id}`,row]));
  if(unique.size>2000)throw new Error("Cats history exceeds the acceptance limit; cache preserved");
  // Bulk record reads avoid a separate Supabase request for every timeline entry.
  const repository=await getRepository(),records:import("../cats-readonly").CatsReadonlySnapshot["records"]=[];
  const events=await repository.listCatEvents(null);
  records.push(...events.map(record=>({kind:"event" as const,id:record.id,record:{...record}})));
  for(const {pet} of dashboard.pets){
    const groups=await Promise.all([repository.listCatEvents(pet.id),repository.listCatSymptoms(pet.id),repository.listCatVetVisits(pet.id),repository.listCatMedications(pet.id),repository.listCatMeasurements(pet.id)]);
    const kinds=["event","symptom","vet_visit","medication","measurement"] as const;
    groups.forEach((rows,index)=>records.push(...rows.map(record=>({kind:kinds[index],id:record.id,record:{...record}}))));
  }
  const foods=await listCatFood();
  // Embed authenticated avatar bytes; the bundled UI must not load protected remote URLs.
  for(const {pet} of dashboard.pets){
    if(pet.avatarUrl){const image=await readCatAvatar(pet.id);if(image&&image.bytes.length>4*1024*1024)throw new Error("Cat photo exceeds the cache limit");pet.avatarUrl=image?`data:${image.mime};base64,${Buffer.from(image.bytes).toString("base64")}`:"";}
    const detail=details.find(d=>d.pet.id===pet.id)!;detail.pet={...pet};
  }
  return validateCatsSnapshot({format:"eo-cats-readonly-v1",accountId,capturedAt:new Date().toISOString(),dashboard,details,records,foods},accountId);
});}
