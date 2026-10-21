import {NextResponse} from "next/server";
import {currentNativeAccount} from "@/lib/native-account";
import {apiError} from "@/lib/api";
import {HttpError} from "@/lib/errors";
import {withFoodReadOnlyRepository} from "@/lib/repositories";
import {getFoodDrinkHome} from "@/lib/services/food-drink-home";
import {listFoodLogs} from "@/lib/services/food";
import {listDrinkLogs} from "@/lib/services/drink";
import {dateRange,shiftDate} from "@/lib/time";
import {validateFoodSnapshot} from "@/lib/food-readonly";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){
  try {
    const account=await currentNativeAccount();
    if(!account)throw new HttpError("Please sign in",401);
    const snapshot=await withFoodReadOnlyRepository(async()=>{
      const home=await getFoodDrinkHome(),from=shiftDate(home.date,-29),range={from:dateRange(from).from,to:dateRange(home.date).to,limit:500};
      const [foods,drinks]=await Promise.all([listFoodLogs(range),listDrinkLogs(range)]);
      return validateFoodSnapshot({format:"eo-food-readonly-v1",accountId:account.id,capturedAt:new Date().toISOString(),home,foods,drinks,window:{from,to:home.date,foodComplete:foods.length<500,drinkComplete:drinks.length<500}},account.id);
    });
    return NextResponse.json(snapshot,{headers:{"Cache-Control":"no-store"}});
  }catch(error){const response=apiError(error);response.headers.set("Cache-Control","no-store");return response;}
}
