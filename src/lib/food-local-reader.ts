import type {FoodReadonlyResource,FoodResourceKind,FoodCatalogSnapshot} from "./food-readonly-resource";
import type {FoodPlaceDetail,FoodLibraryItem} from "./types";
import {placeSupports} from "./place-menu.ts";
import {catalogServingKcal,type FoodCatalogItem} from "./food-catalog.ts";

// GET-only projection of downloaded data into the existing Web components' read contract.
export function createFoodLocalReader(load:(kind:FoodResourceKind,key:string)=>Promise<FoodReadonlyResource|null>){
  return async(path:string,init?:{signal?:AbortSignal}):Promise<Response>=>{
    if(!path.startsWith("/api/food/"))throw new Error("Local Food reader refused this path");
    const url=new URL(path,"https://eo-local.invalid"),params=url.searchParams;
    const get=async(kind:FoodResourceKind,key:string)=>{init?.signal?.throwIfAborted();const resource=await load(kind,key);init?.signal?.throwIfAborted();if(!resource)throw new Error("This content has not been downloaded. Connect to load it.");return resource.data;};
    const respond=(data:unknown)=>new Response(JSON.stringify(data??{error:"This record no longer exists"}),{status:data===null?404:200,headers:{"Content-Type":"application/json"}});
    const detail=/^\/api\/food\/places\/([1-9][0-9]*)$/.exec(url.pathname),item=/^\/api\/food\/library\/([1-9][0-9]*)$/.exec(url.pathname);
    if(detail)return respond(await get("place",detail[1]));
    if(item)return respond(await get("item",item[1]));
    if(!["/api/food/places","/api/food/library","/api/food/catalog"].includes(url.pathname))throw new Error("Local Food reader refused this path");
    const catalog=await get("catalog","current") as FoodCatalogSnapshot,q=(params.get("q")??"").trim().toLocaleLowerCase();
    if(url.pathname==="/api/food/places"){
      const rows=catalog.places.filter(place=>{
        if(q&&![place.name,place.branch,place.city,place.address,place.location,place.category,place.notes].some(value=>(value??"").toLocaleLowerCase().includes(q)))return false;
        if(params.get("purpose")&&!placeSupports(place,params.get("purpose") as "food"|"drink"))return false;
        for(const key of ["kind","scope","serviceType","city","status","category"] as const){const value=params.get(key);if(value&&(place[key]??({kind:"restaurant",scope:"branch",serviceType:"food"}[key as "kind"]??""))!==value)return false;}
        const rating=params.get("rating");return !rating||(rating==="unrated"?!place.rating:place.rating===rating);
      });
      return respond(rows.slice(0,Math.min(200,Math.max(1,Number(params.get("limit"))||200))));
    }
    const placeId=params.get("placeId"),category=params.get("category"),brand=params.get("brand");
    let library:FoodLibraryItem[]=catalog.library;
    let place:FoodPlaceDetail|null=null;
    if(placeId){place=await get("place",placeId) as FoodPlaceDetail|null;library=[...new Map([...(place?.packagedFood?.map(row=>row.item)??[]),...library].map(row=>[row.id,row])).values()];}
    if(url.pathname==="/api/food/library")return respond(library.filter(row=>!row.archivedAt&&(!placeId||!row.foodPlaceId||row.foodPlaceId===Number(placeId))&&(!category||row.category===category)&&(!brand||row.brand===brand)&&(!q||[row.name,row.brand].some(value=>value.toLocaleLowerCase().includes(q)))));
    const kind=params.get("kind");
    if(kind!=="food"&&kind!=="drink")throw new Error("Invalid catalog kind");
    const rows:FoodCatalogItem[]=library.filter(row=>!row.archivedAt&&(kind==="drink"?row.category==="drink":row.category!=="drink")&&(!placeId||!row.foodPlaceId||row.foodPlaceId===Number(placeId))).map(row=>({key:`library:${row.id}`,name:row.name,placeId:row.foodPlaceId??null,placeName:catalog.places.find(place=>place.id===row.foodPlaceId)?.name??"",library:row,servingKcal:catalogServingKcal(row)}));
    for(const menu of kind==="drink"?place?.drinkMenu??[]:place?.dishes??[]){const reference=library.find(row=>row.id===menu.foodLibraryId);rows.push({key:`menu:${menu.id}`,name:menu.name,placeId:menu.foodPlaceId,placeName:place!.place.name,menu,library:reference,servingKcal:catalogServingKcal(reference)});}
    return respond(rows.filter(row=>!q||[row.name,row.placeName,row.library?.brand??""].some(value=>value.toLocaleLowerCase().includes(q))));
  };
}
