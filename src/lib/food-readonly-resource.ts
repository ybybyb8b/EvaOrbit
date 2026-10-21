import type {FoodPlace,FoodLibraryItem,FoodPlaceDetail} from "./types";

export type FoodCatalogSnapshot={places:FoodPlace[];library:FoodLibraryItem[];placesComplete:boolean;libraryComplete:boolean};
export type FoodResourceKind="catalog"|"place"|"item";
export type FoodReadonlyResource={format:"eo-food-resource-v1";accountId:string;kind:FoodResourceKind;key:string;capturedAt:string;data:FoodCatalogSnapshot|FoodPlaceDetail|FoodLibraryItem|null};
export function foodResourceKey(kind:string,key:string){
  if(kind==="catalog"&&key==="current"||(kind==="place"||kind==="item")&&/^[1-9][0-9]*$/.test(key)&&Number.isSafeInteger(Number(key)))return {kind:kind as FoodResourceKind,key};
  throw new Error("Invalid Food resource");
}
export function validateFoodResource(value:FoodReadonlyResource,accountId:string,kind:FoodResourceKind,key:string){
  foodResourceKey(kind,key);
  if(!value||value.format!=="eo-food-resource-v1"||value.accountId!==accountId||value.kind!==kind||value.key!==key||!Number.isFinite(Date.parse(value.capturedAt)))throw new Error("Food resource does not match the account or request");
  const data=value.data;
  if(kind==="catalog"){
    const catalog=data as FoodCatalogSnapshot;
    if(!catalog||!Array.isArray(catalog.places)||catalog.places.length>200||!Array.isArray(catalog.library)||catalog.library.length>100||typeof catalog.placesComplete!=="boolean"||typeof catalog.libraryComplete!=="boolean")throw new Error("Incomplete Food catalog");
    for(const rows of [catalog.places,catalog.library])if(rows.some(row=>!Number.isSafeInteger(row.id)||row.id<=0||typeof row.name!=="string")||new Set(rows.map(row=>row.id)).size!==rows.length)throw new Error("Invalid Food catalog records");
  }else if(kind==="item"&&data!==null){
    const item=data as FoodLibraryItem;
    if(item.id!==Number(key)||typeof item.name!=="string"||typeof item.referenceType!=="string")throw new Error("Incomplete Food Library item");
  }else if(data!==null){
    const detail=data as FoodPlaceDetail;
    if(!detail?.place||detail.place.id!==Number(key)||typeof detail.place.name!=="string"||![detail.dishes,detail.drinkMenu,detail.recentFoodLogs,detail.recentDrinkLogs,detail.packagedFood].every(Array.isArray))throw new Error("Incomplete Food place detail");
    if([...detail.dishes,...detail.drinkMenu].some(row=>row.foodPlaceId!==Number(key)))throw new Error("Place menu belongs to another place");
  }
  const limit=kind==="catalog"?8*1024*1024:512*1024;
  if(new TextEncoder().encode(JSON.stringify(value)).length>limit)throw new Error("Food resource exceeds the cache limit");
  return value;
}
