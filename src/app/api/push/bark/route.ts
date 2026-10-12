import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getBarkStatus, saveBarkConnection, testBarkConnection } from "@/lib/services/bark";
export const runtime="nodejs";
export async function GET(){try{return NextResponse.json(await getBarkStatus());}catch(error){return apiError(error);}}
export async function PUT(request:Request){try{return NextResponse.json(await saveBarkConnection(await request.json()));}catch(error){return apiError(error);}}
export async function POST(){try{return NextResponse.json(await testBarkConnection());}catch(error){return apiError(error);}}
