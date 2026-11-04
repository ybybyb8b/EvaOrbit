import {NextResponse,type NextRequest} from "next/server";
import {apiError,parseId} from "@/lib/api";
import {dateOnly,ValidationError} from "@/lib/validation";
import {updateSubscriptionPaymentDate} from "@/lib/services/subscription";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string;paymentId:string}>};
export async function PATCH(request:NextRequest,{params}:Context){try{
  const {id,paymentId}=await params,body=await request.json();
  if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).some(key=>!["paidOn","expectedPaidOn"].includes(key)))throw new ValidationError("仅支持修正实际付款日期");
  return NextResponse.json(await updateSubscriptionPaymentDate(parseId(id),parseId(paymentId),dateOnly(body.paidOn,"实际付款日期"),dateOnly(body.expectedPaidOn,"原付款日期")));
}catch(error){return apiError(error);}}
