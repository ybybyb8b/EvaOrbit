import {NextRequest,NextResponse} from "next/server";
import {apiError,parseId} from "@/lib/api";
import {getMediaSeries,updateMediaSeries} from "@/lib/services/media";
import {parseMediaSeries} from "@/lib/validation";
type Context={params:Promise<{id:string}>};
export async function GET(_:NextRequest,{params}:Context){try{const item=await getMediaSeries(parseId((await params).id));return NextResponse.json(item??{error:"Series not found"},{status:item?200:404});}catch(e){return apiError(e);}}
export async function PATCH(request:NextRequest,{params}:Context){try{const item=await updateMediaSeries(parseId((await params).id),parseMediaSeries(await request.json()).name);return NextResponse.json(item??{error:"Series not found"},{status:item?200:404});}catch(e){return apiError(e);}}
