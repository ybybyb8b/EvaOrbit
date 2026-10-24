import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { listSoftwareLibrary, createSoftwareLibraryEntry } from "@/lib/services/software-library";
export const runtime="nodejs";
export async function GET(){try{return NextResponse.json(await listSoftwareLibrary());}catch(error){return apiError(error);}}
export async function POST(request:NextRequest){try{return NextResponse.json(await createSoftwareLibraryEntry(await request.json()),{status:201});}catch(error){return apiError(error);}}
