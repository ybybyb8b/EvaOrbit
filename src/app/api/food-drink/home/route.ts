import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getFoodDrinkHome } from "@/lib/services/food-drink-home";

export const runtime = "nodejs";
export async function GET() {
  try { return NextResponse.json(await getFoodDrinkHome()); }
  catch (error) { return apiError(error); }
}
