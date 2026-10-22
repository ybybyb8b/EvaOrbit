import "server-only";
import {withRelationsReadOnlyRepository} from "../repositories";
import {getRelationPersonDetail,listRelationPeople} from "./relations";
import {detectAvatarImage} from "../avatar";
import {readRelationPhoto} from "./relation-photo";
import {validateRelationsSnapshot} from "../relations-readonly";

export async function getRelationsReadonlySnapshot(accountId:string){return withRelationsReadOnlyRepository(async()=>{
  // Archived people stay available as names/selected parties in historical events.
  const people=await listRelationPeople({includeArchived:true});
  if(people.length>100)throw new Error("Relations exceeds the 100-person acceptance limit; previous cache preserved");
  const details=[];
  for(const person of people){
    const detail=await getRelationPersonDetail(person.id);
    if(!detail)throw new Error("Relations changed during download; previous cache preserved");
    if(person.photoPath){const image=await readRelationPhoto(person.id);if(image&&(image.bytes.length>4*1024*1024||!detectAvatarImage(image.bytes)))throw new Error("Invalid relation photo; previous cache preserved");person.photoPath=image?`data:${image.mime};base64,${Buffer.from(image.bytes).toString("base64")}`:null;}
    detail.person={...detail.person,photoPath:person.photoPath};
    details.push(detail);
  }
  return validateRelationsSnapshot({format:"eo-relations-readonly-v1",accountId,capturedAt:new Date().toISOString(),people,details},accountId);
});}
