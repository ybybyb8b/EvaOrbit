import { NextRequest,NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createFoodLog,listFoodLogs } from "@/lib/services/food";
import { parseNewFoodLog } from "@/lib/validation";
export const runtime="nodejs";
export async function GET(request:NextRequest){try{const p=request.nextUrl.searchParams;return NextResponse.json(await listFoodLogs({date:p.get("date")||undefined,query:p.get("q")||undefined,mealType:p.get("mealType")||undefined,foodPlaceId:p.get("foodPlaceId")?Number(p.get("foodPlaceId")):undefined,foodDishId:p.get("foodDishId")?Number(p.get("foodDishId")):undefined,limit:p.get("limit")?Number(p.get("limit")):undefined}));}catch(error){return apiError(error);}}
export async function POST(request:NextRequest){try{return NextResponse.json(await createFoodLog(parseNewFoodLog(await request.json())),{status:201});}catch(error){return apiError(error);}}
