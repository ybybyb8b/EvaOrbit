import {NextResponse,type NextRequest} from "next/server";
import {apiError,parseId} from "@/lib/api";
import {parseSubscriptionPurchase} from "@/lib/validation";
import {updateSubscriptionPurchase} from "@/lib/services/subscription";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string;paymentId:string}>};
export async function PATCH(request:NextRequest,{params}:Context){
  try{
    const {id,paymentId}=await params,body=await request.json();
    return NextResponse.json(await updateSubscriptionPurchase(parseId(id),parseId(paymentId),parseSubscriptionPurchase(body),parseSubscriptionPurchase(body?.original)));
  }catch(error){return apiError(error);}
}
