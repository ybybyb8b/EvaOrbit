import { NextRequest,NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createFoodDish,listFoodDishes } from "@/lib/services/food";
import { parseFoodDish } from "@/lib/validation";
export async function GET(request:NextRequest){try{const p=request.nextUrl.searchParams;return NextResponse.json(await listFoodDishes(p.get("q")??"",{foodPlaceId:p.get("foodPlaceId")?Number(p.get("foodPlaceId")):undefined,recommended:p.get("recommended")===null?undefined:p.get("recommended")==="true",limit:p.get("limit")?Number(p.get("limit")):undefined}));}catch(error){return apiError(error);}}
export async function POST(request:NextRequest){try{return NextResponse.json(await createFoodDish(parseFoodDish(await request.json())),{status:201});}catch(error){return apiError(error);}}
