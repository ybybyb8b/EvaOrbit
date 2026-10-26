import {NextResponse,type NextRequest} from "next/server";
import {apiError,parseId} from "@/lib/api";
import {parseSubscriptionPurchase} from "@/lib/validation";
import {recordSubscriptionPurchase} from "@/lib/services/subscription";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
export async function POST(request:NextRequest,{params}:Context){try{return NextResponse.json(await recordSubscriptionPurchase(parseId((await params).id),parseSubscriptionPurchase(await request.json())),{status:201});}catch(error){return apiError(error);}}
