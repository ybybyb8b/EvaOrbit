import {NextResponse} from "next/server";
import {currentNativeAccount} from "@/lib/native-account";
import {apiError} from "@/lib/api";
import {HttpError} from "@/lib/errors";
import {withFoodReadOnlyRepository} from "@/lib/repositories";
import {listFoodPlaces,searchFoodLibrary,getFoodPlaceDetail,getFoodLibraryItem} from "@/lib/services/food";
import {foodResourceKey,validateFoodResource} from "@/lib/food-readonly-resource";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(_:Request,{params}:{params:Promise<{kind:string;key:string}>}){
  try{
    const account=await currentNativeAccount();
    if(!account)throw new HttpError("Please sign in",401);
    let resource;try{const {kind,key}=await params;resource=foodResourceKey(kind,key);}catch{throw new HttpError("Invalid Food resource",400);}
    const {kind,key}=resource;
    const data=await withFoodReadOnlyRepository(async()=>{
      if(kind==="place")return getFoodPlaceDetail(Number(key));
      if(kind==="item")return getFoodLibraryItem(Number(key));
      const [places,library]=await Promise.all([listFoodPlaces("",{limit:200}),searchFoodLibrary("","",{limit:100})]);
      return {places,library,placesComplete:places.length<200,libraryComplete:library.length<100};
    });
    const value=validateFoodResource({format:"eo-food-resource-v1",accountId:account.id,kind,key,capturedAt:new Date().toISOString(),data},account.id,kind,key);
    return NextResponse.json(value,{headers:{"Cache-Control":"no-store"}});
  }catch(error){const response=apiError(error);response.headers.set("Cache-Control","no-store");return response;}
}
