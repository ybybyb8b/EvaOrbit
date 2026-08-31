import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { readMediaCover, resetMediaCover, saveMediaCover } from "@/lib/services/media-cover";
import { ValidationError } from "@/lib/validation";

export const runtime="nodejs";export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
export async function GET(_:NextRequest,{params}:Context){try{const cover=await readMediaCover(parseId((await params).id));return cover?new NextResponse(cover.bytes,{headers:{"Content-Type":cover.mime,"Content-Length":String(cover.bytes.byteLength),"Cache-Control":"private, max-age=300","X-Content-Type-Options":"nosniff"}}):new NextResponse(null,{status:404});}catch(error){return apiError(error);}}
export async function POST(request:NextRequest,{params}:Context){try{const file=(await request.formData()).get("file");if(!(file instanceof File))throw new ValidationError("Choose a cover image");return NextResponse.json(await saveMediaCover(parseId((await params).id),file));}catch(error){return apiError(error);}}
export async function DELETE(_:NextRequest,{params}:Context){try{const item=await resetMediaCover(parseId((await params).id));return item?NextResponse.json(item):NextResponse.json({error:"Media not found"},{status:404});}catch(error){return apiError(error);}}
