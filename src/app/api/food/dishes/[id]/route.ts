import { NextRequest,NextResponse } from "next/server";
import { apiError,parseId } from "@/lib/api";
import { getFoodDish,removeFoodDish,updateFoodDish } from "@/lib/services/food";
import { parseFoodDishPatch } from "@/lib/validation";
type Context={params:Promise<{id:string}>};
export async function GET(_:NextRequest,{params}:Context){try{const item=await getFoodDish(parseId((await params).id));return item?NextResponse.json(item):NextResponse.json({error:"菜品不存在"},{status:404});}catch(error){return apiError(error);}}
export async function PATCH(request:NextRequest,{params}:Context){try{const item=await updateFoodDish(parseId((await params).id),parseFoodDishPatch(await request.json()));return item?NextResponse.json(item):NextResponse.json({error:"菜品不存在"},{status:404});}catch(error){return apiError(error);}}
export async function DELETE(_:NextRequest,{params}:Context){try{const result=await removeFoodDish(parseId((await params).id));return result?NextResponse.json(result):NextResponse.json({error:"菜品不存在"},{status:404});}catch(error){return apiError(error);}}
