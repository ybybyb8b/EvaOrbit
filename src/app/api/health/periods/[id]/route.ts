import { NextRequest,NextResponse } from "next/server";
import { apiError,parseId } from "@/lib/api";
import { deleteMenstrualPeriod,getMenstrualPeriod,updateMenstrualPeriod } from "@/lib/services/period-medication";
import { parseMenstrualPeriodPatch } from "@/lib/validation";
export const runtime="nodejs";type Context={params:Promise<{id:string}>};
export async function GET(_:NextRequest,{params}:Context){try{const item=await getMenstrualPeriod(parseId((await params).id));return item?NextResponse.json(item):NextResponse.json({error:"Period not found"},{status:404});}catch(error){return apiError(error);}}
export async function PATCH(request:NextRequest,{params}:Context){try{const item=await updateMenstrualPeriod(parseId((await params).id),parseMenstrualPeriodPatch(await request.json()));return item?NextResponse.json(item):NextResponse.json({error:"Period not found"},{status:404});}catch(error){return apiError(error);}}
export async function DELETE(_:NextRequest,{params}:Context){try{return await deleteMenstrualPeriod(parseId((await params).id))?new NextResponse(null,{status:204}):NextResponse.json({error:"Period not found"},{status:404});}catch(error){return apiError(error);}}
