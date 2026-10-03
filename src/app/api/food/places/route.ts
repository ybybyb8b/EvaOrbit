import { NextRequest,NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createFoodPlace,listFoodPlaces } from "@/lib/services/food";
import { parseFoodPlace, ValidationError } from "@/lib/validation";
import type { FoodPlaceStatus } from "@/lib/types";
export const runtime="nodejs";
export async function GET(request:NextRequest){try{const p=request.nextUrl.searchParams;const purpose=p.get("purpose");if(purpose&&purpose!=="food"&&purpose!=="drink")throw new ValidationError("店铺用途不正确");return NextResponse.json(await listFoodPlaces(p.get("q")??"",{purpose:(purpose??undefined) as "food"|"drink"|undefined,status:(p.get("status")||undefined) as FoodPlaceStatus|undefined,category:p.get("category")||undefined,limit:p.get("limit")?Number(p.get("limit")):undefined}));}catch(error){return apiError(error);}}
export async function POST(request:NextRequest){try{return NextResponse.json(await createFoodPlace(parseFoodPlace(await request.json())),{status:201});}catch(error){return apiError(error);}}
