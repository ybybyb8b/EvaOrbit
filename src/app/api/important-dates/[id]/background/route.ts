import { NextRequest,NextResponse } from "next/server";
import { apiError,parseId } from "@/lib/api";
import { getImportantDateBackground } from "@/lib/services/important-dates";
export const runtime="nodejs";
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{
    const version=request.nextUrl.searchParams.get("v")??"";
    if(!/^[a-f0-9]{32}$/.test(version))return NextResponse.json({error:"背景版本无效"},{status:400});
    const image=await getImportantDateBackground(parseId((await params).id),version);
    return image?NextResponse.json({image},{headers:{"Cache-Control":"private, max-age=31536000, immutable"}}):NextResponse.json({error:"背景不存在"},{status:404});
  }catch(error){return apiError(error);}
}
