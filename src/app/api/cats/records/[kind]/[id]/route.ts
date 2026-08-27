import { NextRequest,NextResponse } from "next/server";
import { apiError,parseId } from "@/lib/api";
import { parseCatRecord } from "@/lib/cats-validation";
import { deleteCatRecord,getCatRecord,updateCatRecord } from "@/lib/services/cats";
import type { CatRecordKind } from "@/lib/types";
import { ValidationError } from "@/lib/validation";
export const runtime="nodejs";type Context={params:Promise<{kind:string;id:string}>};
function kind(value:string):CatRecordKind{if(!["event","symptom","vet_visit","medication","measurement"].includes(value))throw new ValidationError("Record type is invalid");return value as CatRecordKind;}
export async function GET(_:NextRequest,{params}:Context){try{const p=await params;const item=await getCatRecord(kind(p.kind),parseId(p.id));return item?NextResponse.json(item):NextResponse.json({error:"Record not found"},{status:404});}catch(error){return apiError(error);}}
export async function PATCH(request:NextRequest,{params}:Context){try{const p=await params;const type=kind(p.kind);const parsed=parseCatRecord(await request.json(),type);const item=await updateCatRecord(type,parseId(p.id),parsed.record);return item?NextResponse.json(item):NextResponse.json({error:"Record not found"},{status:404});}catch(error){return apiError(error);}}
export async function DELETE(_:NextRequest,{params}:Context){try{const p=await params;return await deleteCatRecord(kind(p.kind),parseId(p.id))?new NextResponse(null,{status:204}):NextResponse.json({error:"Record not found"},{status:404});}catch(error){return apiError(error);}}
