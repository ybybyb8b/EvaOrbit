import { NextRequest,NextResponse } from "next/server";
import { apiError,parseId } from "@/lib/api";
import { getFoodPlaceDetail,removeFoodPlace,updateFoodPlace } from "@/lib/services/food";
import { parseFoodPlacePatch } from "@/lib/validation";
type Context={params:Promise<{id:string}>};
export async function GET(_:NextRequest,{params}:Context){try{const item=await getFoodPlaceDetail(parseId((await params).id));return item?NextResponse.json(item):NextResponse.json({error:"店铺不存在"},{status:404});}catch(error){return apiError(error);}}
export async function PATCH(request:NextRequest,{params}:Context){try{const item=await updateFoodPlace(parseId((await params).id),parseFoodPlacePatch(await request.json()));return item?NextResponse.json(item):NextResponse.json({error:"店铺不存在"},{status:404});}catch(error){return apiError(error);}}
export async function DELETE(_:NextRequest,{params}:Context){try{const result=await removeFoodPlace(parseId((await params).id));return result?NextResponse.json(result):NextResponse.json({error:"店铺不存在"},{status:404});}catch(error){return apiError(error);}}
