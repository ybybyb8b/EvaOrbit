import { NextRequest,NextResponse } from "next/server";
import { apiError,parseId } from "@/lib/api";
import { parsePetPatch } from "@/lib/cats-validation";
import { archivePet,getPetDetail,updatePet } from "@/lib/services/cats";
export const runtime="nodejs";type Context={params:Promise<{id:string}>};
export async function GET(_:NextRequest,{params}:Context){try{const detail=await getPetDetail(parseId((await params).id));return NextResponse.json(detail);}catch(error){return apiError(error);}}
export async function PATCH(request:NextRequest,{params}:Context){try{const pet=await updatePet(parseId((await params).id),parsePetPatch(await request.json()));return pet?NextResponse.json(pet):NextResponse.json({error:"Cat not found"},{status:404});}catch(error){return apiError(error);}}
export async function DELETE(_:NextRequest,{params}:Context){try{return await archivePet(parseId((await params).id))?new NextResponse(null,{status:204}):NextResponse.json({error:"Cat not found"},{status:404});}catch(error){return apiError(error);}}
