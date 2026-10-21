// Imported only by isolated test processes configured with temporary SQLite/avatar paths.
import {createPet,createCatRecord} from "../src/lib/services/cats.ts";
import {createCatRoutine} from "../src/lib/services/cat-routine.ts";
import {createCatFoodItem,createCatFoodPurchase} from "../src/lib/services/cat-food.ts";
import {parsePet,parseCatRecord,parseCatRoutine} from "../src/lib/cats-validation.ts";
import {parseCatFoodItem,parseCatFoodPurchase} from "../src/lib/cat-food-validation.ts";
import {saveCatAvatar} from "../src/lib/services/cat-avatar.ts";
import {getRepository} from "../src/lib/repositories/index.ts";

export async function seedCats(){
  const pet=await createPet(parsePet({name:"Offline Luna",birthday:"2020-05-06",notes:"Profile canary"}));
  const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6hUAAAAASUVORK5CYII=","base64");
  await saveCatAvatar(pet.id,new File([png],"cat.png",{type:"image/png"}));
  for(const kind of ["event","symptom","vet_visit","medication","measurement"]){
    const parsed=parseCatRecord({kind,petId:pet.id,title:`${kind} canary`,eventType:"care",occurredAt:"2026-10-18",occurredHasExplicitTime:false,startedAt:"2026-10-17",startedHasExplicitTime:false,reason:"Vet canary",name:"Medication canary",measurementType:"Weight",value:4.2,unit:"kg"});
    await createCatRecord(kind,parsed.record);
  }
  const routine=await createCatRoutine(parseCatRoutine({scope:"cat",petId:pet.id,title:"Nail trim canary",intervalValue:2,intervalUnit:"week",firstDueDate:"2026-10-20",nextDueDate:"2026-10-20",configuredReminderTime:"10:00"}));
  await (await getRepository()).createReminder({title:"One time canary",targetType:"cat",targetId:pet.id,sourceType:null,sourceId:null,scheduleType:"one_time",startsAt:"2026-10-21T02:00:00Z",nextDueAt:"2026-10-21T02:00:00Z",dueHasExplicitTime:false,intervalValue:null,intervalUnit:null,timesOfDay:[],endsAt:null,timezone:"Asia/Shanghai",note:"Reminder canary",leadTimeMinutes:0,repeatWhileOverdue:false,status:"scheduled",isActive:true});
  const item=await createCatFoodItem(parseCatFoodItem({name:"Offline kibble",brand:"Canary",category:"dry",lowStockThresholdPackages:1}));
  await createCatFoodPurchase(parseCatFoodPurchase({purchasedOn:"2026-10-01",packageCount:2,remainingPackageCount:1,amountPerPackage:1000,amountUnit:"g",paidAmount:100,merchant:"Canary shop"},item.id));
  return {pet,item,routine};
}
