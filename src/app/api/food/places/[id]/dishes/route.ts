import { NextRequest,NextResponse } from "next/server";
import { apiError,parseId } from "@/lib/api";
import { createFoodDish,listFoodDishes } from "@/lib/services/food";
import { parseFoodDish, ValidationError } from "@/lib/validation";
type Context={params:Promise<{id:string}>};
export async function GET(request:NextRequest,{params}:Context){try{const foodPlaceId=parseId((await params).id);const kind=request.nextUrl.searchParams.get("kind");if(kind&&kind!=="food"&&kind!=="drink")throw new ValidationError("菜单类型不正确");return NextResponse.json(await listFoodDishes(request.nextUrl.searchParams.get("q")??"",{foodPlaceId,kind:(kind??undefined) as "food"|"drink"|undefined}));}catch(error){return apiError(error);}}
export async function POST(request:NextRequest,{params}:Context){try{const foodPlaceId=parseId((await params).id);return NextResponse.json(await createFoodDish(parseFoodDish({...await request.json(),foodPlaceId})),{status:201});}catch(error){return apiError(error);}}
