import { NextRequest,NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { parseRelationPerson } from "@/lib/relations-validation";
import { createRelationPerson,listRelationPeople } from "@/lib/services/relations";
export const runtime="nodejs";
export async function GET(request:NextRequest){try{const status=request.nextUrl.searchParams.get("status");return NextResponse.json(await listRelationPeople({query:request.nextUrl.searchParams.get("q")||undefined,includeArchived:request.nextUrl.searchParams.get("archived")==="true",relationshipStatus:status==="active"||status==="ended"?status:undefined}));}catch(error){return apiError(error);}}
export async function POST(request:NextRequest){try{return NextResponse.json(await createRelationPerson(parseRelationPerson(await request.json())),{status:201});}catch(error){return apiError(error);}}
